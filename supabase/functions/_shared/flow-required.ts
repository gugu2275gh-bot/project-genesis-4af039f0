// @ts-nocheck
/**
 * Campos obrigatórios da etapa "Pergunta geral".
 *
 * A etapa aproveita tudo que o cliente já contou. Quando algum campo marcado
 * como OBRIGATÓRIO continua vazio, o agente não segue (nem transfere para o
 * humano) antes de perguntar — um campo por vez, sem repetir o que já sabe.
 */

import {
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
 * Reescreve o turno quando ele parou numa "Pergunta geral" que já tem parte
 * dos dados: em vez de repetir a pergunta aberta inteira, o agente pergunta
 * apenas o próximo campo obrigatório que falta.
 */
export function applyRequiredGate(
  steps: FlowStep[],
  turn: FlowTurnResult,
  lang: FlowLang = 'pt-BR',
  extraKnown: Record<string, string> = {},
): FlowTurnResult {
  const code = turn?.state?.current_step
  if (!code || turn?.finished) return turn
  const step = indexSteps(steps).get(code)
  if (!step || !isGeneralCaptureStep(step)) return turn

  const required = requiredFieldsOf(step)
  if (!required.length) return turn

  const known = { ...extraKnown, ...knownFieldsOf(steps, turn.state) }
  const skipped = (turn.state?.required_skipped || []) as string[]
  const pending = missingRequired(step, known, skipped)
  if (!pending.length) return turn

  // Nada conhecido ainda: a pergunta aberta original é a melhor abertura.
  const anyKnown = required.some((f) => !!pickFieldValue(known, f.target_field))
  if (!anyKnown && !turn.reasked && (turn.outbound || []).length) {
    return { ...turn, state: { ...turn.state, required_field: '', required_attempts: 0 } }
  }

  const next = pending[0]
  const stay = buildStayTurn(step, requiredPrompt(next, lang), turn.state, {
    current_step: code,
    required_field: next.target_field,
    required_attempts: 0,
    captured_fields: { ...(turn.state?.captured_fields || {}) },
  })
  return { ...stay, captured: turn.captured || [], finished: false, handoff: false }
}
