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
import { normalizeIntakeConfig, runIntake, type IntakeConfig } from '../../_shared/flow-intake.ts'
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

async function fetchIntakeConfig(supabase: any, flowId: string | null): Promise<IntakeConfig> {
  if (!flowId) return normalizeIntakeConfig(null)
  return await cached<IntakeConfig>(`flow-intake:${flowId}`, 60_000, async () => {
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

async function fetchSteps(supabase: any, flowId: string | null): Promise<FlowStep[]> {
  if (!flowId) return []
  // Cache de 60s por fluxo: as etapas mudam apenas quando o admin salva o fluxo.
  return await cached<FlowStep[]>(`flow-steps:${flowId}`, 60_000, async () => {
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

    const [preSteps, handSteps, intake] = await Promise.all([
      fetchSteps(supabase, preId),
      fetchSteps(supabase, handId),
      fetchIntakeConfig(supabase, preId || handId),
    ])
    const steps = mergeFlows(preSteps, handSteps)
    const start = findStartStep(steps)
    const enabled = !!start && stepKindOf(start) === 'INICIO' && steps.length > 0

    if (!enabled) {
      console.log('[VISUAL_FLOW] fluxo configurado sem etapa de INÍCIO válida — usando funil legado')
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
): Promise<FlowTurnResult> {
  if (!plan.intake?.enabled || !callLLM) return startFlow(plan.steps, lang)

  let intake
  try {
    intake = await runIntake({ message, steps: plan.steps, lang, config: plan.intake, callLLM })
  } catch (e) {
    console.warn('[VISUAL_FLOW] intake falhou (segue fluxo normal):', e instanceof Error ? e.message : e)
    return startFlow(plan.steps, lang)
  }

  const prefilledCodes = Object.keys(intake.prefilled || {})
  if (!prefilledCodes.length) return startFlow(plan.steps, lang)

  console.log('[VISUAL_FLOW][INTAKE]', JSON.stringify({ fields: intake.fieldValues, steps: prefilledCodes }))

  const turn = startFlowWithPrefill(plan.steps, lang, intake.prefilled)
  if (intake.greeting) {
    turn.messages = [intake.greeting, ...(turn.messages || [])]
    turn.outbound = [
      { text: intake.greeting, step_code: 'intake', quick_reply: false },
      ...(turn.outbound || []),
    ]
  }
  return turn
}

export function runVisualFlowTurn(
  plan: VisualFlowPlan,
  state: FlowRunState,
  message: string,
  lang: FlowLang,
): FlowTurnResult {
  const started = !!state?.current_step
  return started ? advanceFlow(plan.steps, state, message, lang) : startFlow(plan.steps, lang)
}

// ---------------------------------------------------------------------------
// Persistência das respostas nos campos do CRM

const YES_VALUES = new Set(['sim', 'si', 'sí', 'yes', 'oui', 'true', 's', 'y'])
const NO_VALUES = new Set(['nao', 'não', 'no', 'non', 'false', 'n'])

function toYesNo(value: string): 'yes' | 'no' {
  return YES_VALUES.has(String(value || '').trim().toLowerCase()) ? 'yes' : 'no'
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
      case 'contact.education_level': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.education_level = b ? 'SUPERIOR' : 'NAO_SUPERIOR'
        else if (value) contactPatch.education_level = value
        break
      }
      case 'contact.works_remotely': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.works_remotely = b
        outside.a5_remote = toYesNo(value)
        outsideTouched = true
        break
      }
      case 'contact.has_eu_family_member': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.has_eu_family_member = b
        outside.a4_eu_family = toYesNo(value)
        outsideTouched = true
        break
      }
      case 'contact.eu_entry_last_6_months': {
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.eu_entry_last_6_months = b
        outside.a3_europe_6m = toYesNo(value)
        outsideTouched = true
        break
      }
      case 'contact.birth_date': {
        const iso = toIsoDateOrNull(value)
        if (iso) contactPatch.birth_date = iso
        break
      }
      case 'funnel.interest_confirmed':
        if (value) {
          funnelPatch.interest_confirmed = value
          const svc = inferServiceInterest(value)
          if (svc) {
            leadPatch.service_interest = svc
            leadPatch.interest_confirmed = true
          }
        }
        break
      case 'funnel.location_known': {
        const inSpain = toYesNo(value) === 'yes'
        funnelPatch.location_known = inSpain ? 'spain' : 'outside'
        contactPatch.is_in_spain = inSpain
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
        outside.a2_age = value
        outsideTouched = true
        const year = ageToBirthYear(value)
        if (year) contactPatch.birth_date = `${year}-01-01`
        break
      }
      case 'outside.europe_6m': {
        outside.a3_europe_6m = toYesNo(value)
        outsideTouched = true
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.eu_entry_last_6_months = b
        break
      }
      case 'outside.eu_family': {
        outside.a4_eu_family = toYesNo(value)
        outsideTouched = true
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.has_eu_family_member = b
        break
      }
      case 'outside.remote_work': {
        outside.a5_remote = toYesNo(value)
        outsideTouched = true
        const b = toBoolOrNull(value)
        if (b !== null) contactPatch.works_remotely = b
        break
      }
      case 'lead.service_interest': {
        const svc = inferServiceInterest(value)
        if (svc) {
          leadPatch.service_interest = svc
          leadPatch.interest_confirmed = true
        }
        if (value) funnelPatch.interest_confirmed = value
        break
      }
      default:
        // Campo desconhecido: a resposta continua salva em `answers`.
        break
    }
  }

  if (outsideTouched) funnelPatch.outside_spain_progress = outside

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
    return ['SIM_NAO', 'OPCOES', 'OPCAO', 'DATA', 'NUMERO', 'IDADE'].includes(type)
  } catch {
    return false
  }
}
