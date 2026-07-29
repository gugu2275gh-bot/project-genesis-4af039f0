// @ts-nocheck
/**
 * Ponte entre o agente de produção e o motor determinístico de fluxos visuais.
 *
 * Regra de precedência (definida pelo produto):
 *   Se o agente de produção tem um fluxo configurado (pré-handoff e/ou handoff)
 *   com etapa de INÍCIO válida, o FLUXO COMANDA o atendimento — o funil legado
 *   em código (flow-machine / turn-orchestrator / heurísticas de prompt) é
 *   ignorado até o fluxo terminar.
 *
 * Sem fluxo configurado, nada muda: o comportamento legado continua valendo.
 */

import {
  advanceFlow,
  buttonsOf,
  findStartStep,

  mergeFlows,
  startFlow,
  startFlowWithPrefill,
  stepKindOf,
  type FlowCapturedField,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from '../../_shared/flow-engine.ts'
import { advanceFlowTurn } from '../../_shared/flow-turn.ts'
import { localizeTurn } from '../../_shared/flow-i18n.ts'
import { applyVarsToTurn, buildFlowVars, fieldValuesFromAnswers } from '../../_shared/flow-vars.ts'
import { applyRequiredGate } from '../../_shared/flow-required.ts'
import { checkBirthDate } from '../../_shared/flow-birthdate.ts'
import { resolveServiceType } from '../../_shared/service-catalog.ts'
import {
  dropOpeningMessages,
  normalizeIntakeConfig,
  prependIntakeGreeting,
  renderAckMessage,
  prefillFromFieldValues,
  profileNameToFieldValues,
  renderIntakeGreeting,
  runIntake,
  capturedFromFieldValues,
  type IntakeConfig,
} from '../../_shared/flow-intake.ts'

import { getAgentRuntime } from './agent-runtime.ts'
import { cached } from './perf.ts'


export interface VisualFlowPlan {
  enabled: boolean
  steps: FlowStep[]
  preHandoffFlowId: string | null
  handoffFlowId: string | null
  /** Configuração de aproveitamento da 1ª mensagem (aba "Primeira mensagem"). */
  intake: IntakeConfig
}

const EMPTY_PLAN: VisualFlowPlan = {
  enabled: false,
  steps: [],
  preHandoffFlowId: null,
  handoffFlowId: null,
  intake: normalizeIntakeConfig(null),
}

/**
 * Versão dos fluxos (`updated_at`), usada como sufixo das chaves de cache.
 * Assim que o admin salva o fluxo, o cache de etapas/intake é invalidado —
 * antes disso uma alteração podia demorar até 60s para valer no atendimento.
 */
async function fetchFlowVersions(supabase: any, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const clean = ids.filter(Boolean)
  if (!clean.length) return out
  try {
    const { data, error } = await supabase
      .from('ai_agent_flows')
      .select('id, updated_at')
      .in('id', clean)
    if (error) return out
    for (const row of data || []) out[String(row.id)] = String(row.updated_at || '')
  } catch {
    /* silencioso: sem versão, o cache continua valendo por TTL */
  }
  return out
}

async function fetchIntakeConfig(supabase: any, flowId: string | null, version = ''): Promise<IntakeConfig> {
  if (!flowId) return normalizeIntakeConfig(null)
  return await cached<IntakeConfig>(`flow-intake:${flowId}:${version}`, 60_000, async () => {
    const { data, error } = await supabase
      .from('ai_agent_flows')
      .select('intake_config')
      .eq('id', flowId)
      .maybeSingle()
    if (error) {
      console.warn('[VISUAL_FLOW] falha ao carregar intake_config:', error.message)
      return normalizeIntakeConfig(null)
    }
    return normalizeIntakeConfig(data?.intake_config)
  })
}

async function fetchSteps(supabase: any, flowId: string | null, version = ''): Promise<FlowStep[]> {
  if (!flowId) return []
  // Cache de 60s por fluxo+versão: invalidado assim que o admin salva o fluxo.
  return await cached<FlowStep[]>(`flow-steps:${flowId}:${version}`, 60_000, async () => {
    const { data, error } = await supabase
      .from('ai_agent_flow_steps')
      .select('*')
      .eq('flow_id', flowId)
      .order('order_index', { ascending: true })
    if (error) {
      console.warn('[VISUAL_FLOW] falha ao carregar etapas:', error.message)
      return []
    }
    return (data || []) as FlowStep[]
  })

}


/**
 * Monta o grafo executável do agente de produção (pré-handoff + handoff
 * encadeados). Nunca lança: em caso de erro devolve `enabled: false`.
 */
export async function loadVisualFlowPlan(supabase: any): Promise<VisualFlowPlan> {
  try {
    const runtime = getAgentRuntime()
    if (!runtime) return EMPTY_PLAN

    const cfg = runtime.runtimeConfig || {}
    if (cfg.execute_visual_flow === false) return EMPTY_PLAN

    const preId = runtime.flowIds?.pre_handoff || runtime.flowIds?.legacy || null
    const handId = runtime.flowIds?.handoff || null
    if (!preId && !handId) return EMPTY_PLAN

    const versions = await fetchFlowVersions(supabase, [preId, handId].filter(Boolean) as string[])
    const intakeFlowId = preId || handId
    const [preSteps, handSteps, intake] = await Promise.all([
      fetchSteps(supabase, preId, versions[String(preId)] || ''),
      fetchSteps(supabase, handId, versions[String(handId)] || ''),
      fetchIntakeConfig(supabase, intakeFlowId, versions[String(intakeFlowId)] || ''),
    ])
    const steps = mergeFlows(preSteps, handSteps)
    const start = findStartStep(steps)
    // O fluxo não precisa ter uma etapa "INÍCIO": pode começar direto por uma
    // pergunta (inclusive a "Pergunta geral") ou por uma etapa informativa.
    // Só é inválido quando não há etapas ou quando a primeira etapa é "FIM".
    const startKind = start ? stepKindOf(start) : null
    const enabled = !!start && steps.length > 0 && startKind !== 'FIM'

    if (!enabled) {
      console.log('[VISUAL_FLOW] fluxo sem etapa inicial executável — usando funil legado')
      return EMPTY_PLAN
    }


    return { enabled, steps, preHandoffFlowId: preId, handoffFlowId: handId, intake }
  } catch (e) {
    console.warn('[VISUAL_FLOW] erro ao montar plano (fallback legado):', e instanceof Error ? e.message : e)
    return EMPTY_PLAN
  }
}

/** Executa o turno do cliente no grafo (start no 1º turno, advance depois). */
/**
 * Primeiro turno com aproveitamento da 1ª frase do cliente.
 *
 * Extrai nome/localização/intenção/datas, marca as perguntas correspondentes
 * como respondidas e retoma o fluxo na PRIMEIRA pergunta ainda pendente,
 * prefixando uma saudação humana que reconhece os dados aproveitados.
 */
export async function runVisualFlowFirstTurn(
  plan: VisualFlowPlan,
  message: string,
  lang: FlowLang,
  callLLM: ((prompt: string) => Promise<string>) | null,
  supabase?: any,
  opts?: { profileName?: string | null; phone?: string },
): Promise<FlowTurnResult> {
  const logIntake = (payload: Record<string, unknown>) =>
    console.log('[VISUAL_FLOW][INTAKE]', JSON.stringify(payload))

  // Dados conhecidos para as variáveis das mensagens ({nome}, {cidade}…).
  // Vai sendo enriquecido conforme o intake entende mais coisas.
  let knownFields: Record<string, string> = {}

  /** Camada única de saída: idioma da conversa + variáveis resolvidas. */
  const localize = async (turn: FlowTurnResult) => {
    const gated = applyRequiredGate(plan.steps, turn, lang, knownFields)
    const localized = await localizeTurn(gated, lang, { steps: plan.steps, callLLM, supabase, logTag: '[VISUAL_FLOW]' })
    return applyVarsToTurn(localized, buildFlowVars(knownFields, { profileName: opts?.profileName }))
  }


  // Nome do perfil do WhatsApp: usado como dado já conhecido (quando confiável).
  const seed = profileNameToFieldValues(opts?.profileName, opts?.phone || '')
  knownFields = { ...seed }
  const seedPrefill = Object.keys(seed).length
    ? prefillFromFieldValues(plan.steps, seed)
    : {}
  const startWithSeed = (): FlowTurnResult =>
    Object.keys(seedPrefill).length
      ? startFlowWithPrefill(plan.steps, lang, seedPrefill)
      : startFlow(plan.steps, lang)

  if (!plan.intake?.enabled) {
    logIntake({ reason: 'disabled', profile_name: !!seed['contact.full_name'] })
    return await localize(startWithSeed())
  }
  if (!callLLM) {
    logIntake({ reason: 'no_llm', profile_name: !!seed['contact.full_name'] })
    // Sem IA não há tradução, mas as variáveis ({nome}…) precisam sair resolvidas.
    return applyVarsToTurn(startWithSeed(), buildFlowVars(knownFields, { profileName: opts?.profileName }))
  }

  /** Abertura sem aproveitamento: usa a "Saudação padrão" quando configurada. */
  const plainStart = (): FlowTurnResult =>
    prependIntakeGreeting(startWithSeed(), renderIntakeGreeting(plan.intake, lang, seed))

  let intake
  try {
    intake = await runIntake({ message, steps: plan.steps, lang, config: plan.intake, callLLM, seed })
  } catch (e) {
    logIntake({ reason: 'exception', detail: e instanceof Error ? e.message : String(e) })
    return await localize(plainStart())
  }


  knownFields = { ...knownFields, ...(intake.fieldValues || {}) }
  const prefilledCodes = Object.keys(intake.prefilled || {})
  logIntake({
    reason: intake.reason,
    detail: intake.detail,
    fields: intake.fieldValues,
    steps: prefilledCodes,
    greeting: !!intake.greeting,
  })

  // Nada entendido: abertura normal (com a saudação padrão, se configurada).
  if (!prefilledCodes.length && !intake.greeting) return await localize(plainStart())

  const base = prefilledCodes.length
    ? startFlowWithPrefill(plan.steps, lang, intake.prefilled, capturedFromFieldValues(plan.steps, knownFields))
    : startFlow(plan.steps, lang)

  // A saudação personalizada substitui a abertura informativa do fluxo.
  return await localize(prependIntakeGreeting(dropOpeningMessages(base, plan.steps), intake.greeting))
}


export async function runVisualFlowTurn(
  plan: VisualFlowPlan,
  state: FlowRunState,
  message: string,
  lang: FlowLang,
  deps: {
    callLLM?: ((prompt: string) => Promise<string>) | null
    kbSearch?: ((q: string) => Promise<string>) | null
    supabase?: any
  } = {},
): Promise<FlowTurnResult> {
  const localize = async (turn: FlowTurnResult) => {
    const gated = applyRequiredGate(plan.steps, turn, lang)
    const localized = await localizeTurn(gated, lang, {
      steps: plan.steps,
      callLLM: deps.callLLM || null,
      supabase: deps.supabase,
      logTag: '[VISUAL_FLOW]',
    })
    const known = fieldValuesFromAnswers(plan.steps, {
      ...((state?.answers || {}) as Record<string, string>),
      ...(((localized as any)?.state?.answers || {}) as Record<string, string>),
    })
    return applyVarsToTurn(localized, buildFlowVars(known))
  }

  const started = !!state?.current_step
  if (!started) return await localize(startFlow(plan.steps, lang))
  // Reconhecimento humano entre perguntas (ligado por etapa no editor).
  const ack = plan.intake?.enabled
    ? renderAckMessage(plan.intake, lang, nameFromState(plan.steps, state))
    : ''
  const turn = await advanceFlowTurn(plan.steps, state, message, lang, {
    ack,
    callLLM: deps.callLLM || null,
    kbSearch: deps.kbSearch || null,
    logTag: '[VISUAL_FLOW]',
  })
  return await localize(turn)
}


/** Nome já capturado no fluxo, para personalizar o reconhecimento. */
function nameFromState(steps: FlowStep[], state: FlowRunState): string {
  const answers = state?.answers || {}
  for (const step of steps || []) {
    const value = String(answers[step.step_code] ?? '').trim()
    if (!value) continue
    if (String(step.answer_type || '').toUpperCase() === 'NOME') return value
  }
  return ''
}


// ---------------------------------------------------------------------------
// Persistência das respostas nos campos do CRM

const YES_VALUES = new Set(['sim', 'si', 'sí', 'yes', 'oui', 'true', 's', 'y'])
const NO_VALUES = new Set(['nao', 'não', 'no', 'non', 'false', 'n'])

/** Sim/Não explícito. Qualquer outro texto → null (não grava nada). */
function toYesNo(value: string): 'yes' | 'no' | null {
  const v = String(value || '').trim().toLowerCase()
  if (YES_VALUES.has(v)) return 'yes'
  if (NO_VALUES.has(v)) return 'no'
  return null
}


/** Sim/Não → boolean. Devolve null quando a resposta não é claramente sim/não. */
function toBoolOrNull(value: string): boolean | null {
  const v = String(value || '').trim().toLowerCase()
  if (YES_VALUES.has(v)) return true
  if (NO_VALUES.has(v)) return false
  return null
}

/** DD/MM/YYYY (formato único do sistema) → YYYY-MM-DD. Inválido → null. */
function toIsoDateOrNull(value: string): string | null {
  const m = String(value || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!m) {
    const iso = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return iso ? iso[0] : null
  }
  const [, d, mo, y] = m
  const day = Number(d), month = Number(mo), year = Number(y)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Idade em anos → data de nascimento aproximada (ano). Fora de 14..100 → null. */
function ageToBirthYear(value: string): number | null {
  const n = Number(String(value || '').replace(/\D+/g, ''))
  if (!Number.isFinite(n) || n < 14 || n > 100) return null
  return new Date().getUTCFullYear() - n
}

const SERVICE_INTEREST_HINTS: Array<[RegExp, string]> = [
  [/estud|student|estudia|curso|faculdade|master|mestrado/i, 'VISTO_ESTUDANTE'],
  [/trabalh|emprego|job|work|contrato de trabajo|laboral/i, 'VISTO_TRABALHO'],
  [/reagrupa|reagrupaci|family reunif/i, 'REAGRUPAMENTO'],
  [/renova|renew|renovaci/i, 'RENOVACAO_RESIDENCIA'],
  [/nacionalidade por casamento|nacionalidad por matrimonio|casamento|matrimonio|marriage/i, 'NACIONALIDADE_CASAMENTO'],
  [/nacionalidade|nacionalidad|citizenship|cidadania/i, 'NACIONALIDADE_RESIDENCIA'],
  [/comunitari|familiar europeu|eu family/i, 'RESIDENCIA_PARENTE_COMUNITARIO'],
]

function inferServiceInterest(value: string): string | null {
  const v = String(value || '')
  if (v.trim().length < 3) return null
  for (const [re, label] of SERVICE_INTEREST_HINTS) if (re.test(v)) return label
  return null
}

/**
 * Aplica as respostas capturadas (`field_mapping`, explícito ou inferido) nas
 * tabelas do CRM. Cada campo é opcional; um erro em um campo não interrompe os
 * demais nem o fluxo.
 */
export async function applyCapturedFields(
  supabase: any,
  params: { leadId: string; contactId: string; captured: FlowCapturedField[]; outsideProgress?: Record<string, unknown> },
): Promise<void> {
  const { leadId, contactId, captured } = params
  if (!captured?.length) return

  const contactPatch: Record<string, unknown> = {}
  const funnelPatch: Record<string, unknown> = {}
  const leadPatch: Record<string, unknown> = {}
  const outside: Record<string, unknown> = { ...(params.outsideProgress || {}) }
  let outsideTouched = false
  let intentText = ''

  for (const item of captured) {
    const value = String(item?.value ?? '').trim()
    switch (item.field) {
      case 'contact.full_name':
        if (value) {
          contactPatch.full_name = value
          contactPatch.name_source = 'USER_CONFIRMED'
          funnelPatch.name_confirmed = true
        }
        break
      case 'contact.email':
        if (value) {
          contactPatch.email = value
          funnelPatch.email_confirmed = true
        }
        break
      case 'contact.spain_arrival_date': {
        const iso = toIsoDateOrNull(value)
        if (iso) {
          contactPatch.spain_arrival_date = iso
          funnelPatch.entry_date_confirmed = value
        }
        break
      }
      case 'contact.empadronamiento_since': {
        const iso = toIsoDateOrNull(value)
        if (iso) contactPatch.empadronamiento_since = iso
        break
      }
      case 'contact.empadronamiento_city':
        if (value) {
          contactPatch.empadronamiento_city = value
          funnelPatch.empadronado_city = value
        }
        break
      case 'contact.is_empadronado': {
        const b = toBoolOrNull(value)
        if (b !== null) {
          contactPatch.is_empadronado = b
          funnelPatch.empadronado_confirmed = b
        }
        break
      }
      case 'contact.residence_country':
        if (value) {
          contactPatch.residence_country = value
          // NÃO deduz presença na Espanha a partir do país de residência:
          // morar fora não significa não estar na Espanha agora.
        }
        break
      case 'contact.education_level': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.education_level = b ? 'SUPERIOR' : 'NAO_SUPERIOR'
        else if (/^(superior|nao_superior|n[ãa]o_superior|fundamental|medio|m[ée]dio)$/i.test(value)) {
          contactPatch.education_level = value.toUpperCase().replace('Ã', 'A').replace('É', 'E')
        }
        break
      }

      case 'contact.works_remotely': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.works_remotely = b
        const yn = toYesNo(value)
        if (yn) {
          outside.a5_remote = yn
          outsideTouched = true
        }
        break
      }
      case 'contact.has_eu_family_member': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.has_eu_family_member = b
        const yn = toYesNo(value)
        if (yn) {
          outside.a4_eu_family = yn
          outsideTouched = true
        }
        break
      }
      case 'contact.eu_entry_last_6_months': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.eu_entry_last_6_months = b
        const yn = toYesNo(value)
        if (yn) {
          outside.a3_europe_6m = yn
          outsideTouched = true
        }
        break
      }

      case 'contact.birth_date': {
        // Só grava a data REAL informada em DD/MM/AAAA (validada).
        const check = checkBirthDate(value, { declaredAge: outside.a2_age as string })
        if (check.ok && check.iso) {
          contactPatch.birth_date = check.iso
          if (check.age !== null) {
            outside.a2_age = String(check.age)
            outsideTouched = true
          }
        }
        break
      }
      case 'funnel.interest_confirmed':
        if (value) {
          funnelPatch.interest_confirmed = value
          intentText = value
          const svc = inferServiceInterest(value)
          if (svc) {
            leadPatch.service_interest = svc
            leadPatch.interest_confirmed = true
          }
        }
        break
      case 'funnel.location_known': {
        // Sem sim/não claro (ou nome de país), não inventa a localização.
        const yn = toYesNo(value)
        const isSpain = /^(espanha|espa[nñ]a|spain|espagne)$/i.test(value)
        const isCountry = !!value && /^[\p{L}\s.'-]{3,40}$/u.test(value)
        const inSpain = yn ? yn === 'yes' : (isCountry ? isSpain : null)
        if (inSpain !== null) {
          funnelPatch.location_known = inSpain ? 'spain' : 'outside'
          contactPatch.is_in_spain = inSpain
        }
        break
      }


      case 'funnel.entry_date_confirmed': {
        if (value) funnelPatch.entry_date_confirmed = value
        const iso = toIsoDateOrNull(value)
        if (iso) contactPatch.spain_arrival_date = iso
        break
      }
      case 'funnel.empadronado_confirmed': {
        const b = toBoolOrNull(value)
        if (b !== null) {
          funnelPatch.empadronado_confirmed = b
          contactPatch.is_empadronado = b
        }
        break
      }
      case 'funnel.empadronado_city':
        if (value) {
          funnelPatch.empadronado_city = value
          contactPatch.empadronamiento_city = value
        }
        break
      case 'outside.age': {
        const years = Number(String(value).replace(/\D+/g, ''))
        if (Number.isFinite(years) && years >= 14 && years <= 100) {
          outside.a2_age = String(years)
          outsideTouched = true
          // Idade NUNCA vira data de nascimento: `contacts.birth_date` só é
          // gravado com a data real informada pelo cliente (DD/MM/AAAA).
        }
        break
      }
      case 'outside.europe_6m': {
        const yn = toYesNo(value)
        if (yn) {
          outside.a3_europe_6m = yn
          outsideTouched = true
          contactPatch.eu_entry_last_6_months = yn === 'yes'
        }
        break
      }
      case 'outside.eu_family': {
        const yn = toYesNo(value)
        if (yn) {
          outside.a4_eu_family = yn
          outsideTouched = true
          contactPatch.has_eu_family_member = yn === 'yes'
        }
        break
      }
      case 'outside.remote_work': {
        const yn = toYesNo(value)
        if (yn) {
          outside.a5_remote = yn
          outsideTouched = true
          contactPatch.works_remotely = yn === 'yes'
        }
        break
      }

      case 'lead.service_interest': {
        const svc = inferServiceInterest(value)
        if (svc) {
          leadPatch.service_interest = svc
          leadPatch.interest_confirmed = true
        }
        if (value) {
          funnelPatch.interest_confirmed = value
          intentText = value
        }
        break
      }
      default:
        // Campo desconhecido: a resposta continua salva em `answers`.
        break
    }
  }

  if (outsideTouched) funnelPatch.outside_spain_progress = outside

  // Serviço: resolvido contra o catálogo real (`service_types`). Sem
  // correspondência confiável, nada é gravado.
  if (intentText) {
    try {
      const match = await resolveServiceType(supabase, intentText)
      if (match) {
        leadPatch.service_type_id = match.service_type_id
        leadPatch.interest_confirmed = true
        if (match.service_interest) leadPatch.service_interest = match.service_interest
      }
    } catch (e) {
      console.warn('[VISUAL_FLOW] falha ao resolver serviço:', e instanceof Error ? e.message : e)
    }
  }


  try {
    if (Object.keys(contactPatch).length) {
      await supabase.from('contacts').update(contactPatch).eq('id', contactId)
    }
  } catch (e) {
    console.warn('[VISUAL_FLOW] falha ao atualizar contato:', e instanceof Error ? e.message : e)
  }

  try {
    if (Object.keys(leadPatch).length) {
      await supabase.from('leads').update(leadPatch).eq('id', leadId)
    }
  } catch (e) {
    console.warn('[VISUAL_FLOW] falha ao atualizar lead:', e instanceof Error ? e.message : e)
  }

  try {
    if (Object.keys(funnelPatch).length) {
      funnelPatch.updated_at = new Date().toISOString()
      await supabase.from('lead_funnel_state').update(funnelPatch).eq('lead_id', leadId)
    }
  } catch (e) {
    console.warn('[VISUAL_FLOW] falha ao atualizar funil:', e instanceof Error ? e.message : e)
  }

  console.log('[VISUAL_FLOW] campos gravados:', JSON.stringify({
    contact: Object.keys(contactPatch),
    lead: Object.keys(leadPatch),
    funnel: Object.keys(funnelPatch),
  }))
}


/**
 * A etapa atual espera uma resposta curta (Sim/Não, opção, data, número)?
 * Nesses casos não faz sentido esperar o buffer de consolidação de balões.
 */
export function expectsShortAnswer(plan: VisualFlowPlan, stepCode: unknown): boolean {
  try {
    if (!plan?.enabled || !stepCode) return false
    const step = plan.steps.find((s: any) => s?.step_code === stepCode)
    if (!step) return false
    const type = String((step as any).answer_type || '').toUpperCase()
    return ['SIM_NAO', 'OPCOES', 'OPCAO', 'BOTOES', 'SELECAO', 'DATA', 'NUMERO', 'IDADE'].includes(type)
  } catch {
    return false
  }
}

/**
 * Rótulos dos botões que a etapa deve oferecer, já traduzidos para o idioma
 * da conversa. Vazio quando a etapa não usa botões.
 */
export function buttonsForStep(plan: VisualFlowPlan, stepCode: unknown, lang: FlowLang): string[] {
  try {
    if (!plan?.enabled || !stepCode) return []
    const step = plan.steps.find((s: any) => s?.step_code === stepCode)
    if (!step) return []
    return buttonsOf(step, lang)
  } catch {
    return []
  }
}

