// @ts-nocheck
/**
 * Flow Machine — catálogo declarativo das etapas do atendimento CB Asesoría.
 *
 * Esta é a ÚNICA fonte de verdade para "qual é a próxima etapa". O LLM nunca
 * decide transições; ele apenas redige o texto da pergunta retornada por
 * `getStepDef(...)`. Todas as transições são determinísticas e baseadas no
 * estado persistido em `lead_funnel_state` — nunca no histórico do chat.
 *
 * REAPROVEITAMENTO: este módulo é uma camada fina sobre os helpers existentes
 * (`questions.ts`, `extract.ts`, `offtopic.ts`, `funnel-state.ts`). Não duplica
 * lógica: apenas declara o grafo de transições e delega.
 */

import type { FunnelState, FunnelStep } from './funnel-state.ts'
import type { ChatLanguage } from './language.ts'
import {
  getEmailQuestion,
  getFullNameReaskQuestion,
  getLocationQuestion,
  getServicesOfferedMessage,
  hasValidEmail,
  countAlphaWords,
} from './questions.ts'
import { extractInterestFromMessage } from './extract.ts'
import { isValidAnswerForStep, type CadastroStepKey } from './offtopic.ts'

export type FlowCode = 'ONBOARDING' | 'INSIDE_SPAIN' | 'OUTSIDE_SPAIN' | 'KB_FREE'

export type StepCode =
  | 'ABERTURA'
  | 'NAME'
  | 'EMAIL'
  | 'INTEREST'
  | 'LOCATION'
  | 'INSIDE_ENTRY_DATE'
  | 'INSIDE_EMPADRONADO'
  | 'OUTSIDE_AGE'
  | 'PRE_HANDOFF'
  | 'HANDOFF'
  | 'FREE_KB'

export type AnswerType = 'text' | 'email' | 'yes_no' | 'date' | 'enum' | 'free'

export interface ValidationResult {
  valid: boolean
  /** Valor normalizado para gravar em `answers[step]`. */
  value?: string | boolean | null
  /** Motivo da rejeição (logado, não exibido ao cliente). */
  reason?: string
}

export interface StepDef {
  code: StepCode
  flow: FlowCode
  answerType: AnswerType
  /** Pergunta canônica no idioma do cliente — delega ao `questions.ts`. */
  ask: (lang: ChatLanguage) => string
  /** Valida resposta do cliente. Delega aos validadores existentes. */
  validate: (raw: string, state: FunnelState) => ValidationResult
  /** Próxima etapa, calculada de forma determinística pelo estado. */
  next: (state: FunnelState, value?: ValidationResult['value']) => StepCode
}

// ----------------------------------------------------------------------------
// Catálogo

const ALWAYS = (next: StepCode) => () => next

const STEPS: Record<StepCode, StepDef> = {
  ABERTURA: {
    code: 'ABERTURA',
    flow: 'ONBOARDING',
    answerType: 'free',
    ask: () => '', // abertura é enviada por scripted-dispatch (Msg1/Msg2)
    validate: () => ({ valid: true }),
    next: ALWAYS('NAME'),
  },

  NAME: {
    code: 'NAME',
    flow: 'ONBOARDING',
    answerType: 'text',
    ask: (lang) => getFullNameReaskQuestion(lang),
    validate: (raw, state) => {
      const ok = isValidAnswerForStep(raw, 'nome', '') && countAlphaWords(raw) >= 2
      return ok
        ? { valid: true, value: raw.trim() }
        : { valid: false, reason: 'not_a_full_name' }
    },
    next: (state) => (state.email_confirmed ? 'INTEREST' : 'EMAIL'),
  },

  EMAIL: {
    code: 'EMAIL',
    flow: 'ONBOARDING',
    answerType: 'email',
    ask: (lang) => getEmailQuestion(lang),
    validate: (raw) =>
      hasValidEmail(raw)
        ? { valid: true, value: raw.trim().toLowerCase() }
        : { valid: false, reason: 'invalid_email' },
    next: ALWAYS('INTEREST'),
  },

  INTEREST: {
    code: 'INTEREST',
    flow: 'ONBOARDING',
    answerType: 'enum',
    ask: (lang) => getServicesOfferedMessage(lang),
    validate: (raw) => {
      const interest = extractInterestFromMessage(raw)
      return interest
        ? { valid: true, value: interest }
        : { valid: false, reason: 'interest_not_recognized' }
    },
    next: ALWAYS('LOCATION'),
  },

  LOCATION: {
    code: 'LOCATION',
    flow: 'ONBOARDING',
    answerType: 'enum',
    ask: (lang) => getLocationQuestion(lang),
    validate: (raw, state) => {
      const ok = isValidAnswerForStep(raw, 'localizacao', '')
      if (!ok) return { valid: false, reason: 'unclear_location' }
      const v = /(espan|spain|españ)/i.test(raw) ? 'spain' : 'outside'
      return { valid: true, value: v }
    },
    next: (_state, value) =>
      value === 'spain' ? 'INSIDE_ENTRY_DATE' : 'OUTSIDE_AGE',
  },

  INSIDE_ENTRY_DATE: {
    code: 'INSIDE_ENTRY_DATE',
    flow: 'INSIDE_SPAIN',
    answerType: 'date',
    ask: () => '', // perguntas Inside já são montadas por getInsideSpainNextQuestion
    validate: () => ({ valid: true }),
    next: ALWAYS('INSIDE_EMPADRONADO'),
  },

  INSIDE_EMPADRONADO: {
    code: 'INSIDE_EMPADRONADO',
    flow: 'INSIDE_SPAIN',
    answerType: 'yes_no',
    ask: () => '',
    validate: () => ({ valid: true }),
    next: ALWAYS('PRE_HANDOFF'),
  },

  OUTSIDE_AGE: {
    code: 'OUTSIDE_AGE',
    flow: 'OUTSIDE_SPAIN',
    answerType: 'text',
    ask: () => '', // perguntas Outside já são montadas por getOutsideSpainNextQuestion
    validate: () => ({ valid: true }),
    next: ALWAYS('PRE_HANDOFF'),
  },

  PRE_HANDOFF: {
    code: 'PRE_HANDOFF',
    flow: 'ONBOARDING',
    answerType: 'free',
    ask: () => '',
    validate: () => ({ valid: true }),
    next: ALWAYS('HANDOFF'),
  },

  HANDOFF: {
    code: 'HANDOFF',
    flow: 'KB_FREE',
    answerType: 'free',
    ask: () => '',
    validate: () => ({ valid: true }),
    next: ALWAYS('FREE_KB'),
  },

  FREE_KB: {
    code: 'FREE_KB',
    flow: 'KB_FREE',
    answerType: 'free',
    ask: () => '',
    validate: () => ({ valid: true }),
    next: ALWAYS('FREE_KB'),
  },
}

// ----------------------------------------------------------------------------
// API pública

export function getStepDef(code: StepCode): StepDef {
  return STEPS[code]
}

/**
 * Resolve o `StepCode` atual a partir do `lead_funnel_state` persistido.
 * NUNCA consulta histórico do chat — fonte oficial é sempre o estado salvo.
 */
export function resolveCurrentStep(state: FunnelState): StepCode {
  if (state.handoff_sent) return 'FREE_KB'
  if (state.pre_handoff_sent) return 'HANDOFF'
  if (!state.name_confirmed) return state.step === 'abertura' ? 'ABERTURA' : 'NAME'
  if (!state.email_confirmed) return 'EMAIL'
  if (!state.interest_confirmed) return 'INTEREST'
  if (!state.location_known) return 'LOCATION'
  if (state.location_known === 'spain') {
    if (!state.entry_date_confirmed) return 'INSIDE_ENTRY_DATE'
    if (state.empadronado_confirmed === null || state.empadronado_confirmed === undefined)
      return 'INSIDE_EMPADRONADO'
    return 'PRE_HANDOFF'
  }
  // outside
  return 'OUTSIDE_AGE'
}

/**
 * Mapeia o `StepCode` da máquina para o `FunnelStep` legado usado em
 * `funnel-state.ts` (garante compatibilidade total).
 */
export function toLegacyStep(code: StepCode): FunnelStep {
  switch (code) {
    case 'ABERTURA': return 'abertura'
    case 'NAME': return 'nome'
    case 'EMAIL': return 'email'
    case 'INTEREST': return 'interesse'
    case 'LOCATION': return 'localizacao'
    case 'INSIDE_ENTRY_DATE':
    case 'INSIDE_EMPADRONADO':
    case 'OUTSIDE_AGE':
    case 'PRE_HANDOFF':
    case 'HANDOFF':
      return 'levantamento'
    case 'FREE_KB': return 'livre'
  }
}

/** Mapeia código da máquina para a chave de validação usada em `offtopic.ts`. */
export function toCadastroStep(code: StepCode): CadastroStepKey | null {
  switch (code) {
    case 'NAME': return 'nome'
    case 'EMAIL': return 'email'
    case 'INTEREST': return 'interesse'
    case 'LOCATION': return 'localizacao'
    default: return null
  }
}

export function currentFlow(state: FunnelState): FlowCode {
  if (state.handoff_sent) return 'KB_FREE'
  if (state.location_known === 'spain') return 'INSIDE_SPAIN'
  if (state.location_known === 'outside') return 'OUTSIDE_SPAIN'
  return 'ONBOARDING'
}
