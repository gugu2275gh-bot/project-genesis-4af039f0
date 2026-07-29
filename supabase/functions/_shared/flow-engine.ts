// @ts-nocheck
/**
 * Flow Engine — executor determinístico dos fluxos desenhados no editor visual
 * ("Gestão de Agentes de IA" → Fluxos → Editor visual).
 *
 * É PURO (não acessa banco nem rede) para ser testável. Recebe:
 *  - o grafo de etapas (`ai_agent_flow_steps`)
 *  - o estado da conversa (`FlowRunState`)
 *  - a mensagem do cliente
 * e devolve as mensagens a enviar e o novo estado.
 *
 * O LLM nunca decide transições: apenas o grafo decide.
 */

export type FlowLang = 'pt-BR' | 'es' | 'en' | 'fr'

export type StepKind = 'INICIO' | 'INFORMATIVA' | 'PERGUNTA' | 'FIM'

export interface FlowBranch {
  id?: string
  label?: string
  match_type?: 'IGUAL' | 'CONTEM' | 'REGEX' | 'INTENCAO' | 'QUALQUER'
  value?: string
  /** Equivalentes aceitos (traduções e variações) além do valor principal. */
  synonyms?: string[]
  next_step_code?: string | null
}


export interface FlowStep {
  id: string
  step_code: string
  name?: string
  message?: string
  messages?: Record<string, string | string[]>
  reask_messages?: Record<string, string>
  answer_type?: string
  validation?: Record<string, unknown>
  next_step_code?: string | null
  branches?: FlowBranch[]
  handoff?: boolean
  order_index?: number
  /** Campo do CRM onde a resposta desta etapa deve ser gravada (opcional). */
  field_mapping?: string | null
  /** Fase do fluxo de origem ("PRE_HANDOFF" | "HANDOFF"). */
  phase?: string | null
}

export interface FlowRunState {
  /** Etapa aguardando resposta do cliente (null = fluxo não iniciado). */
  current_step?: string | null
  /** Respostas coletadas por step_code. */
  answers?: Record<string, string>
  /** Etapas já executadas (evita repetir mensagens/loops). */
  visited?: string[]
  /** Tentativas inválidas na etapa atual. */
  attempts?: number
  /** Vezes que o cliente disse "não sei" na etapa atual. */
  unknown_attempts?: number
  /** Tentativas rejeitadas pela checagem na base de conhecimento. */
  kb_attempts?: number
  /** Campos já entendidos (`field_mapping` -> valor), acumulados no atendimento. */
  captured_fields?: Record<string, string>
  /** Campo obrigatório sendo perguntado agora numa "Pergunta geral". */
  required_field?: string
  /** Insistências no campo obrigatório atual. */
  required_attempts?: number
  /** Campos obrigatórios desistidos após as tentativas. */
  required_skipped?: string[]

  /** Fluxo concluído (chegou a uma etapa FIM). */
  finished?: boolean
  /** Handoff disparado pela etapa final. */
  handoff?: boolean
  /** Idioma travado do atendimento. */
  lang?: FlowLang
}

/** Resposta validada que deve ser gravada num campo do CRM. */
export interface FlowCapturedField {
  step_code: string
  field: string
  value: string
}

/**
 * Mensagem de saída com o metadado da etapa que a originou.
 * `quick_reply` é decidido EXCLUSIVAMENTE pela configuração da etapa —
 * a camada de envio nunca pode inferir botões pelo texto.
 */
export interface FlowOutboundMessage {
  text: string
  step_code: string
  quick_reply: boolean
}

export interface FlowTurnResult {
  messages: string[]
  /** Mesmas mensagens de `messages`, com metadado por etapa. */
  outbound: FlowOutboundMessage[]
  state: FlowRunState
  /** true quando a etapa atual não aceitou a resposta. */
  reasked: boolean
  /** true quando não há mais etapas (fluxo terminou). */
  finished: boolean
  handoff: boolean
  /** Etapas percorridas neste turno (para logs). */
  path: string[]
  /** Respostas com `field_mapping` capturadas neste turno. */
  captured: FlowCapturedField[]
}

/** Limite de botões de resposta rápida do WhatsApp. */
export const WHATSAPP_BUTTON_LIMIT = 3

/** Rótulos Sim/Não por idioma (mesmos usados na camada Twilio). */
const YES_NO_LABELS: Record<string, [string, string]> = {
  'pt-BR': ['Sim', 'Não'],
  es: ['Sí', 'No'],
  en: ['Yes', 'No'],
  fr: ['Oui', 'Non'],
}

const YES_NO_ALIASES = {
  yes: ['sim', 'sí', 'si', 'yes', 'oui'],
  no: ['não', 'nao', 'no', 'non'],
}

/** Opções base (idioma de cadastro) da etapa. */
export function optionsOf(step: FlowStep): string[] {
  const v = (step?.validation || {}) as Record<string, unknown>
  const raw = Array.isArray(v.options) ? v.options : []
  return raw.map((o) => String(o ?? '').trim()).filter(Boolean)
}

/** Código curto do idioma usado nas traduções salvas no editor. */
function langKey(lang: FlowLang): string {
  const l = String(lang || 'pt-BR')
  if (l.startsWith('pt')) return 'pt'
  if (l.startsWith('es')) return 'es'
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('fr')) return 'fr'
  return 'pt'
}

function normalizeOptionLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function yesNoSide(value: unknown): 'yes' | 'no' | null {
  const normalized = normalizeOptionLabel(value)
  if (YES_NO_ALIASES.yes.map(normalizeOptionLabel).includes(normalized)) return 'yes'
  if (YES_NO_ALIASES.no.map(normalizeOptionLabel).includes(normalized)) return 'no'
  return null
}

function isBinaryYesNoOptions(options: string[]): boolean {
  if (options.length !== 2) return false
  const sides = options.map(yesNoSide)
  return sides.includes('yes') && sides.includes('no')
}

function localizedBinaryYesNoOptions(base: string[], lang: FlowLang): string[] {
  const [yes, no] = YES_NO_LABELS[String(lang)] || YES_NO_LABELS['pt-BR']
  return base.map((option) => (yesNoSide(option) === 'yes' ? yes : no))
}

/**
 * Rótulos das opções no idioma da conversa. Usa `validation.options_i18n`
 * (traduzido no editor) e cai para o rótulo original quando não houver
 * tradução para aquela posição.
 */
export function localizedOptions(step: FlowStep, lang: FlowLang): string[] {
  const base = optionsOf(step)
  const v = (step?.validation || {}) as Record<string, any>
  const dict = v.options_i18n && typeof v.options_i18n === 'object' ? v.options_i18n : {}
  const translated = Array.isArray(dict[langKey(lang)]) ? dict[langKey(lang)] : []
  const mapped = base.map((o, i) => String(translated[i] ?? '').trim() || o)
  if (isBinaryYesNoOptions(base) && !Array.isArray(dict[langKey(lang)])) {
    return localizedBinaryYesNoOptions(base, lang)
  }
  return mapped
}

/**
 * Converte um rótulo traduzido digitado/clicado pelo cliente de volta para a
 * opção base — é sobre a opção base que os caminhos (branches) comparam.
 */
export function canonicalOption(step: FlowStep, answer: string): string | null {
  const text = String(answer || '').trim().toLowerCase()
  const normalizedText = normalizeOptionLabel(answer)
  if (!text) return null
  const base = optionsOf(step)
  if (!base.length) return null
  const v = (step?.validation || {}) as Record<string, any>
  const dict = v.options_i18n && typeof v.options_i18n === 'object' ? v.options_i18n : {}
  for (let i = 0; i < base.length; i++) {
    const autoYesNo = isBinaryYesNoOptions(base)
      ? Object.keys(YES_NO_LABELS).map((lang) => localizedBinaryYesNoOptions(base, lang as FlowLang)[i])
      : []
    const candidates = [base[i], ...autoYesNo, ...Object.values(dict).map((arr: any) => (Array.isArray(arr) ? arr[i] : ''))]
      .map((c) => String(c ?? '').trim().toLowerCase())
      .filter(Boolean)
    const normalizedCandidates = candidates.map(normalizeOptionLabel)
    if (candidates.includes(text) || normalizedCandidates.includes(normalizedText)) return base[i]
  }
  return null
}

/**
 * Botões que a etapa deve oferecer no WhatsApp, já no idioma da conversa.
 * Vazio quando a etapa não usa botões.
 */
export function buttonsOf(step: FlowStep, lang: FlowLang): string[] {
  const answerType = String(step?.answer_type || '').toUpperCase()
  if (!quickReplyOf(step)) return []
  if (answerType === 'SIM_NAO') {
    const [yes, no] = YES_NO_LABELS[String(lang)] || YES_NO_LABELS['pt-BR']
    return [yes, no]
  }
  return localizedOptions(step, lang).slice(0, WHATSAPP_BUTTON_LIMIT)
}

/**
 * A etapa deve ser enviada com botões?
 *  - `SIM_NAO`: só quando `validation.quick_reply` está marcado.
 *  - `BOTOES`: sempre (é a intenção do tipo), desde que caiba em 3 opções.
 *  - `SELECAO`: quando `validation.quick_reply` está marcado e cabe em 3.
 */
export function quickReplyOf(step: FlowStep): boolean {
  const v = (step?.validation || {}) as Record<string, unknown>
  const answerType = String(step?.answer_type || '').toUpperCase()
  if (answerType === 'SIM_NAO') return v.quick_reply === true
  const count = optionsOf(step).length
  if (!count || count > WHATSAPP_BUTTON_LIMIT) return false
  if (answerType === 'BOTOES') return v.quick_reply !== false
  if (answerType === 'SELECAO') return v.quick_reply === true
  return false
}



/**
 * Se a etapa deve enviar uma frase curta de reconhecimento humano antes da
 * próxima pergunta. Padrão: DESLIGADO em todas as etapas.
 * `validation.ack_enabled` sobrepõe o padrão.
 */
export function ackEnabledFor(step: FlowStep): boolean {
  const v = (step?.validation || {}) as Record<string, unknown>
  if (typeof v.ack_enabled === 'boolean') return v.ack_enabled
  return false
}


/** Insere uma mensagem no início do turno (usada pela frase de reconhecimento). */
export function prependMessage(turn: FlowTurnResult, text: string, stepCode = 'ack'): FlowTurnResult {
  const clean = String(text || '').trim()
  if (!clean) return turn
  return {
    ...turn,
    messages: [clean, ...(turn.messages || [])],
    outbound: [{ text: clean, step_code: stepCode, quick_reply: false }, ...(turn.outbound || [])],
  }
}





const MAX_STEPS_PER_TURN = 25

// ---------------------------------------------------------------------------
// Helpers de leitura do grafo

export function stepKindOf(step: FlowStep): StepKind {
  const k = (step?.validation as any)?.step_kind
  // "Pergunta geral" é uma PERGUNTA para o grafo: envia o texto e espera a
  // resposta. A diferença (interpretar vários campos) é tratada no turno.
  if (k === 'PERGUNTA_GERAL') return 'PERGUNTA'
  if (k === 'INICIO' || k === 'INFORMATIVA' || k === 'PERGUNTA' || k === 'FIM') return k
  return 'PERGUNTA'
}

/** Configuração de interpretação multi-campo da etapa "Pergunta geral". */
export interface StepGeneralCapture {
  enabled: boolean
  /** Pares "dado interpretado" -> "campo do CRM". */
  fields: { source: string; target_field: string; required?: boolean; prompts?: Record<string, string> }[]
  min_confidence: number
  /**
   * Quantos campos precisam ser entendidos para a etapa ser considerada
   * respondida (e portanto pulada quando os dados vieram na 1ª mensagem).
   */
  min_fields: number
}

export function generalCaptureOf(step: FlowStep): StepGeneralCapture {
  const v = (step?.validation || {}) as Record<string, any>
  const raw = (v.general_capture || {}) as Record<string, any>
  const isGeneral = v.step_kind === 'PERGUNTA_GERAL'
  const conf = Number(raw.min_confidence)
  const fields = Array.isArray(raw.fields)
    ? raw.fields
        .map((f: any) => ({
          source: String(f?.source || '').trim(),
          target_field: String(f?.target_field || '').trim(),
          required: f?.required === true,
          prompts: (f?.prompts && typeof f.prompts === 'object' ? f.prompts : {}) as Record<string, string>,
        }))
        .filter((f: any) => f.source && f.target_field)
    : []
  const minFieldsRaw = Number(raw.min_fields)
  const minFields = Number.isFinite(minFieldsRaw) && minFieldsRaw > 0 ? Math.round(minFieldsRaw) : 2
  return {
    enabled: isGeneral && raw.enabled !== false && fields.length > 0,
    fields,
    min_confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.7,
    min_fields: Math.max(1, Math.min(minFields, fields.length || 1)),
  }
}

/** `true` quando a etapa é a "Pergunta geral" (interpretação multi-campo). */
export function isGeneralCaptureStep(step: FlowStep): boolean {
  return (step?.validation as any)?.step_kind === 'PERGUNTA_GERAL'
}


export function messagesOf(step: FlowStep, lang: FlowLang): string[] {
  const raw = step?.messages || {}
  const pick = (raw as any)[lang] ?? (raw as any)['pt-BR'] ?? Object.values(raw)[0]
  const list = Array.isArray(pick) ? pick : pick ? [pick] : []
  const out = list.map((m: any) => String(m || '').trim()).filter(Boolean)
  if (out.length) return out
  const legacy = String(step?.message || '').trim()
  return legacy ? [legacy] : []
}

export function reaskOf(step: FlowStep, lang: FlowLang): string {
  const raw = step?.reask_messages || {}
  const pick = (raw as any)[lang] ?? (raw as any)['pt-BR'] ?? Object.values(raw)[0]
  return String(pick || '').trim()
}

// ---------------------------------------------------------------------------
// "Resposta diferente do esperado" — configuração POR ETAPA
// (validation.unexpected_answer, com retrocompatibilidade para unknown_answer)

export type UnexpectedAnswerMode = 'INSISTIR' | 'ACEITAR_APROXIMADO' | 'PULAR' | 'ENCAMINHAR'
export type UnknownAnswerMode = UnexpectedAnswerMode

/** Situações em que a resposta é diferente do esperado. */
export type DeviationKind = 'unknown' | 'invalid_format' | 'no_match' | 'off_topic'

export const DEVIATION_KINDS: DeviationKind[] = ['unknown', 'invalid_format', 'no_match', 'off_topic']

export interface UnexpectedRule {
  /** Quando falso, a situação segue a regra de "não sabe / não lembra". */
  enabled: boolean
  mode: UnexpectedAnswerMode
  /** Mensagem de acolhimento (multi-idioma) enviada antes de aplicar o modo. */
  messages: Record<string, string>
  /** Quantas vezes acolher/insistir antes de aplicar o modo. */
  attempts: number
  /** Valor gravado quando o modo aceita/pula. */
  fallback_value: string
  /** Frases extras que caracterizam a situação. */
  phrases: string[]
}

export type UnexpectedAnswerConfig = Record<DeviationKind, UnexpectedRule>
/** @deprecated formato antigo e plano. */
export type UnknownAnswerConfig = UnexpectedRule

export const DEFAULT_UNKNOWN_PHRASES: string[] = [
  'nao sei', 'não sei', 'nao lembro', 'não lembro', 'nao me lembro', 'não me lembro',
  'nao faco ideia', 'não faço ideia', 'sei nao', 'sei lá', 'sei la', 'nao tenho certeza',
  'não tenho certeza', 'nao tenho essa informacao', 'não tenho essa informação',
  'no se', 'no sé', 'no recuerdo', 'no me acuerdo', 'ni idea', 'no estoy seguro',
  'no lo se', 'no lo sé',
  "i don't know", 'i dont know', "i don't remember", 'i dont remember', 'no idea',
  'not sure', "i'm not sure", 'im not sure', 'dunno',
  'je ne sais pas', 'aucune idee', 'aucune idée', 'je ne me souviens pas', 'pas sûr', 'pas sur',
]

const DEFAULT_UNKNOWN_MESSAGE: Record<string, string> = {
  'pt-BR': 'Sem problema! Uma informação aproximada já me ajuda. Pode me dar uma estimativa?',
  es: '¡Sin problema! Una información aproximada ya me ayuda. ¿Me puedes dar una estimación?',
  en: 'No problem! An approximate answer already helps. Could you give me an estimate?',
  fr: 'Pas de souci ! Une information approximative m’aide déjà. Pouvez-vous me donner une estimation ?',
}

const DEFAULT_DEVIATION_MESSAGES: Record<DeviationKind, Record<string, string>> = {
  unknown: DEFAULT_UNKNOWN_MESSAGE,
  invalid_format: {
    'pt-BR': 'Acho que a resposta veio em outro formato. Pode me enviar novamente, por favor?',
    es: 'Creo que la respuesta vino en otro formato. ¿Me la puedes enviar de nuevo, por favor?',
    en: 'I think the answer came in a different format. Could you send it again, please?',
    fr: 'Je crois que la réponse est dans un autre format. Pouvez-vous la renvoyer, s’il vous plaît ?',
  },
  no_match: {
    'pt-BR': 'Não consegui encaixar sua resposta nas opções desta pergunta. Pode escolher uma delas?',
    es: 'No pude encajar tu respuesta en las opciones de esta pregunta. ¿Puedes elegir una?',
    en: "I couldn't match your answer to the options for this question. Could you pick one?",
    fr: 'Je n’ai pas pu associer votre réponse aux options de cette question. Pouvez-vous en choisir une ?',
  },
  off_topic: {
    'pt-BR': 'Só para eu não me perder: pode me responder essa pergunta primeiro?',
    es: 'Solo para no perderme: ¿puedes responder primero esta pregunta?',
    en: 'Just so I don’t lose track: could you answer this question first?',
    fr: 'Juste pour ne pas me perdre : pouvez-vous répondre d’abord à cette question ?',
  },
}

function normalizeRule(raw: unknown, enabledDefault = false): UnexpectedRule {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<UnexpectedRule>
  const mode = ['INSISTIR', 'ACEITAR_APROXIMADO', 'PULAR', 'ENCAMINHAR'].includes(String(v.mode))
    ? (v.mode as UnexpectedAnswerMode)
    : 'INSISTIR'
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : enabledDefault,
    mode,
    messages: (v.messages && typeof v.messages === 'object' ? v.messages : {}) as Record<string, string>,
    attempts: Number.isFinite(Number(v.attempts)) ? Math.max(0, Number(v.attempts)) : 1,
    fallback_value: String(v.fallback_value || ''),
    phrases: Array.isArray(v.phrases) ? v.phrases.map((p) => String(p || '')).filter(Boolean) : [],
  }
}

/** Configuração completa da etapa (nova ou convertida do formato antigo). */
export function unexpectedAnswerOf(step: FlowStep): UnexpectedAnswerConfig {
  const v = (step?.validation || {}) as Record<string, unknown>
  const raw = (v.unexpected_answer || {}) as Partial<UnexpectedAnswerConfig>
  const hasNew = DEVIATION_KINDS.some((k) => raw[k] && typeof raw[k] === 'object')
  const legacy = v.unknown_answer
  return {
    unknown: { ...normalizeRule(hasNew ? raw.unknown : legacy, true), enabled: true },
    invalid_format: normalizeRule(hasNew ? raw.invalid_format : undefined),
    no_match: normalizeRule(hasNew ? raw.no_match : undefined),
    off_topic: normalizeRule(hasNew ? raw.off_topic : undefined),
  }
}

/** Regra efetiva de uma situação (cai na regra de "não sabe" quando desativada). */
export function ruleFor(cfg: UnexpectedAnswerConfig, kind: DeviationKind): UnexpectedRule {
  const rule = cfg[kind]
  return rule?.enabled ? rule : cfg.unknown
}

/** @deprecated use unexpectedAnswerOf(step).unknown */
export function unknownAnswerOf(step: FlowStep): UnexpectedRule {
  return unexpectedAnswerOf(step).unknown
}

function normalizeText(v: string): string {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Detecta se o cliente disse que não sabe/não lembra a resposta. */
export function isUnknownAnswer(message: string, cfg?: UnexpectedRule): boolean {
  const text = normalizeText(message)
  if (!text) return false
  const list = [...DEFAULT_UNKNOWN_PHRASES, ...(cfg?.phrases || [])].map(normalizeText).filter(Boolean)
  return list.some((p) => text === p || text.includes(p))
}

/** Detecta se a mensagem casa com as frases extras configuradas numa situação. */
export function matchesRulePhrases(message: string, rule?: UnexpectedRule): boolean {
  const text = normalizeText(message)
  if (!text || !rule?.phrases?.length) return false
  return rule.phrases.map(normalizeText).filter(Boolean).some((p) => text === p || text.includes(p))
}

export function unexpectedMessageOf(rule: UnexpectedRule, kind: DeviationKind, lang: FlowLang): string {
  const raw = rule.messages || {}
  const pick = (raw as any)[lang] ?? (raw as any)['pt-BR'] ?? Object.values(raw).find(Boolean)
  const text = String(pick || '').trim()
  if (text) return text
  const defaults = DEFAULT_DEVIATION_MESSAGES[kind] || DEFAULT_UNKNOWN_MESSAGE
  return defaults[String(lang)] || defaults['pt-BR']
}

/** @deprecated use unexpectedMessageOf */
export function unknownMessageOf(rule: UnexpectedRule, lang: FlowLang): string {
  return unexpectedMessageOf(rule, 'unknown', lang)
}


/**
 * Aceita datas aproximadas ("03/2024", "março de 2024", "2024") e normaliza
 * para DD/MM/YYYY usando o dia 01. Só usada no modo ACEITAR_APROXIMADO.
 */
export function parseApproxDate(raw: string): string | null {
  const text = String(raw || '')
  const mm = /\b(\d{1,2})\s*[\/\-.]\s*((?:19|20)\d{2})\b/.exec(text)
  if (mm) {
    const month = Number(mm[1])
    if (month >= 1 && month <= 12) return `01/${String(month).padStart(2, '0')}/${mm[2]}`
  }
  const MONTHS = [
    ['jan'], ['fev', 'feb'], ['mar'], ['abr', 'apr', 'avr'], ['mai', 'may'], ['jun'],
    ['jul'], ['ago', 'aug', 'aou', 'aoû'], ['set', 'sep'], ['out', 'oct'], ['nov'], ['dez', 'dec'],
  ]
  const norm = normalizeText(text)
  const yr = /\b((?:19|20)\d{2})\b/.exec(norm)
  if (yr) {
    const idx = MONTHS.findIndex((names) => names.some((n) => norm.includes(n)))
    const month = idx >= 0 ? idx + 1 : 1
    return `01/${String(month).padStart(2, '0')}/${yr[1]}`
  }
  return null
}


export function indexSteps(steps: FlowStep[]): Map<string, FlowStep> {
  const map = new Map<string, FlowStep>()
  for (const s of steps || []) {
    if (s?.step_code) map.set(s.step_code, s)
  }
  return map
}

/** Etapa inicial: a marcada como INICIO ou, na falta, a de menor order_index. */
export function findStartStep(steps: FlowStep[]): FlowStep | null {
  const list = [...(steps || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  return list.find((s) => stepKindOf(s) === 'INICIO') || list[0] || null
}

// ---------------------------------------------------------------------------
// Validação de resposta

const YES = /\b(sim|s[íi]|si|yes|yeah|claro|correto|exato|positivo|ok|vale|oui)\b/i
const NO = /\b(n[ãa]o|nao|no|nope|nunca|jamais|negativo|non)\b/i
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const NUMBER = /\d{1,3}/

/** Captura dd/mm/aaaa (aceita `/`, `-` ou `.` e espaços). Ano SEMPRE obrigatório. */
const DATE_DMY = /\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})\b/

/**
 * Valida e normaliza uma data no formato único do sistema: DD/MM/YYYY.
 * - Ano com 4 dígitos é obrigatório (2 dígitos é ambíguo → inválido).
 * - Mês 1..12 e dia válido para o mês/ano (considera ano bissexto).
 * - Formato americano (ex.: 01/24/2026) é rejeitado, pois mês 24 não existe.
 * Retorna a data normalizada `DD/MM/YYYY` ou `null`.
 */
export function parseFlowDate(raw: string): string | null {
  const m = DATE_DMY.exec(String(raw || ''))
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null
  if (month < 1 || month > 12) return null
  if (year < 1900 || year > 2100) return null
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (day < 1 || day > daysInMonth) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(day)}/${pad(month)}/${year}`
}

const DATE_REASK: Record<string, string> = {
  'pt-BR': 'Preciso da data completa no formato DD/MM/AAAA (por exemplo, 24/01/2026). Pode me enviar assim?',
  es: 'Necesito la fecha completa en formato DD/MM/AAAA (por ejemplo, 24/01/2026). ¿Me la puedes enviar así?',
  en: 'I need the full date in DD/MM/YYYY format (for example, 24/01/2026). Could you send it that way?',
  fr: 'J’ai besoin de la date complète au format JJ/MM/AAAA (par exemple, 24/01/2026). Pouvez-vous l’envoyer ainsi ?',
}

/** Mensagem de encerramento quando a etapa não pode ser resolvida pelo bot. */
const HANDOFF_FALLBACK: Record<string, string> = {
  'pt-BR': 'Sem problema — vou passar seu atendimento para um especialista da equipe, que continua com você por aqui.',
  es: 'Sin problema — voy a pasar tu caso a un especialista del equipo, que sigue contigo por aquí.',
  en: 'No problem — I will pass your case to a specialist from our team, who will continue with you here.',
  fr: 'Pas de souci — je transmets votre dossier à un spécialiste de l’équipe, qui poursuivra avec vous ici.',
}

export function defaultHandoffFallback(lang: FlowLang): string {
  return HANDOFF_FALLBACK[String(lang)] || HANDOFF_FALLBACK['pt-BR']
}

export function defaultDateReask(lang: FlowLang): string {
  return DATE_REASK[String(lang)] || DATE_REASK['pt-BR']
}


export function validateAnswer(step: FlowStep, raw: string): { valid: boolean; value?: string; reason?: string } {
  const text = String(raw || '').trim()
  const required = (step?.validation as any)?.required !== false
  if (!text) return required ? { valid: false, reason: 'empty' } : { valid: true, value: '' }

  switch (String(step?.answer_type || 'TEXTO_LIVRE')) {
    case 'EMAIL':
      return EMAIL.test(text) ? { valid: true, value: text } : { valid: false, reason: 'invalid_email' }
    case 'NOME': {
      const words = text.split(/\s+/).filter((w) => /[a-zà-ÿ]{2,}/i.test(w))
      // `name_mode: 'SIMPLES'` aceita só o primeiro nome; padrão exige nome + sobrenome.
      const simple = String((step?.validation as any)?.name_mode || 'COMPLETO').toUpperCase() === 'SIMPLES'
      const min = simple ? 1 : 2
      return words.length >= min ? { valid: true, value: text } : { valid: false, reason: 'not_full_name' }
    }

    case 'SIM_NAO':
      if (YES.test(text)) return { valid: true, value: 'sim' }
      if (NO.test(text)) return { valid: true, value: 'nao' }
      return { valid: false, reason: 'no_yesno' }
    case 'DATA': {
      const parsed = parseFlowDate(text)
      return parsed ? { valid: true, value: parsed } : { valid: false, reason: 'invalid_date' }
    }
    case 'NUMERO':
      return NUMBER.test(text) ? { valid: true, value: text } : { valid: false, reason: 'invalid_number' }
    case 'BOTOES':
    case 'SELECAO':
    case 'MULTIPLA_ESCOLHA': {
      // Rótulo clicado/digitado em qualquer idioma volta para a opção base,
      // que é o valor comparado pelos caminhos do fluxo.
      const canonical = canonicalOption(step, text)
      if (canonical) return { valid: true, value: canonical }
      const hasOptions = optionsOf(step).length > 0
      return hasOptions ? { valid: false, reason: 'no_option_match' } : { valid: true, value: text }
    }
    default:
      return { valid: true, value: text }

  }
}


// ---------------------------------------------------------------------------
// Transição

function branchMatches(branch: FlowBranch, answer: string): boolean {
  const text = String(answer || '').trim()
  // O valor principal e as traduções/variações são aceitos igualmente.
  const values = [String(branch?.value || ''), ...(Array.isArray(branch?.synonyms) ? branch.synonyms : [])]
    .map((v) => String(v || '').trim())
    .filter(Boolean)

  if (branch?.match_type === 'QUALQUER') return true
  if (values.length === 0) return false

  return values.some((value) => {
    switch (branch?.match_type) {
      case 'IGUAL':
        return text.toLowerCase() === value.toLowerCase()
      case 'REGEX':
        try {
          return new RegExp(value, 'i').test(text)
        } catch {
          return false
        }
      case 'INTENCAO':
        // Sem LLM disponível aqui: aproxima por palavras do rótulo/valor.
        return new RegExp(value.split(/\s+/).filter(Boolean).join('|'), 'i').test(text)
      case 'CONTEM':
      default:
        return text.toLowerCase().includes(value.toLowerCase())
    }
  })
}


export function resolveNextCode(step: FlowStep, answer: string): string | null {
  const branches = Array.isArray(step?.branches) ? step.branches : []
  for (const b of branches) {
    if (b?.next_step_code && branchMatches(b, answer)) return b.next_step_code
  }
  // Sem match: usa a saída padrão, ou o primeiro branch sem valor definido.
  if (step?.next_step_code) return step.next_step_code
  const fallback = branches.find((b) => b?.next_step_code && !String(b.value || '').trim())
  return fallback?.next_step_code || branches[0]?.next_step_code || null
}

// ---------------------------------------------------------------------------
// Encadeamento pré-handoff → handoff

/**
 * Junta o fluxo de pré-handoff com o de handoff num único grafo.
 *
 * Toda etapa FIM do pré-handoff que não tenha saída explícita passa a apontar
 * para a etapa inicial do fluxo de handoff (e deixa de encerrar o atendimento),
 * garantindo que o handoff rode automaticamente na sequência.
 */
export function mergeFlows(preSteps: FlowStep[], handoffSteps: FlowStep[]): FlowStep[] {
  const pre = [...(preSteps || [])]
  const hand = [...(handoffSteps || [])]
  if (!pre.length) return hand
  if (!hand.length) return pre

  const handStart = findStartStep(hand)
  if (!handStart) return pre

  const preCodes = new Set(pre.map((s) => s.step_code))
  const chained = pre.map((s) => {
    if (stepKindOf(s) !== 'FIM') return s
    const next = String(s.next_step_code || '').trim()
    if (next && preCodes.has(next)) return s
    return {
      ...s,
      next_step_code: handStart.step_code,
      validation: { ...(s.validation || {}), step_kind: 'INFORMATIVA' },
    }
  })

  // A etapa inicial do handoff vira INFORMATIVA/PERGUNTA comum: só o
  // pré-handoff tem "INICIO" no grafo unificado.
  const normalizedHand = hand.map((s) => {
    if (s.step_code !== handStart.step_code) return s
    if (stepKindOf(s) !== 'INICIO') return s
    return { ...s, validation: { ...(s.validation || {}), step_kind: 'INFORMATIVA' } }
  })

  return [...chained, ...normalizedHand]
}

// ---------------------------------------------------------------------------
// Execução

function captureOf(step: FlowStep, value: string): FlowCapturedField[] {
  // Destino explícito ("Salvar resposta em") tem prioridade; sem ele, o motor
  // infere pelo tipo/código da etapa para que a resposta não fique só no JSON.
  const field = inferFieldMapping(step)
  if (!field) return []
  return [{ step_code: step.step_code, field, value }]
}

/**
 * Avança pelo grafo a partir de `fromCode`, acumulando mensagens de etapas
 * INICIO/INFORMATIVA até parar numa PERGUNTA (aguardando resposta) ou FIM.
 */
function run(
  index: Map<string, FlowStep>,
  fromCode: string | null,
  state: FlowRunState,
  lang: FlowLang,
  captured: FlowCapturedField[] = [],
): FlowTurnResult {
  const messages: string[] = []
  const outbound: FlowOutboundMessage[] = []
  const path: string[] = []
  const visited = new Set(state.visited || [])
  let code: string | null = fromCode
  let guard = 0
  let sawHandoff = false

  while (code && guard++ < MAX_STEPS_PER_TURN) {
    const step = index.get(code)
    if (!step) break
    path.push(code)
    if (step.handoff) sawHandoff = true

    const kind = stepKindOf(step)

    // Pergunta já respondida (ex.: dados aproveitados da 1ª mensagem):
    // não repergunta e não reenvia a mensagem — segue pelo ramo da resposta.
    const knownAnswer = kind === 'PERGUNTA' ? String(state.answers?.[code] ?? '').trim() : ''
    if (kind === 'PERGUNTA' && knownAnswer) {
      visited.add(code)
      const next = resolveNextCode(step, knownAnswer)
      if (!next || next === code) break
      code = next
      continue
    }

    // Nunca reenviar mensagens de uma etapa já executada (evita loops).
    if (!visited.has(code)) {
      const texts = messagesOf(step, lang)
      messages.push(...texts)
      const qr = quickReplyOf(step)
      for (let i = 0; i < texts.length; i++) {
        // Só a última mensagem da etapa carrega a pergunta binária.
        outbound.push({ text: texts[i], step_code: step.step_code, quick_reply: qr && i === texts.length - 1 })
      }
      visited.add(code)
    }

    if (kind === 'PERGUNTA') {
      return {
        messages,
        outbound,
        state: { ...state, current_step: code, visited: [...visited], attempts: 0, unknown_attempts: 0, finished: false },
        reasked: false,
        finished: false,
        handoff: sawHandoff,
        path,
        captured,
      }
    }

    if (kind === 'FIM') {
      return {
        messages,
        outbound,
        state: { ...state, current_step: code, visited: [...visited], finished: true, handoff: sawHandoff || !!step.handoff },
        reasked: false,
        finished: true,
        handoff: sawHandoff || !!step.handoff,
        path,
        captured,
      }
    }
    const next = resolveNextCode(step, '')
    if (!next || next === code) break
    code = next
  }

  return {
    messages,
    outbound,
    state: { ...state, current_step: code, visited: [...visited], finished: true, handoff: sawHandoff || !!state.handoff },
    reasked: false,
    finished: true,
    handoff: sawHandoff,
    path,
    captured,
  }
}


/** Primeiro turno: envia as mensagens de abertura até a primeira pergunta. */
export function startFlow(steps: FlowStep[], lang: FlowLang = 'pt-BR'): FlowTurnResult {
  const index = indexSteps(steps)
  const start = findStartStep(steps)
  if (!start) {
    return { messages: [], outbound: [], state: { finished: true }, reasked: false, finished: true, handoff: false, path: [], captured: [] }
  }
  return run(index, start.step_code, { answers: {}, visited: [], attempts: 0, lang }, lang)
}

/**
 * Primeiro turno com dados já aproveitados da 1ª mensagem do cliente.
 *
 * `prefilled` é um mapa `step_code -> resposta`. As etapas correspondentes são
 * marcadas como respondidas e o motor percorre o grafo desde o INÍCIO,
 * parando na PRIMEIRA pergunta ainda sem resposta (não na etapa seguinte à
 * última aproveitada).
 */
export function startFlowWithPrefill(
  steps: FlowStep[],
  lang: FlowLang = 'pt-BR',
  prefilled: Record<string, string> = {},
  extraCaptured: FlowCapturedField[] = [],
): FlowTurnResult {
  const index = indexSteps(steps)
  const start = findStartStep(steps)
  if (!start) {
    return { messages: [], outbound: [], state: { finished: true }, reasked: false, finished: true, handoff: false, path: [], captured: [] }
  }

  // Só aceita respostas que passem na validação da própria etapa.
  const answers: Record<string, string> = {}
  const captured: FlowCapturedField[] = [...(extraCaptured || [])]
  for (const [code, raw] of Object.entries(prefilled || {})) {
    const step = index.get(code)
    if (!step) continue
    const value = String(raw ?? '').trim()
    if (!value) continue
    // A "Pergunta geral" não tem um formato único de resposta: o que vale é o
    // conjunto de campos já entendidos, validados na origem.
    if (isGeneralCaptureStep(step)) {
      answers[code] = value
      continue
    }
    const check = validateAnswer(step, value)
    if (!check.valid) continue
    answers[code] = check.value ?? value
    captured.push(...captureOf(step, answers[code]))
  }

  const capturedFields: Record<string, string> = {}
  for (const c of captured) {
    if (c?.field && c?.value) capturedFields[c.field] = String(c.value)
  }

  return run(
    index,
    start.step_code,
    { answers, visited: [], attempts: 0, lang, captured_fields: capturedFields },
    lang,
    captured,
  )
}



/** Processa a resposta do cliente na etapa corrente e avança o grafo. */
export function advanceFlow(
  steps: FlowStep[],
  state: FlowRunState,
  message: string,
  lang: FlowLang = 'pt-BR',
  opts: { ack?: string } = {},
): FlowTurnResult {
  const index = indexSteps(steps)

  if (!state?.current_step) return startFlow(steps, lang)
  if (state.finished) {
    return { messages: [], outbound: [], state, reasked: false, finished: true, handoff: !!state.handoff, path: [], captured: [] }
  }

  const step = index.get(state.current_step)
  if (!step) return startFlow(steps, lang)

  const cfg = unexpectedAnswerOf(step)
  const unknownCfg = cfg.unknown

  /** Avança usando a saída padrão da etapa (não altera a sequência do fluxo). */
  const advanceWith = (value: string): FlowTurnResult => {
    const answers = { ...(state.answers || {}), [step.step_code]: value }
    const captured = value ? captureOf(step, value) : []
    const nextCode = resolveNextCode(step, '')
    const nextState: FlowRunState = { ...state, answers, attempts: 0, unknown_attempts: 0 }
    if (!nextCode) {
      return {
        messages: [], outbound: [], state: { ...nextState, finished: true },
        reasked: false, finished: true, handoff: false, path: [step.step_code], captured,
      }
    }
    return run(index, nextCode, nextState, lang, captured)
  }

  const stay = (text: string, patch: Partial<FlowRunState>): FlowTurnResult => ({
    messages: text ? [text] : [],
    outbound: text ? [{ text, step_code: step.step_code, quick_reply: quickReplyOf(step) }] : [],
    state: { ...state, ...patch },
    reasked: true,
    finished: false,
    handoff: false,
    path: [step.step_code],
    captured: [],
  })

  /** Última saída possível: nunca repetir a mesma pergunta em loop. */
  const escalate = (): FlowTurnResult => {
    const v = (step.validation || {}) as Record<string, unknown>
    const fallbackCode = String(v.fallback_step_code || '').trim()
    if (fallbackCode && index.get(fallbackCode)) {
      return run(index, fallbackCode, { ...state, attempts: 0, unknown_attempts: 0 }, lang)
    }
    // Data aproximada, quando o cliente já tiver dado alguma pista.
    if (String(step.answer_type || '') === 'DATA') {
      const approx = parseApproxDate(message)
      if (approx) return advanceWith(approx)
    }
    const required = (v as any).required !== false
    if (!required) return advanceWith('')

    // Etapa obrigatória sem saída: encerra o bot e passa para atendimento humano.
    const text = defaultHandoffFallback(lang)
    return {
      messages: [text],
      outbound: [{ text, step_code: step.step_code }],
      state: { ...state, attempts: 0, unknown_attempts: 0, finished: true, handoff: true },
      reasked: false,
      finished: true,
      handoff: true,
      path: [step.step_code],
      captured: [],
    }
  }

  /**
   * Aplica a tratativa configurada para a situação. Devolve `null` quando o
   * modo é INSISTIR (o chamador decide qual repergunta enviar).
   */
  const applyRule = (kind: DeviationKind, tries: number): FlowTurnResult | null => {
    const rule = ruleFor(cfg, kind)
    if (tries <= rule.attempts) {
      return stay(unexpectedMessageOf(rule, kind, lang), { unknown_attempts: tries })
    }
    const v = (step.validation || {}) as Record<string, unknown>
    switch (rule.mode) {
      case 'ACEITAR_APROXIMADO': {
        if (String(step.answer_type || '') === 'DATA') {
          const approx = parseApproxDate(message)
          if (approx) return advanceWith(approx)
        }
        return advanceWith(rule.fallback_value)
      }
      case 'PULAR':
        return advanceWith(rule.fallback_value)
      case 'ENCAMINHAR': {
        const fallbackCode = String(v.fallback_step_code || '').trim()
        if (fallbackCode && index.get(fallbackCode)) {
          return run(index, fallbackCode, { ...state, attempts: 0, unknown_attempts: 0 }, lang)
        }
        return null
      }
      default:
        return null
    }
  }

  const defaultReask = (reason?: string): string =>
    reaskOf(step, lang)
      || (reason === 'invalid_date' ? defaultDateReask(lang) : '')
      || messagesOf(step, lang).slice(-1)[0]
      || ''

  // 1) Cliente disse que não sabe/não lembra → tratativa da situação "unknown".
  if (isUnknownAnswer(message, unknownCfg)) {
    const tries = (state.unknown_attempts || 0) + 1
    const applied = applyRule('unknown', tries)
    if (applied) return applied
    // INSISTIR (ou ENCAMINHAR sem destino) com tentativas esgotadas: sai do loop.
    return escalate()
  }

  const result = validateAnswer(step, message)
  if (!result.valid) {
    // Classifica o desvio para escolher a tratativa configurada na etapa.
    const kind: DeviationKind =
      result.reason === 'empty' ? 'off_topic'
        : (result.reason === 'no_yesno' || result.reason === 'no_option_match') ? 'no_match'
          : 'invalid_format'

    const rule = ruleFor(cfg, kind)

    // Data aproximada ("Maio de 2026", "03/2024", "em 2023"): aceita já na
    // PRIMEIRA falha — retomar o fluxo vale mais do que exigir o dia exato.
    if (String(step.answer_type || '') === 'DATA' && result.reason === 'invalid_date') {
      const approx = parseApproxDate(message)
      if (approx) return advanceWith(approx)
    }

    // Tratativa específica ligada para esta situação (ou frase personalizada).
    if (cfg[kind].enabled || matchesRulePhrases(message, cfg[kind])) {
      const tries = (state.unknown_attempts || 0) + 1
      const applied = applyRule(kind, tries)
      if (applied) return applied
      return escalate()
    }

    const attempts = (state.attempts || 0) + 1
    const v = (step.validation || {}) as Record<string, unknown>
    const maxReasks = Number.isFinite(Number(v.max_reasks)) ? Number(v.max_reasks) : 1

    const fallbackCode = String(v.fallback_step_code || '').trim()

    // Esgotou as reperguntas e existe etapa de fallback: desvia o fluxo.
    if (fallbackCode && attempts > maxReasks && index.get(fallbackCode)) {
      return run(index, fallbackCode, { ...state, attempts: 0, unknown_attempts: 0 }, lang)
    }

    // Esgotou as reperguntas: nunca repete a mesma pergunta indefinidamente.
    if (attempts > maxReasks) {
      if (!fallbackCode && (rule.mode === 'PULAR' || rule.mode === 'ACEITAR_APROXIMADO')) {
        return advanceWith(rule.fallback_value)
      }
      return escalate()
    }

    const reask = defaultReask(result.reason)

    return {
      messages: reask ? [reask] : [],
      outbound: reask ? [{ text: reask, step_code: step.step_code, quick_reply: quickReplyOf(step) }] : [],
      state: { ...state, attempts },
      reasked: true,
      finished: false,
      handoff: false,
      path: [step.step_code],
      captured: [],
    }

  }




  const value = result.value ?? ''

  // 2) Resposta válida, mas fora das opções/caminhos previstos na etapa.
  if (cfg.no_match.enabled) {
    const branches = Array.isArray(step.branches) ? step.branches : []
    const strict = branches.length > 0 && branches.every((b) => String(b?.value || '').trim() && b?.match_type !== 'QUALQUER')
    if (strict && !branches.some((b) => branchMatches(b, value))) {
      const tries = (state.unknown_attempts || 0) + 1
      const applied = applyRule('no_match', tries)
      if (applied) return applied
      return escalate()

    }
  }

  const answers = { ...(state.answers || {}), [step.step_code]: value }
  const captured = captureOf(step, value)
  const nextCode = resolveNextCode(step, value)
  const nextState: FlowRunState = { ...state, answers, attempts: 0, unknown_attempts: 0 }
  if (!nextCode) {
    return {
      messages: [],
      outbound: [],
      state: { ...nextState, finished: true },
      reasked: false,
      finished: true,
      handoff: false,
      path: [step.step_code],
      captured,
    }

  }
  const turn = run(index, nextCode, nextState, lang, captured)
  // Reconhecimento humano antes da próxima pergunta (respostas abertas).
  if (opts?.ack && ackEnabledFor(step) && (turn.messages || []).length) {
    return prependMessage(turn, opts.ack, step.step_code)
  }
  return turn
}



// ---------------------------------------------------------------------------
// Inferência de destino (quando a etapa não tem "Salvar resposta em")

function normSlug(v: unknown): string {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
}

/**
 * Descobre onde gravar a resposta de uma etapa que não tem `field_mapping`
 * configurado, olhando o tipo de resposta e o código/nome da etapa.
 * Só devolve destino quando o casamento é SEGURO — na dúvida devolve null
 * (a resposta continua salva apenas em `answers`).
 */
export function inferFieldMapping(step: FlowStep): string | null {
  const explicit = String(step?.field_mapping || '').trim()
  if (explicit) return explicit

  const slug = `${normSlug(step?.step_code)}_${normSlug(step?.name)}`
  const type = String(step?.answer_type || '').toUpperCase()

  if (type === 'EMAIL' || /\be_?mail\b/.test(slug)) return 'contact.email'
  if (type === 'NOME' || /nome_completo|full_name|nombre_completo/.test(slug)) return 'contact.full_name'

  if (/empadronamento|empadronado|empadronamiento/.test(slug)) {
    if (/cidade|ciudad|city/.test(slug)) return 'funnel.empadronado_city'
    if (/desde|quando|since|data|fecha/.test(slug) || type === 'DATA') return 'contact.empadronamiento_since'
    return 'funnel.empadronado_confirmed'
  }
  if (/desde_quando/.test(slug) && type === 'DATA') return 'contact.empadronamiento_since'

  if (/(data|fecha|date).*(entrada|chegada|llegada|arrival)|entrada_na_espanha|arrival/.test(slug)) {
    return 'funnel.entry_date_confirmed'
  }
  if (/localizacao|localizacion|location|esta_no_brasil|fora_da_espanha|na_espanha/.test(slug) && type === 'SIM_NAO') {
    return 'funnel.location_known'
  }
  if (/idade|edad|age/.test(slug)) return 'outside.age'
  if (/europa|europe/.test(slug) && /6|seis/.test(slug)) return 'outside.europe_6m'
  if (/familiar_europeu|familiar_ue|eu_family|comunitario/.test(slug)) return 'outside.eu_family'
  if (/remoto|remote|teletrabalho/.test(slug)) return 'outside.remote_work'
  if (/formacao_superior|educacao|education|escolaridade|estudos_superiores/.test(slug)) return 'contact.education_level'
  if (/interesse|interes|interest|o_que_busca|busca_hoje/.test(slug)) return 'funnel.interest_confirmed'
  if (/cenario|situacao|situacion|scenario/.test(slug)) return 'funnel.interest_confirmed'

  return null
}

// ---------------------------------------------------------------------------
// Utilitários usados pela orquestração (checagem na base de conhecimento)

/** Retoma o grafo a partir de uma etapa específica (ex.: fallback de KB). */
export function jumpToStep(
  steps: FlowStep[],
  code: string,
  state: FlowRunState,
  lang: FlowLang = 'pt-BR',
): FlowTurnResult | null {
  const index = indexSteps(steps)
  if (!code || !index.get(code)) return null
  return run(index, code, { ...state, attempts: 0, unknown_attempts: 0 }, lang)
}

/** Permanece na etapa atual enviando um texto (repergunta/explicação). */
export function buildStayTurn(
  step: FlowStep,
  text: string,
  state: FlowRunState,
  patch: Partial<FlowRunState> = {},
): FlowTurnResult {
  return {
    messages: text ? [text] : [],
    outbound: text ? [{ text, step_code: step.step_code, quick_reply: quickReplyOf(step) }] : [],
    state: { ...state, ...patch },
    reasked: true,
    finished: false,
    handoff: false,
    path: [step.step_code],
    captured: [],
  }
}
