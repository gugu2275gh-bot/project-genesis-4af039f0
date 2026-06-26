// @ts-nocheck
/**
 * ConversationContext — snapshot consolidado da conversa para o turno atual.
 *
 * Montado UMA VEZ no início do turno a partir de `lead_funnel_state` + `contacts`
 * e passado adiante para o orquestrador, validadores e redatores. Evita que
 * cada função releia o banco e mantém uma visão consistente durante o turno.
 *
 * NÃO é uma tabela — é estrutura em memória. Os dados persistidos continuam
 * em `lead_funnel_state` (estado/máquina) e `contacts` (perfil consolidado).
 */

import type { FunnelState } from './funnel-state.ts'
import type { ChatLanguage } from './language.ts'
import {
  resolveCurrentStep,
  currentFlow,
  type StepCode,
  type FlowCode,
} from './flow-machine.ts'

export interface LeadProfile {
  contact_id: string
  full_name: string | null
  email: string | null
  language: ChatLanguage
  is_in_spain: boolean | null
  spain_arrival_date: string | null
  empadronamiento_city: string | null
  is_empadronado: boolean | null
  has_eu_family_member: boolean | null
  eu_entry_last_6_months: boolean | null
  works_remotely: boolean | null
  education_level: string | null
  monthly_income: number | null
}

export interface PendingQuestion {
  text: string
  ts: string
  kind: 'question' | 'request'
}

export interface ConversationContext {
  lead_id: string
  contact_id: string
  language: ChatLanguage
  /** Etapa atual conforme máquina de estados — fonte oficial. */
  current_step: StepCode
  /** Branch de fluxo atual. */
  current_flow: FlowCode
  /** Etapas já concluídas (chaves de `state.answers`). */
  completed_steps: string[]
  /** Status da conversa. */
  status: 'ACTIVE' | 'AWAITING_HUMAN' | 'CLOSED'
  /** Dúvidas paralelas parqueadas durante cadastro. */
  pending_questions: PendingQuestion[]
  /** Perfil consolidado do lead (espelhado de `contacts`). */
  profile: LeadProfile
  /** Snapshot bruto do estado para handlers legados que ainda dependem dele. */
  state: FunnelState
  /** Timestamp do último handoff humano (se houver). */
  last_human_handoff_at: string | null
}

export interface ContactRow {
  id: string
  full_name: string | null
  email: string | null
  preferred_language: ChatLanguage | null
  is_in_spain: boolean | null
  spain_arrival_date: string | null
  empadronamiento_city: string | null
  is_empadronado: boolean | null
  has_eu_family_member: boolean | null
  eu_entry_last_6_months: boolean | null
  works_remotely: boolean | null
  education_level: string | null
  monthly_income: number | null
}

export function buildConversationContext(
  state: FunnelState,
  contact: ContactRow,
  language: ChatLanguage,
): ConversationContext {
  const profile: LeadProfile = {
    contact_id: contact.id,
    full_name: contact.full_name,
    email: contact.email,
    language,
    is_in_spain: contact.is_in_spain,
    spain_arrival_date: contact.spain_arrival_date,
    empadronamiento_city: contact.empadronamiento_city,
    is_empadronado: contact.is_empadronado,
    has_eu_family_member: contact.has_eu_family_member,
    eu_entry_last_6_months: contact.eu_entry_last_6_months,
    works_remotely: contact.works_remotely,
    education_level: contact.education_level,
    monthly_income: contact.monthly_income,
  }

  const answers = (state as any).answers || {}
  const completed_steps = Object.keys(answers)

  const status =
    ((state as any).status as ConversationContext['status']) ||
    (state.handoff_sent ? 'AWAITING_HUMAN' : 'ACTIVE')

  return {
    lead_id: state.lead_id,
    contact_id: contact.id,
    language,
    current_step: resolveCurrentStep(state),
    current_flow: currentFlow(state),
    completed_steps,
    status,
    pending_questions: (state.pending_questions as PendingQuestion[]) || [],
    profile,
    state,
    last_human_handoff_at: (state as any).last_human_handoff_at || null,
  }
}
