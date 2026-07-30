// @ts-nocheck
/**
 * Coleta a configuracao ATUAL do agente que roda em producao, direto do codigo,
 * para semear/sincronizar o "AGENTE 1.0" na tela Configuracoes > Agentes de IA.
 *
 * Importante: os valores aqui sao SEMPRE os defaults de codigo (sem overrides),
 * garantindo que o que aparece na tela é exatamente o que o agente executa hoje.
 */

import { AGENT_TEXT_KEYS, getAgentRuntime, setAgentRuntime, type ChatLanguage } from './agent-runtime.ts'
import { DEFAULT_PROMPT_FLOW } from './prompt-template.ts'
import { getDefaultPromptTemplates, getNoKnowledgeBaseReply, getTransientErrorReply } from './language.ts'
import {
  getEmailQuestion,
  getEmailReaskQuestion,
  getEmailRequiredReaskQuestion,
  getEmpadronadoQuestion,
  getEmpadronamientoCityQuestion,
  getEmpadronamientoSinceQuestion,
  getEntryDateNeedsYearQuestion,
  getFullNameReaskQuestion,
  getFullNameRequiredReaskQuestion,
  getHandoffTransferMessage,
  getInvalidSpanishCityReprompt,
  getLocationQuestion,
  getLocationSpainRequiredReaskQuestion,
  getOutsideSpainAgeQuestion,
  getPostHandoffWaitSuffix,
  getPreHandoffSummaryMessage,
  getServicesOfferedMessage,
} from './questions.ts'

const LANGS: ChatLanguage[] = ['pt-BR', 'es', 'en', 'fr']

const TPL = (field: string) => (lang: ChatLanguage) => (getDefaultPromptTemplates(lang) as any)[field]

const RESOLVERS: Record<string, (lang: ChatLanguage) => string> = {
  'opening.line1': TPL('openingLine1'),
  'opening.line2': TPL('openingLine2'),
  'opening.askName': TPL('askName'),
  'opening.thanksThenAskEmail': TPL('thanksThenAskEmail'),
  'opening.interestQuestion': TPL('interestQuestion'),
  'opening.servicesCatalog': TPL('servicesCatalog'),
  'opening.oneMomentPlease': TPL('oneMomentPlease'),
  'opening.askLocationSpain': TPL('askLocationSpain'),
  'opening.outsideIntro': TPL('outsideIntro'),
  'opening.insideIntro': TPL('insideIntro'),

  'name.reask': getFullNameReaskQuestion,
  'name.requiredReask': getFullNameRequiredReaskQuestion,

  'email.question': getEmailQuestion,
  'email.reask': getEmailReaskQuestion,
  'email.requiredReask': getEmailRequiredReaskQuestion,

  'location.question': getLocationQuestion,
  'location.requiredReask': getLocationSpainRequiredReaskQuestion,
  'services.offered': getServicesOfferedMessage,

  'inside.entryDate': (lang) => {
    if (lang === 'es') return '¿Cuál fue la fecha exacta de entrada en España? Solo la fecha DD/MM/AAAA'
    if (lang === 'en') return 'What was the exact date of entry into Spain? Only the date DD/MM/YYYY'
    if (lang === 'fr') return "Quelle a été la date exacte d'entrée en Espagne ? Uniquement la date JJ/MM/AAAA"
    return 'Qual foi a data exata de entrada na espanha? somente a data DD/MM/AAAA'
  },
  'inside.entryDateNeedsYear': getEntryDateNeedsYearQuestion,
  'inside.empadronado': getEmpadronadoQuestion,
  'inside.empadronadoSince': getEmpadronamientoSinceQuestion,
  'inside.empadronadoCity': getEmpadronamientoCityQuestion,
  'inside.invalidCity': getInvalidSpanishCityReprompt,

  'outside.age': getOutsideSpainAgeQuestion,
  'outside.europe6m': (lang) => {
    if (lang === 'es') return '¿Estuviste en Europa en los últimos 6 meses?'
    if (lang === 'en') return 'Have you been in Europe in the last 6 months?'
    if (lang === 'fr') return 'Êtes-vous allé en Europe au cours des 6 derniers mois ?'
    return 'você esteve na Europa nos últimos 6 meses?'
  },
  'outside.euFamily': (lang) => {
    if (lang === 'es') return '¿Tienes algún familiar europeo o residente legal en España?'
    if (lang === 'en') return 'Do you have a European family member or a legal resident in Spain?'
    if (lang === 'fr') return 'Avez-vous un membre de votre famille européen ou résident légal en Espagne ?'
    return 'possui familiar europeu ou residente legal na espanha?'
  },
  'outside.remoteWork': (lang) => {
    if (lang === 'es') return '¿Trabajas de forma remota?'
    if (lang === 'en') return 'Do you work remotely?'
    if (lang === 'fr') return 'Travaillez-vous à distance ?'
    return 'você trabalha remoto?'
  },
  'outside.yesNoReaskPrefix': (lang) => {
    if (lang === 'es') return 'Por favor, responde solo con *sí* o *no*. '
    if (lang === 'en') return 'Please answer only with *yes* or *no*. '
    if (lang === 'fr') return 'Merci de répondre uniquement par *oui* ou *non*. '
    return 'Por favor, responda apenas com *sim* ou *não*. '
  },

  'handoff.preSummary': getPreHandoffSummaryMessage,
  'handoff.transfer': getHandoffTransferMessage,
  'handoff.postWaitSuffix': getPostHandoffWaitSuffix,

  'system.transientError': getTransientErrorReply,
  'system.noKnowledgeBase': getNoKnowledgeBaseReply,
}


export interface DefaultTextEntry {
  text_key: string
  label: string
  group: string
  order_index: number
  translations: Record<string, string>
}

export interface DefaultStepEntry {
  step_code: string
  name: string
  description: string
  answer_type: string
  next_step_code: string | null
  handoff: boolean
  order_index: number
  /** chave em ai_agent_texts que contém a mensagem desta etapa (quando houver) */
  text_key: string | null
  messages: Record<string, string>
}

/** Etapas determinísticas executadas hoje pelo webhook (flow-machine.ts). */
const STEP_DEFS: Array<Omit<DefaultStepEntry, 'messages'>> = [
  { step_code: 'ABERTURA', name: 'Abertura / saudação', description: 'Envia as duas mensagens de saudação e pede o nome completo.', answer_type: 'TEXTO_LIVRE', next_step_code: 'NAME', handoff: false, order_index: 1, text_key: 'opening.line1' },
  { step_code: 'NAME', name: 'Nome completo', description: 'Coleta nome e sobrenome. Repergunta enquanto não houver nome completo.', answer_type: 'NOME', next_step_code: 'INTEREST', handoff: false, order_index: 2, text_key: 'name.reask' },
  { step_code: 'INTEREST', name: 'Interesse / necessidade', description: 'Identifica o que o cliente busca e apresenta os serviços da CB.', answer_type: 'TEXTO_LIVRE', next_step_code: 'LOCATION', handoff: false, order_index: 3, text_key: 'services.offered' },
  { step_code: 'LOCATION', name: 'Está na Espanha?', description: 'Pergunta Sim/Não que define o bloco seguinte (dentro ou fora da Espanha).', answer_type: 'SIM_NAO', next_step_code: 'INSIDE_ENTRY_DATE', handoff: false, order_index: 4, text_key: 'location.question' },
  { step_code: 'INSIDE_ENTRY_DATE', name: 'Data de entrada na Espanha', description: 'Bloco dentro da Espanha: data exata de entrada (DD/MM/AAAA).', answer_type: 'DATA', next_step_code: 'INSIDE_EMPADRONADO', handoff: false, order_index: 5, text_key: 'inside.entryDate' },
  { step_code: 'INSIDE_EMPADRONADO', name: 'Empadronamiento', description: 'Empadronado? Se sim, desde quando e em qual cidade.', answer_type: 'SIM_NAO', next_step_code: 'PRE_HANDOFF', handoff: false, order_index: 6, text_key: 'inside.empadronado' },
  { step_code: 'OUTSIDE_AGE', name: 'Perfil fora da Espanha', description: 'Bloco fora da Espanha: idade, Europa nos últimos 6 meses, familiar europeu e trabalho remoto.', answer_type: 'NUMERO', next_step_code: 'PRE_HANDOFF', handoff: false, order_index: 7, text_key: 'outside.age' },
  { step_code: 'PRE_HANDOFF', name: 'Pré-handoff', description: 'Resumo inicial do caso (H1 ||| H2).', answer_type: 'TEXTO_LIVRE', next_step_code: 'HANDOFF', handoff: false, order_index: 8, text_key: 'handoff.preSummary' },
  { step_code: 'HANDOFF', name: 'Handoff para especialista', description: 'Transfere o atendimento para o especialista humano (H3) e encerra o bot.', answer_type: 'TEXTO_LIVRE', next_step_code: null, handoff: true, order_index: 9, text_key: 'handoff.transfer' },
]

/** Executa `fn` garantindo que nenhum override do agente esteja ativo. */
function withoutOverrides<T>(fn: () => T): T {
  const previous = getAgentRuntime()
  setAgentRuntime(null)
  try {
    return fn()
  } finally {
    setAgentRuntime(previous)
  }
}

export function collectAgentDefaults(): {
  prompt_flow: string
  texts: DefaultTextEntry[]
  steps: DefaultStepEntry[]
} {
  return withoutOverrides(() => {
    const texts: DefaultTextEntry[] = AGENT_TEXT_KEYS.map((meta, index) => {
      const resolver = RESOLVERS[meta.key]
      const translations: Record<string, string> = {}
      for (const lang of LANGS) {
        translations[lang] = resolver ? String(resolver(lang) ?? '') : ''
      }
      return {
        text_key: meta.key,
        label: meta.label,
        group: meta.group,
        order_index: index,
        translations,
      }
    })

    const byKey: Record<string, Record<string, string>> = {}
    for (const entry of texts) byKey[entry.text_key] = entry.translations

    const steps: DefaultStepEntry[] = STEP_DEFS.map((step) => ({
      ...step,
      messages: step.text_key ? (byKey[step.text_key] || {}) : {},
    }))

    return { prompt_flow: DEFAULT_PROMPT_FLOW, texts, steps }
  })
}
