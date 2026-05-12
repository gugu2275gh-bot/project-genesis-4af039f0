// @ts-nocheck
// Wave 4 - Passo 2: estado persistente do funil de conversa
import { type ChatLanguage } from './language.ts'

export type FunnelStep =
  | 'abertura'
  | 'nome'
  | 'email'
  | 'interesse'
  | 'localizacao'
  | 'levantamento'
  | 'livre'

export interface FunnelState {
  lead_id: string
  step: FunnelStep
  name_confirmed: boolean
  email_confirmed: boolean
  interest_confirmed: string | null
  location_known: 'spain' | 'outside' | null
  entry_date_confirmed: string | null
  empadronado_confirmed: boolean | null
  outside_spain_progress: Record<string, unknown>
  last_step_change: string
  updated_at: string
}

export type NameSource = 'AUTO' | 'USER_CONFIRMED' | 'STAFF_EDITED'

export interface ContactLite {
  id: string
  full_name: string
  email: string | null
  name_source?: NameSource | null
}

export function isContactNameTrustworthy(contact: ContactLite | null | undefined): boolean {
  if (!contact) return false
  const src = contact.name_source || 'AUTO'
  return src === 'USER_CONFIRMED' || src === 'STAFF_EDITED'
}

export async function loadFunnelState(
  supabase: any,
  leadId: string,
  contact: ContactLite | null,
): Promise<FunnelState> {
  const { data, error } = await supabase
    .from('lead_funnel_state')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (error) console.warn('[FUNNEL_STATE] load error:', error.message)

  if (data) return data as FunnelState

  // Inicializa para leads novos
  const initial: Partial<FunnelState> = {
    lead_id: leadId,
    step: 'abertura',
    name_confirmed: isContactNameTrustworthy(contact),
    email_confirmed: !!(contact?.email),
    outside_spain_progress: {},
  }
  const { data: inserted, error: insertErr } = await supabase
    .from('lead_funnel_state')
    .insert(initial)
    .select('*')
    .single()
  if (insertErr) {
    console.warn('[FUNNEL_STATE] insert error:', insertErr.message)
    return {
      lead_id: leadId,
      step: 'abertura',
      name_confirmed: isContactNameTrustworthy(contact),
      email_confirmed: !!(contact?.email),
      interest_confirmed: null,
      location_known: null,
      entry_date_confirmed: null,
      empadronado_confirmed: null,
      outside_spain_progress: {},
      last_step_change: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }
  return inserted as FunnelState
}

export function computeNextStep(state: FunnelState): FunnelStep {
  if (!state.name_confirmed) return 'nome'
  if (!state.email_confirmed) return 'email'
  if (!state.interest_confirmed) return 'interesse'
  if (!state.location_known) return 'localizacao'
  return 'levantamento'
}

export async function applyTurnUpdates(
  supabase: any,
  state: FunnelState,
  patch: Partial<FunnelState>,
  meta?: { override_applied?: string | null },
): Promise<FunnelState> {
  const merged: FunnelState = { ...state, ...patch }
  const nextStep = computeNextStep(merged)
  const stepChanged = nextStep !== state.step
  const update: Record<string, unknown> = {
    ...patch,
    step: nextStep,
  }
  if (stepChanged) update.last_step_change = new Date().toISOString()

  const { data, error } = await supabase
    .from('lead_funnel_state')
    .update(update)
    .eq('lead_id', state.lead_id)
    .select('*')
    .single()

  if (error) console.warn('[FUNNEL_STATE] update error:', error.message)

  console.log('[FUNNEL_STATE]', JSON.stringify({
    lead_id: state.lead_id,
    step_before: state.step,
    step_after: nextStep,
    name_confirmed: merged.name_confirmed,
    email_confirmed: merged.email_confirmed,
    interest_confirmed: !!merged.interest_confirmed,
    location_known: merged.location_known,
    override_applied: meta?.override_applied || null,
  }))

  return (data as FunnelState) || merged
}

export function buildStateDirective(state: FunnelState, language: ChatLanguage): string {
  const confirmed: string[] = []
  if (state.name_confirmed) confirmed.push('nome completo')
  if (state.email_confirmed) confirmed.push('email')
  if (state.interest_confirmed) confirmed.push(`interesse (${state.interest_confirmed})`)
  if (state.location_known) confirmed.push(`localização (${state.location_known})`)
  if (state.entry_date_confirmed) confirmed.push('data de entrada na Espanha')
  if (state.empadronado_confirmed !== null && state.empadronado_confirmed !== undefined) {
    confirmed.push('empadronamento')
  }

  const stepLabel: Record<FunnelStep, string> = {
    abertura: 'abertura',
    nome: 'pedir o nome completo',
    email: 'pedir o e-mail',
    interesse: 'descobrir o interesse',
    localizacao: 'descobrir se está na Espanha ou fora',
    levantamento: 'levantamento do caso',
    livre: 'conversa livre (todos os dados básicos coletados)',
  }

  // Wave 5 — bloco explícito de NÃO regressão (F3) e localização (F7).
  // O LLM tende a reiniciar pelo nome quando o cliente diverge; este bloco
  // congela cada bandeira e dá uma instrução de fallback para divergências.
  const lockLines: string[] = []
  if (state.name_confirmed) lockLines.push('NOME já está confirmado — JAMAIS pergunte o nome novamente.')
  if (state.email_confirmed) lockLines.push('E-MAIL já está confirmado — JAMAIS pergunte o e-mail novamente.')
  if (state.interest_confirmed) lockLines.push(`INTERESSE já está confirmado (${state.interest_confirmed}) — não volte ao catálogo.`)
  if (state.location_known) lockLines.push(`LOCALIZAÇÃO já é conhecida (${state.location_known}) — não pergunte de novo onde está.`)
  if (state.entry_date_confirmed) lockLines.push(`DATA DE ENTRADA já registrada (${state.entry_date_confirmed}).`)
  if (state.empadronado_confirmed !== null && state.empadronado_confirmed !== undefined) {
    lockLines.push('EMPADRONAMENTO já registrado.')
  }
  // F7 — guard de elegibilidade quando cliente está fora da Espanha.
  if (state.location_known === 'outside') {
    lockLines.push(
      'O cliente está FORA DA ESPANHA. NÃO recomende nem explique processos exclusivos para residentes ' +
      '(autorização de regresso, prórroga de estancia, TIE, renovação de residência, arraigo, asilo já em curso, etc.) ' +
      'sem antes esclarecer que é PRÉ-REQUISITO já residir legalmente na Espanha. ' +
      'Se o cliente perguntar sobre algum desses, diga claramente: "Esse processo é exclusivo para quem já está residindo na Espanha — no seu caso atual ele não se aplica."',
    )
  }

  const lockBlock = lockLines.length ? `\nTRAVAS RÍGIDAS:\n- ${lockLines.join('\n- ')}` : ''
  const divergenceRulePT =
    '\nSE O CLIENTE DIVERGIR (responder com pergunta, dúvida ou outro assunto): ' +
    'reformule o pedido NO MESMO PASSO atual (acolha em uma frase e repita a pergunta atual), ' +
    'NUNCA reinicie pelo nome ou por passos anteriores já confirmados.'
  const divergenceRuleES =
    '\nSI EL CLIENTE SE DESVÍA (responde con pregunta o cambia de tema): ' +
    'reformula la petición EN EL MISMO PASO actual (acoge en una frase y repite la pregunta actual), ' +
    'NUNCA reinicies pidiendo el nombre o pasos anteriores ya confirmados.'
  const divergenceRuleEN =
    '\nIF THE CUSTOMER DIVERGES (asks back, changes topic): rephrase the request IN THE CURRENT STEP, ' +
    'NEVER restart from name or previously confirmed steps.'
  const divergenceRuleFR =
    '\nSI LE CLIENT DÉVIE : reformulez la demande DANS LA MÊME ÉTAPE, ne redémarrez JAMAIS depuis le nom.'

  if (language === 'es') {
    return `\n\n## ESTADO DEL EMBUDO (NO RE-PREGUNTAR / NO REINICIAR)\nEtapa actual: ${stepLabel[state.step]}.\nDatos ya confirmados: ${confirmed.join(', ') || 'ninguno todavía'}.${lockBlock}\nNUNCA vuelvas a preguntar lo confirmado. Si la etapa actual es "${stepLabel[state.step]}", céntrate en ese paso y avanza UN paso a la vez (no saltes etapas).${divergenceRuleES}`
  }
  if (language === 'en') {
    return `\n\n## FUNNEL STATE (DO NOT RE-ASK / DO NOT RESTART)\nCurrent step: ${stepLabel[state.step]}.\nAlready confirmed: ${confirmed.join(', ') || 'nothing yet'}.${lockBlock}\nNEVER re-ask confirmed data. Focus on the current step and advance ONE step at a time.${divergenceRuleEN}`
  }
  if (language === 'fr') {
    return `\n\n## ÉTAT DE L’ENTONNOIR (NE PAS REDEMANDER)\nÉtape actuelle : ${stepLabel[state.step]}.\nDéjà confirmé : ${confirmed.join(', ') || 'rien pour l’instant'}.${lockBlock}\nNE redemandez JAMAIS ce qui est confirmé. Avancez UNE étape à la fois.${divergenceRuleFR}`
  }
  return `\n\n## ESTADO DO FUNIL (NÃO RE-PERGUNTAR / NÃO REINICIAR)\nEtapa atual: ${stepLabel[state.step]}.\nDados já confirmados: ${confirmed.join(', ') || 'nenhum ainda'}.${lockBlock}\nNUNCA pergunte de novo o que já está confirmado. Foque na etapa atual e avance UM passo de cada vez (não pule etapas).${divergenceRulePT}`
}
