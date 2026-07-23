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
    // EMAIL removido do onboarding: pula direto de NAME → LOCATION.
    next: ALWAYS('LOCATION'),
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
    next: ALWAYS('LOCATION'),
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
      const t = String(raw || '').trim().toLowerCase()

      // 0) NEGAÇÃO EXPLÍCITA tem prioridade máxima. Cobre:
      //    - "Não", "No", "Nope", "Jamais"
      //    - "Não estou/moro/vivo na Espanha", "No estoy en España"
      //    - "Ainda não", "Todavía no", "Not yet", "Pas encore"
      //    - "Nao eu disse que quero ir" (mesmo que a frase depois mencione "espanha")
      const explicitNegation =
        /^\s*(n[ãa]o|naum|nao|no|nope|nah|non|jamais|nunca|negativo|neg)\b/i.test(t)
        || /\b(ainda n[ãa]o|ainda naum|todav[ií]a no|not yet|pas encore|noch nicht)\b/i.test(t)
        || /\b(n[ãa]o (estou|moro|vivo|to|tô|estoy|vivo)|naum (estou|to|tô|moro|vivo)|no (estoy|vivo|moro|estou)|i'?m not( in)?|not in spain|je ne suis pas)\b/i.test(t)
      if (explicitNegation) return { valid: true, value: 'outside' }

      // 0b) INTENÇÃO FUTURA de ir para a Espanha (ainda não está lá) → outside.
      //     Ex.: "quero ir para Espanha", "pretendo ir", "planejo mudar",
      //     "quiero ir a España", "want to go to Spain", "je veux aller",
      //     "penso em ir", "sonho em morar", "vou em breve pra Espanha".
      const futureIntent =
        /\b(quero|queria|pretendo|penso|planejo|planeio|sonho|vou|irei|gostaria|gostava)\s+(em\s+|de\s+|a\s+|para\s+|pra\s+)?(ir|indo|mudar|me\s+mudar|mudar-me|viajar|morar|conhecer|visitar)\b/i.test(t)
        || /\b(quiero|queria|pretendo|pienso|voy a|planeo|sue[ñn]o con|me\s+gustar[ií]a)\s+(ir|mudar|mudarme|viajar|vivir|conocer|visitar)\b/i.test(t)
        || /\b(want to|wanna|planning to|going to|gonna|plan to|hope to|would like to|thinking of|thinking about|dreaming of)\s+(go|move|moving|travel|traveling|live|living|visit|visiting)\b/i.test(t)
        || /\b(je\s+(veux|voudrais|compte|pense|vais|souhaite|r[êe]ve))\s+(de\s+|d')?(aller|d[ée]m[ée]nager|voyager|vivre|visiter)\b/i.test(t)
        // Português: "vou/pretendo/quero" + preposição direta ao destino (sem verbo intermediário)
        // Ex.: "vou pra Espanha", "pretendo pra Madrid", "quero pra Espanha em 2026"
        || /\b(vou|irei|pretendo|quero|queria|planejo|gostaria)\s+(pra|para|pro|a|à|ao|em)\s+(espanha|espa[ñn]a|spain|madri|madrid|barcelona|europa)\b/i.test(t)
      if (futureIntent) return { valid: true, value: 'outside' }

      // 1) Menção explícita a país que não é Espanha → outside
      if (/(brasil|brazil|portugal|argentin|colomb|m[eé]xico|mexico|peru|chile|uruguai|uruguay|venezuel|paraguai|paraguay|estados unidos|usa|united states|france|fran[çc]a|italia|alemanha|inglaterra|reino unido)/i.test(t)) {
        return { valid: true, value: 'outside' }
      }

      // 2) Sim/Não isolado em resposta a "Você está na Espanha?" — sim=spain
      const yesRe = /^\s*(sim|s[íi]|yes|y|claro|correto|exato|exactly|sure|ok|okay|vale|positivo|pode|pode\s+ser|puede|dale|si|sí)\s*[.!?]?\s*$/i
      if (yesRe.test(t)) return { valid: true, value: 'spain' }

      // 3) Afirmação explícita de estar na Espanha (verbo de estado + local)
      if (/\b(j[áa] estou|ya estoy|estou (na |em )?espanha|estoy en espa[ñn]a|i'?m in spain|aqui na espanha|aqu[ií] en espa[ñn]a|je suis en espagne|moro (na |em )?espanha|vivo (na |em )?espanha)\b/i.test(t)) {
        return { valid: true, value: 'spain' }
      }

      // 4) Menção a cidade espanhola (sem verbo de intenção) → spain
      if (/\b(madri|madrid|barcelona|valencia|sevilla|m[aá]laga|bilbao|zaragoza|alicante|murcia|palma|granada)\b/i.test(t)) {
        return { valid: true, value: 'spain' }
      }

      // 5) Menção genérica a "Espanha/España/Spain" SEM negação nem intenção
      //    futura (já filtradas acima) → assume spain como último recurso.
      if (/\b(espanha|espa[ñn]a|spain|espagne)\b/i.test(t)) {
        return { valid: true, value: 'spain' }
      }

      // 6) Fallback: se a resposta parece um pedido de serviço (arraigo,
      //    nacionalidade, residência, NIE/TIE, homologação, reagrupação,
      //    estudos/curso, autorização de regresso) OU qualquer outra frase
      //    que não bate com SIM/NÃO nem com país, NÃO adivinhamos "outside".
      //    Rejeita como inválido para que a pergunta SIM/NÃO seja repetida.
      //    Isso evita saltar a etapa quando o cliente responde algo
      //    completamente diferente ("quero tirar arraigo", "preciso do NIE").
      return { valid: false, reason: 'unclear_location' }
    },

    next: (_state, value) =>
      value === 'spain' ? 'INSIDE_ENTRY_DATE' : 'OUTSIDE_AGE',
  },


  INSIDE_ENTRY_DATE: {
    code: 'INSIDE_ENTRY_DATE',
    flow: 'INSIDE_SPAIN',
    answerType: 'date',
    ask: () => '', // perguntas Inside já são montadas por getInsideSpainNextQuestion
    validate: (raw) => {
      const t = String(raw || '').trim()
      // Aceita datas plausíveis OU "ainda não cheguei / not yet" (tratado outside).
      // Rejeita respostas vazias, agradecimentos, acks curtos.
      if (!t || t.length < 2) return { valid: false, reason: 'empty' }
      if (/^(ok|okay|vale|sim|si|s[íi]|no|n[ãa]o|obrigad[oa]|gracias|thanks|merci|👍|🙏)[.!\s]*$/i.test(t)) {
        return { valid: false, reason: 'ack_not_date' }
      }
      return { valid: true, value: t }
    },
    next: ALWAYS('INSIDE_EMPADRONADO'),
  },

  INSIDE_EMPADRONADO: {
    code: 'INSIDE_EMPADRONADO',
    flow: 'INSIDE_SPAIN',
    answerType: 'yes_no',
    ask: () => '',
    validate: (raw) => {
      const t = String(raw || '').trim().toLowerCase()
      if (!t) return { valid: false, reason: 'empty' }
      // Precisa de sim/não claro (ou cidade quando afirmativo)
      if (/\b(sim|s[íi]|si|yes|y|claro|correto|exato|positivo|no|n[ãa]o|nope|jamais|nunca|negativo)\b/i.test(t)) {
        return { valid: true, value: t }
      }
      // Cidade espanhola conta como "sim, empadronado em X"
      if (/\b(madri|madrid|barcelona|valencia|sevilla|m[aá]laga|bilbao|zaragoza|alicante|murcia|palma|granada)\b/i.test(t)) {
        return { valid: true, value: t }
      }
      return { valid: false, reason: 'no_yesno_answer' }
    },
    next: ALWAYS('PRE_HANDOFF'),
  },

  OUTSIDE_AGE: {
    code: 'OUTSIDE_AGE',
    flow: 'OUTSIDE_SPAIN',
    answerType: 'text',
    ask: () => '', // perguntas Outside já são montadas por getOutsideSpainNextQuestion
    validate: (raw) => {
      const t = String(raw || '').trim()
      if (!t || t.length < 2) return { valid: false, reason: 'empty' }
      if (/^(ok|okay|vale|obrigad[oa]|gracias|thanks|merci|👍|🙏)[.!\s]*$/i.test(t)) {
        return { valid: false, reason: 'ack_not_answer' }
      }
      return { valid: true, value: t }
    },
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
  // INTEREST desativado: onboarding pula direto de EMAIL → LOCATION.
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
