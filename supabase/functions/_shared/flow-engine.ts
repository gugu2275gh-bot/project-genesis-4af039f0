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
  /** Fluxo concluído (chegou a uma etapa FIM). */
  finished?: boolean
  /** Handoff disparado pela etapa final. */
  handoff?: boolean
}

export interface FlowTurnResult {
  messages: string[]
  state: FlowRunState
  /** true quando a etapa atual não aceitou a resposta. */
  reasked: boolean
  /** true quando não há mais etapas (fluxo terminou). */
  finished: boolean
  handoff: boolean
  /** Etapas percorridas neste turno (para logs). */
  path: string[]
}

const MAX_STEPS_PER_TURN = 25

// ---------------------------------------------------------------------------
// Helpers de leitura do grafo

export function stepKindOf(step: FlowStep): StepKind {
  const k = (step?.validation as any)?.step_kind
  if (k === 'INICIO' || k === 'INFORMATIVA' || k === 'PERGUNTA' || k === 'FIM') return k
  return 'PERGUNTA'
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
      return words.length >= 2 ? { valid: true, value: text } : { valid: false, reason: 'not_full_name' }
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
// Execução

/**
 * Avança pelo grafo a partir de `fromCode`, acumulando mensagens de etapas
 * INICIO/INFORMATIVA até parar numa PERGUNTA (aguardando resposta) ou FIM.
 */
function run(
  index: Map<string, FlowStep>,
  fromCode: string | null,
  state: FlowRunState,
  lang: FlowLang,
): FlowTurnResult {
  const messages: string[] = []
  const path: string[] = []
  const visited = new Set(state.visited || [])
  let code: string | null = fromCode
  let guard = 0

  while (code && guard++ < MAX_STEPS_PER_TURN) {
    const step = index.get(code)
    if (!step) break
    path.push(code)

    // Nunca reenviar mensagens de uma etapa já executada (evita loops).
    if (!visited.has(code)) {
      messages.push(...messagesOf(step, lang))
      visited.add(code)
    }

    const kind = stepKindOf(step)
    if (kind === 'PERGUNTA') {
      return {
        messages,
        state: { ...state, current_step: code, visited: [...visited], attempts: 0, finished: false },
        reasked: false,
        finished: false,
        handoff: false,
        path,
      }
    }
    if (kind === 'FIM') {
      return {
        messages,
        state: { ...state, current_step: code, visited: [...visited], finished: true, handoff: !!step.handoff },
        reasked: false,
        finished: true,
        handoff: !!step.handoff,
        path,
      }
    }
    const next = resolveNextCode(step, '')
    if (!next || next === code) break
    code = next
  }

  return {
    messages,
    state: { ...state, current_step: code, visited: [...visited], finished: true },
    reasked: false,
    finished: true,
    handoff: false,
    path,
  }
}

/** Primeiro turno: envia as mensagens de abertura até a primeira pergunta. */
export function startFlow(steps: FlowStep[], lang: FlowLang = 'pt-BR'): FlowTurnResult {
  const index = indexSteps(steps)
  const start = findStartStep(steps)
  if (!start) {
    return { messages: [], state: { finished: true }, reasked: false, finished: true, handoff: false, path: [] }
  }
  return run(index, start.step_code, { answers: {}, visited: [], attempts: 0 }, lang)
}

/** Processa a resposta do cliente na etapa corrente e avança o grafo. */
export function advanceFlow(
  steps: FlowStep[],
  state: FlowRunState,
  message: string,
  lang: FlowLang = 'pt-BR',
): FlowTurnResult {
  const index = indexSteps(steps)
  if (!state?.current_step) return startFlow(steps, lang)
  if (state.finished) {
    return { messages: [], state, reasked: false, finished: true, handoff: !!state.handoff, path: [] }
  }

  const step = index.get(state.current_step)
  if (!step) return startFlow(steps, lang)

  const result = validateAnswer(step, message)
  if (!result.valid) {
    const attempts = (state.attempts || 0) + 1
    const v = (step.validation || {}) as Record<string, unknown>
    const maxReasks = Number.isFinite(Number(v.max_reasks)) ? Number(v.max_reasks) : 2
    const fallbackCode = String(v.fallback_step_code || '').trim()

    // Esgotou as reperguntas e existe etapa de fallback: desvia o fluxo.
    if (fallbackCode && attempts > maxReasks && index.get(fallbackCode)) {
      return run(index, fallbackCode, { ...state, attempts: 0 }, lang)
    }

    const reask = reaskOf(step, lang)
      || (result.reason === 'invalid_date' ? defaultDateReask(lang) : '')
      || messagesOf(step, lang).slice(-1)[0]
      || ''

    return {
      messages: reask ? [reask] : [],
      state: { ...state, attempts },
      reasked: true,
      finished: false,
      handoff: false,
      path: [step.step_code],
    }
  }


  const answers = { ...(state.answers || {}), [step.step_code]: result.value ?? '' }
  const nextCode = resolveNextCode(step, result.value ?? '')
  const nextState: FlowRunState = { ...state, answers, attempts: 0 }
  if (!nextCode) {
    return {
      messages: [],
      state: { ...nextState, finished: true },
      reasked: false,
      finished: true,
      handoff: false,
      path: [step.step_code],
    }
  }
  return run(index, nextCode, nextState, lang)
}
