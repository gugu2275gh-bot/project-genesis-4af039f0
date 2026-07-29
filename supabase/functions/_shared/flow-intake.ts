// @ts-nocheck
/**
 * Aproveitamento da PRIMEIRA mensagem do cliente no fluxo pré-handoff.
 *
 * Extrai da frase inicial os dados que já respondem etapas do fluxo
 * (nome, se está na Espanha, intenção, data de chegada, empadronamento…),
 * converte para respostas de etapa (via `field_mapping`) e monta a saudação
 * humana que reconhece o que a pessoa já contou.
 *
 * Módulo PURO: a chamada ao LLM é injetada pelo chamador (`callLLM`).
 */

import {
  inferFieldMapping,
  prependMessage,
  stepKindOf,
  validateAnswer,
  type FlowLang,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'

export interface IntakeExtraction {
  full_name?: string | null
  email?: string | null
  /** 'sim' | 'nao' */
  in_spain?: string | null
  intent?: string | null
  arrival_date?: string | null
  arrival_days_ago?: number | null
  empadronado?: string | null
  empadronado_city?: string | null
  /** Idade em anos. */
  age?: number | string | null
  /** Cidade onde a pessoa mora hoje. */
  city?: string | null
  /** 'sim' | 'nao' — possui formação superior. */
  education_superior?: string | null
  /** 'sim' | 'nao' — possui familiar europeu. */
  eu_family?: string | null
  /** 'sim' | 'nao' — esteve na Europa nos últimos 6 meses. */
  europe_6m?: string | null
  confidence?: Record<string, number>
}

/** Dados que a IA sabe interpretar, com o campo do CRM usado por padrão. */
export const CAPTURE_SOURCES: { source: string; default_target: string }[] = [
  { source: 'full_name', default_target: 'contact.full_name' },
  { source: 'email', default_target: 'contact.email' },
  { source: 'in_spain', default_target: 'funnel.location_known' },
  { source: 'intent', default_target: 'funnel.interest_confirmed' },
  { source: 'arrival_date', default_target: 'funnel.entry_date_confirmed' },
  { source: 'empadronado', default_target: 'funnel.empadronado_confirmed' },
  { source: 'empadronado_city', default_target: 'funnel.empadronado_city' },
  { source: 'age', default_target: 'outside.age' },
  { source: 'city', default_target: 'funnel.empadronado_city' },
  { source: 'education_superior', default_target: 'contact.education_level' },
  { source: 'eu_family', default_target: 'contact.has_eu_family_member' },
  { source: 'europe_6m', default_target: 'contact.eu_entry_last_6_months' },
]


export interface IntakeConfig {
  enabled: boolean
  /** field_mappings que podem ser aproveitados (vazio = todos). */
  fields: string[]
  /** Confiança mínima (0..1) para aceitar um dado extraído. */
  min_confidence: number
  /** Saudação usada quando nada foi aproveitado. */
  greeting_default: Record<string, string>
  /** Saudação usada quando houve aproveitamento ({nome}, {resumo}). */
  greeting_personalized: Record<string, string>
  /** Frase curta de reconhecimento humano ({nome}). */
  ack_message: Record<string, string>
}

export const DEFAULT_INTAKE_CONFIG: IntakeConfig = {
  enabled: false,
  fields: [],
  min_confidence: 0.7,
  greeting_default: {},
  greeting_personalized: {
    'pt-BR': 'Olá, {nome}! 😊 Sou a assistente virtual da CB Asesoria. {resumo} Vou continuar de onde você parou.',
    es: '¡Hola, {nome}! 😊 Soy la asistente virtual de CB Asesoria. {resumo} Sigo desde donde te quedaste.',
    en: 'Hi, {nome}! 😊 I am CB Asesoria’s virtual assistant. {resumo} Let’s continue from there.',
    fr: 'Bonjour, {nome} ! 😊 Je suis l’assistante virtuelle de CB Asesoria. {resumo} Continuons à partir de là.',
  },
  ack_message: {
    'pt-BR': 'Perfeito, obrigada!',
    es: '¡Perfecto, gracias!',
    en: 'Perfect, thank you!',
    fr: 'Parfait, merci !',
  },
}

export function normalizeIntakeConfig(raw: unknown): IntakeConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<IntakeConfig>
  const conf = Number(v.min_confidence)
  return {
    enabled: v.enabled === true,
    fields: Array.isArray(v.fields) ? v.fields.map((f) => String(f || '')).filter(Boolean) : [],
    min_confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : DEFAULT_INTAKE_CONFIG.min_confidence,
    greeting_default: (v.greeting_default && typeof v.greeting_default === 'object' ? v.greeting_default : {}) as Record<string, string>,
    greeting_personalized: (v.greeting_personalized && typeof v.greeting_personalized === 'object' && Object.keys(v.greeting_personalized).length
      ? v.greeting_personalized
      : DEFAULT_INTAKE_CONFIG.greeting_personalized) as Record<string, string>,
    ack_message: (v.ack_message && typeof v.ack_message === 'object' && Object.keys(v.ack_message).length
      ? v.ack_message
      : DEFAULT_INTAKE_CONFIG.ack_message) as Record<string, string>,
  }
}

// ---------------------------------------------------------------------------
// Prompt + parsing

export function buildIntakePrompt(message: string): string {
  return `Você extrai dados de uma PRIMEIRA mensagem de um cliente de uma assessoria de imigração na Espanha.
Retorne APENAS um JSON válido, sem markdown, com as chaves abaixo. Inclua SOMENTE o que foi dito
EXPLICITAMENTE. Nunca invente. Campos desconhecidos devem ser null.

{
  "full_name": "nome completo ou primeiro nome dito pela pessoa, ou null",
  "email": "e-mail ou null",
  "in_spain": "sim | nao | null (a pessoa está fisicamente na Espanha agora?)",
  "intent": "resumo curto do objetivo (ex.: estudar, trabalhar, residência, nacionalidade) ou null",
  "arrival_date": "DD/MM/AAAA se a data de chegada na Espanha foi dita, senão null",
  "arrival_days_ago": número inteiro se disse algo como "estou aqui há 5 dias", senão null,
  "empadronado": "sim | nao | null",
  "empadronado_city": "cidade do empadronamento ou null",
  "confidence": { "full_name": 0..1, "in_spain": 0..1, "intent": 0..1, "arrival_date": 0..1, "empadronado": 0..1 }
}

Mensagem do cliente:
"""${String(message || '').slice(0, 1500)}"""`
}

export function parseIntakeJson(raw: string): IntakeExtraction | null {
  const text = String(raw || '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0])
    return obj && typeof obj === 'object' ? (obj as IntakeExtraction) : null
  } catch {
    return null
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function daysAgoToDate(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - Math.max(0, Math.round(days)) * 86400000)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Extração → respostas de etapa

/** Valores extraídos convertidos para o vocabulário de `field_mapping`. */
export function extractionToFieldValues(
  extraction: IntakeExtraction,
  minConfidence = 0.7,
  now: Date = new Date(),
): Record<string, string> {
  const out: Record<string, string> = {}
  const conf = (key: string) => {
    const c = Number(extraction?.confidence?.[key])
    return Number.isFinite(c) ? c : 1
  }
  const norm = (v: unknown) => String(v ?? '').trim()
  const yesNo = (v: unknown): string => {
    const t = norm(v).toLowerCase()
    if (['sim', 'si', 'sí', 'yes', 'true', 'oui'].includes(t)) return 'sim'
    if (['nao', 'não', 'no', 'false', 'non'].includes(t)) return 'nao'
    return ''
  }

  if (norm(extraction.full_name) && conf('full_name') >= minConfidence) {
    out['contact.full_name'] = norm(extraction.full_name)
  }
  if (norm(extraction.email)) out['contact.email'] = norm(extraction.email)

  const inSpain = yesNo(extraction.in_spain)
  if (inSpain && conf('in_spain') >= minConfidence) {
    out['funnel.location_known'] = inSpain
  }

  if (norm(extraction.intent) && conf('intent') >= minConfidence) {
    out['funnel.interest_confirmed'] = norm(extraction.intent)
    out['lead.service_interest'] = norm(extraction.intent)
  }

  let arrival = norm(extraction.arrival_date)
  if (!arrival && Number.isFinite(Number(extraction.arrival_days_ago))) {
    arrival = daysAgoToDate(Number(extraction.arrival_days_ago), now)
  }
  if (arrival && conf('arrival_date') >= minConfidence) {
    out['funnel.entry_date_confirmed'] = arrival
    out['contact.spain_arrival_date'] = arrival
  }

  const emp = yesNo(extraction.empadronado)
  if (emp && conf('empadronado') >= minConfidence) {
    out['funnel.empadronado_confirmed'] = emp
    out['contact.is_empadronado'] = emp
  }
  if (norm(extraction.empadronado_city)) {
    out['funnel.empadronado_city'] = norm(extraction.empadronado_city)
    out['contact.empadronamiento_city'] = norm(extraction.empadronado_city)
  }

  return out
}

/**
 * Casa os valores extraídos com as etapas do fluxo (via `field_mapping`
 * explícito ou inferido) e devolve `step_code -> resposta` já validada.
 */
export function prefillFromFieldValues(
  steps: FlowStep[],
  fieldValues: Record<string, string>,
  allowedFields: string[] = [],
): Record<string, string> {
  const allow = new Set((allowedFields || []).filter(Boolean))
  const prefilled: Record<string, string> = {}

  for (const step of steps || []) {
    const field = inferFieldMapping(step)
    if (!field) continue
    if (allow.size && !allow.has(field)) continue
    const raw = fieldValues[field]
    if (!raw) continue
    const check = validateAnswer(step, raw)
    if (!check.valid) continue
    prefilled[step.step_code] = check.value ?? raw
  }

  return prefilled
}

// ---------------------------------------------------------------------------
// Saudação humana

const SUMMARY_TEMPLATES: Record<string, { spain: string; outside: string; intent: string; joiner: string }> = {
  'pt-BR': { spain: 'Vi que você já está na Espanha', outside: 'Vi que você ainda não está na Espanha', intent: 'e que seu objetivo é {intencao}', joiner: '. ' },
  es: { spain: 'Vi que ya estás en España', outside: 'Vi que todavía no estás en España', intent: 'y que tu objetivo es {intencao}', joiner: '. ' },
  en: { spain: 'I see you are already in Spain', outside: 'I see you are not in Spain yet', intent: 'and that your goal is {intencao}', joiner: '. ' },
  fr: { spain: 'Je vois que vous êtes déjà en Espagne', outside: 'Je vois que vous n’êtes pas encore en Espagne', intent: 'et que votre objectif est {intencao}', joiner: '. ' },
}

export function buildIntakeSummary(fieldValues: Record<string, string>, lang: FlowLang): string {
  const t = SUMMARY_TEMPLATES[String(lang)] || SUMMARY_TEMPLATES['pt-BR']
  const parts: string[] = []
  const loc = fieldValues['funnel.location_known']
  if (loc === 'sim') parts.push(t.spain)
  else if (loc === 'nao') parts.push(t.outside)
  const intent = fieldValues['funnel.interest_confirmed']
  if (intent) parts.push(t.intent.replace('{intencao}', intent))
  if (!parts.length) return ''
  return `${parts.join(' ')}.`
}

function firstName(full: string): string {
  return String(full || '').trim().split(/\s+/)[0] || ''
}

export function renderIntakeGreeting(
  cfg: IntakeConfig,
  lang: FlowLang,
  fieldValues: Record<string, string>,
): string {
  const name = firstName(fieldValues['contact.full_name'] || '')
  const summary = buildIntakeSummary(fieldValues, lang)
  const hasData = !!name || !!summary
  const bag = hasData ? cfg.greeting_personalized : cfg.greeting_default
  const template = String(bag?.[String(lang)] ?? bag?.['pt-BR'] ?? '').trim()
  if (!template) return ''
  return template
    .replace(/\{nome\}/g, name)
    .replace(/\{resumo\}/g, summary)
    .replace(/\{intencao\}/g, fieldValues['funnel.interest_confirmed'] || '')
    .replace(/\{localizacao\}/g, fieldValues['funnel.location_known'] || '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Remove as mensagens das etapas INFORMATIVAS de abertura (as que vêm antes da
 * primeira pergunta) quando a saudação do intake já cumpre esse papel — evita
 * mandar duas saudações seguidas.
 */
export function dropOpeningMessages(turn: FlowTurnResult, steps: FlowStep[]): FlowTurnResult {
  const byCode = new Map((steps || []).map((s) => [s.step_code, s]))
  const drop = new Set<string>()
  for (const code of turn.path || []) {
    const step = byCode.get(code)
    if (!step) continue
    const kind = stepKindOf(step)
    if (kind === 'INICIO') continue
    if (kind === 'INFORMATIVA') {
      drop.add(code)
      continue
    }
    break // chegou na primeira pergunta: para de suprimir
  }
  if (!drop.size) return turn
  const outbound = (turn.outbound || []).filter((m: any) => !drop.has(String(m.step_code)))
  return { ...turn, outbound, messages: outbound.map((m: any) => m.text) }
}

/** Prefixa a saudação do intake (personalizada ou padrão) no turno. */
export function prependIntakeGreeting(turn: FlowTurnResult, greeting: string): FlowTurnResult {
  return prependMessage(turn, greeting, 'intake')
}

export function renderAckMessage(cfg: IntakeConfig, lang: FlowLang, name?: string): string {
  const template = String(cfg.ack_message?.[String(lang)] ?? cfg.ack_message?.['pt-BR'] ?? '').trim()
  if (!template) return ''
  return template.replace(/\{nome\}/g, firstName(name || '')).replace(/\s{2,}/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Orquestração (com LLM injetado)

/** Motivo do resultado do intake — sempre registrado em log. */
export type IntakeReason =
  | 'ok'
  | 'disabled'
  | 'short_message'
  | 'llm_error'
  | 'parse_error'
  | 'no_data'
  | 'no_match'

export interface IntakeResult {
  fieldValues: Record<string, string>
  prefilled: Record<string, string>
  greeting: string
  reason: IntakeReason
  /** Detalhe do erro do LLM (status/mensagem), quando houver. */
  detail?: string
}

export async function runIntake(params: {
  message: string
  steps: FlowStep[]
  lang: FlowLang
  config: IntakeConfig
  callLLM: (prompt: string) => Promise<string>
  now?: Date
}): Promise<IntakeResult> {
  const empty = (reason: IntakeReason, detail?: string): IntakeResult => ({
    fieldValues: {},
    prefilled: {},
    greeting: '',
    reason,
    ...(detail ? { detail } : {}),
  })
  const { message, steps, lang, config, callLLM } = params
  if (!config?.enabled) return empty('disabled')
  if (!message || String(message).trim().length < 5) return empty('short_message')

  let raw = ''
  try {
    raw = await callLLM(buildIntakePrompt(message))
  } catch (e) {
    return empty('llm_error', e instanceof Error ? e.message : String(e))
  }

  const extraction = parseIntakeJson(raw)
  if (!extraction) return empty('parse_error', String(raw || '').slice(0, 200))

  const fieldValues = extractionToFieldValues(extraction, config.min_confidence, params.now)
  const allowed = config.fields || []
  const filtered: Record<string, string> = {}
  for (const [k, v] of Object.entries(fieldValues)) {
    if (allowed.length && !allowed.includes(k)) continue
    filtered[k] = v
  }

  const prefilled = prefillFromFieldValues(steps, filtered, allowed)

  // A saudação personalizada usa TUDO que foi entendido — inclusive um primeiro
  // nome que não serve para responder a etapa de "nome completo".
  const greeting = renderIntakeGreeting(config, lang, filtered)

  let reason: IntakeReason = 'ok'
  if (!Object.keys(filtered).length) reason = 'no_data'
  else if (!Object.keys(prefilled).length) reason = 'no_match'

  return { fieldValues: filtered, prefilled, greeting, reason }
}

