// @ts-nocheck
/**
 * Campos obrigatórios da etapa "Pergunta geral".
 *
 * A etapa aproveita tudo que o cliente já contou. Quando algum campo marcado
 * como OBRIGATÓRIO continua vazio, o agente não segue (nem transfere para o
 * humano) antes de perguntar — um campo por vez, sem repetir o que já sabe.
 */

import {
  appendMessage,
  buildStayTurn,
  generalCaptureOf,
  indexSteps,
  isGeneralCaptureStep,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'
import { fieldValuesFromAnswers, pickFieldValue } from './flow-vars.ts'

export interface RequiredCaptureField {
  source: string
  target_field: string
  prompts?: Record<string, string>
}

/** Máximo de insistências por campo obrigatório (evita laço infinito). */
export const MAX_REQUIRED_ATTEMPTS = 2

/** Perguntas padrão por dado, nos 4 idiomas do atendimento. */
const DEFAULT_PROMPTS: Record<string, Record<string, string>> = {
  full_name: {
    'pt-BR': 'Só para eu registrar direitinho: qual é o seu nome completo?',
    es: 'Solo para registrarlo bien: ¿cuál es tu nombre completo?',
    en: 'Just so I can record it properly: what is your full name?',
    fr: 'Juste pour bien l’enregistrer : quel est votre nom complet ?',
  },
  email: {
    'pt-BR': 'Qual é o seu e-mail?',
    es: '¿Cuál es tu correo electrónico?',
    en: 'What is your email address?',
    fr: 'Quelle est votre adresse e-mail ?',
  },
  age: {
    'pt-BR': 'Faltou só uma informação: qual é a sua idade?',
    es: 'Solo falta un dato: ¿cuál es tu edad?',
    en: 'Just one thing missing: how old are you?',
    fr: 'Il manque juste une information : quel âge avez-vous ?',
  },
  city: {
    'pt-BR': 'Em qual cidade você mora hoje?',
    es: '¿En qué ciudad vives actualmente?',
    en: 'Which city do you live in right now?',
    fr: 'Dans quelle ville habitez-vous actuellement ?',
  },
  in_spain: {
    'pt-BR': 'Você já está na Espanha?',
    es: '¿Ya estás en España?',
    en: 'Are you already in Spain?',
    fr: 'Êtes-vous déjà en Espagne ?',
  },
  intent: {
    'pt-BR': 'E qual é o seu objetivo aqui na Espanha?',
    es: 'Y ¿cuál es tu objetivo aquí en España?',
    en: 'And what is your goal here in Spain?',
    fr: 'Et quel est votre objectif ici en Espagne ?',
  },
  arrival_date: {
    'pt-BR': 'Qual foi (ou será) a sua data de chegada na Espanha? (DD/MM/AAAA)',
    es: '¿Cuál fue (o será) tu fecha de llegada a España? (DD/MM/AAAA)',
    en: 'What was (or will be) your arrival date in Spain? (DD/MM/YYYY)',
    fr: 'Quelle a été (ou sera) votre date d’arrivée en Espagne ? (JJ/MM/AAAA)',
  },
  empadronado: {
    'pt-BR': 'Você já está empadronado?',
    es: '¿Ya estás empadronado?',
    en: 'Are you already registered (empadronado)?',
    fr: 'Êtes-vous déjà inscrit (empadronado) ?',
  },
  empadronado_city: {
    'pt-BR': 'Em qual cidade você está empadronado?',
    es: '¿En qué ciudad estás empadronado?',
    en: 'In which city are you registered (empadronado)?',
    fr: 'Dans quelle ville êtes-vous inscrit (empadronado) ?',
  },
  education_superior: {
    'pt-BR': 'Você possui formação superior?',
    es: '¿Tienes formación superior (universitaria)?',
    en: 'Do you have a university degree?',
    fr: 'Avez-vous une formation universitaire ?',
  },
  eu_family: {
    'pt-BR': 'Você possui algum familiar europeu?',
    es: '¿Tienes algún familiar europeo?',
    en: 'Do you have any European family member?',
    fr: 'Avez-vous un membre de votre famille européen ?',
  },
  europe_6m: {
    'pt-BR': 'Você esteve na Europa nos últimos 6 meses?',
    es: '¿Has estado en Europa en los últimos 6 meses?',
    en: 'Have you been in Europe in the last 6 months?',
    fr: 'Avez-vous été en Europe au cours des 6 derniers mois ?',
  },
}

const GENERIC_PROMPT: Record<string, string> = {
  'pt-BR': 'Faltou só uma informação:',
  es: 'Solo falta un dato:',
  en: 'Just one detail missing:',
  fr: 'Il manque juste une information :',
}

/** Campos marcados como obrigatórios na etapa "Pergunta geral". */
export function requiredFieldsOf(step: FlowStep): RequiredCaptureField[] {
  if (!isGeneralCaptureStep(step)) return []
  const cfg = generalCaptureOf(step)
  return (cfg.fields || []).filter((f: any) => f?.required === true) as RequiredCaptureField[]
}

/** Valores conhecidos até aqui (respostas do fluxo + campos interpretados). */
export function knownFieldsOf(steps: FlowStep[], state: FlowRunState): Record<string, string> {
  return {
    ...fieldValuesFromAnswers(steps, (state?.answers || {}) as Record<string, string>),
    ...((state?.captured_fields || {}) as Record<string, string>),
  }
}

/** Campos obrigatórios da etapa que continuam sem valor. */
export function missingRequired(
  step: FlowStep,
  known: Record<string, string>,
  skipped: string[] = [],
): RequiredCaptureField[] {
  const ignore = new Set(skipped || [])
  return requiredFieldsOf(step).filter(
    (f) => !ignore.has(f.target_field) && !pickFieldValue(known, f.target_field),
  )
}

/** Texto da pergunta de um campo obrigatório, no idioma do atendimento. */
export function requiredPrompt(field: RequiredCaptureField, lang: FlowLang = 'pt-BR'): string {
  const custom = field?.prompts && (field.prompts[lang] || field.prompts['pt-BR'])
  if (custom && String(custom).trim()) return String(custom).trim()
  const preset = DEFAULT_PROMPTS[field.source]
  if (preset) return preset[lang] || preset['pt-BR']
  const generic = GENERIC_PROMPT[lang] || GENERIC_PROMPT['pt-BR']
  return `${generic} ${field.source}`
}

/**
 * A mensagem que está saindo já pergunta esse dado? Evita a bolha duplicada
 * quando o texto da etapa ("me comente sobre você: idade, cidade…") já cobre
 * o campo obrigatório.
 */
const FIELD_KEYWORDS: Record<string, RegExp> = {
  full_name: /(nome\s+completo|seu\s+nome|nombre|full\s+name|your\s+name|votre\s+nom)/i,
  email: /(e-?mail|correo|courriel)/i,
  age: /(idade|edad|\bage\b|âge)/i,
  city: /(cidade|ciudad|\bcity\b|ville)/i,
  in_spain: /(na\s+espanha|en\s+espa[ñn]a|in\s+spain|en\s+espagne)/i,
  intent: /(objetivo|goal|but\b|objectif)/i,
  arrival_date: /(chegada|llegada|arrival|arriv[ée]e)/i,
  empadronado: /(empadronad)/i,
  empadronado_city: /(empadronad)/i,
  education_superior: /(forma[çc][ãa]o|superior|universit|degree|dipl[ôo]me)/i,
  eu_family: /(familiar\s+europeu|familiar\s+europeo|european\s+(family|relative)|famille\s+europ)/i,
  europe_6m: /(6\s*meses|6\s*months|6\s*mois|últimos\s+6|ultimos\s+6)/i,
}

export function fieldAlreadyAskedIn(field: RequiredCaptureField, text: string): boolean {
  const t = String(text || '')
  if (!t.trim()) return false
  const re = FIELD_KEYWORDS[field.source]
  return re ? re.test(t) : false
}

/**
 * Reescreve o turno quando ele parou numa "Pergunta geral" que já tem parte
 * dos dados: em vez de repetir a pergunta aberta inteira, o agente pergunta
 * apenas o próximo campo obrigatório que falta.
 *
 * Quando a pergunta da etapa está saindo AGORA e já existe campo obrigatório
 * vazio, a cobrança vai JUNTO na mesma resposta — o obrigatório nunca fica
 * para o turno seguinte.
 */
export function applyRequiredGate(
  steps: FlowStep[],
  turn: FlowTurnResult,
  lang: FlowLang = 'pt-BR',
  extraKnown: Record<string, string> = {},
): FlowTurnResult {
  const code = turn?.state?.current_step
  const byCode = indexSteps(steps)
  const step = code ? byCode.get(code) : null

  // Rede de segurança: nenhum handoff/fim acontece com obrigatório vazio de
  // alguma "Pergunta geral" já percorrida no fluxo.
  if (turn?.finished || turn?.handoff) {
    return enforceRequiredBeforeHandoff(steps, turn, lang, extraKnown)
  }

  if (!step || !isGeneralCaptureStep(step)) return turn

  const required = requiredFieldsOf(step)
  if (!required.length) return turn

  const known = { ...extraKnown, ...knownFieldsOf(steps, turn.state) }
  const skipped = (turn.state?.required_skipped || []) as string[]
  const pending = missingRequired(step, known, skipped)

  const presentedNow = !turn.reasked && (turn.outbound || []).some((o: any) => o?.step_code === code)

  if (!pending.length) {
    return presentedNow
      ? { ...turn, state: { ...turn.state, required_field: '', required_attempts: 0 } }
      : turn
  }

  const next = pending[0]

  if (presentedNow) {
    // A pergunta aberta continua sendo enviada; a cobrança do obrigatório é
    // acrescentada na MESMA resposta (a menos que o texto já a contenha).
    const presentedText = (turn.outbound || [])
      .filter((o: any) => o?.step_code === code)
      .map((o: any) => o?.text || '')
      .join(' ')
    const base = fieldAlreadyAskedIn(next, presentedText)
      ? turn
      : appendMessage(turn, requiredPrompt(next, lang), code)
    return {
      ...base,
      finished: false,
      handoff: false,
      state: {
        ...base.state,
        current_step: code,
        required_field: next.target_field,
        required_attempts: 0,
      },
    }
  }

  const stay = buildStayTurn(step, requiredPrompt(next, lang), turn.state, {
    current_step: code,
    required_field: next.target_field,
    required_attempts: 0,
    captured_fields: { ...(turn.state?.captured_fields || {}) },
  })
  return { ...stay, captured: turn.captured || [], finished: false, handoff: false }
}

/**
 * Antes de encerrar/transferir: se alguma "Pergunta geral" percorrida ainda
 * tem campo obrigatório vazio, o fluxo volta para ela e pergunta.
 */
export function enforceRequiredBeforeHandoff(
  steps: FlowStep[],
  turn: FlowTurnResult,
  lang: FlowLang = 'pt-BR',
  extraKnown: Record<string, string> = {},
): FlowTurnResult {
  const known = { ...extraKnown, ...knownFieldsOf(steps, turn.state) }
  const skipped = (turn.state?.required_skipped || []) as string[]
  const byCode = indexSteps(steps)
  const visited = new Set<string>([
    ...((turn.path || []) as string[]),
    ...Object.keys((turn.state?.answers || {}) as Record<string, string>),
  ])

  for (const code of visited) {
    const step = byCode.get(code)
    if (!step || !isGeneralCaptureStep(step)) continue
    const pending = missingRequired(step, known, skipped)
    if (!pending.length) continue
    const next = pending[0]
    const stay = buildStayTurn(step, requiredPrompt(next, lang), turn.state, {
      current_step: code,
      required_field: next.target_field,
      required_attempts: 0,
      captured_fields: { ...(turn.state?.captured_fields || {}) },
    })
    return { ...stay, captured: turn.captured || [], finished: false, handoff: false }
  }
  return turn
}


