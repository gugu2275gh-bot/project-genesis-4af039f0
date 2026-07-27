// @ts-nocheck
/**
 * Garantia de idioma em TODOS os pontos de fala do agente.
 *
 * O motor de fluxo é puro e usa apenas as traduções gravadas no editor
 * (`messages`, `reask_messages`, `validation.options_i18n`). Quando falta a
 * tradução de algum texto, o motor cai no português — foi essa lacuna que fez
 * o cliente em espanhol receber perguntas em português.
 *
 * Aqui existe uma única camada de saída: toda mensagem do turno passa por
 * `localizeTurn` antes de ser enviada (WhatsApp ou sandbox). Se o texto já
 * está no idioma da conversa, segue igual; se não está, é traduzido na hora e
 * gravado de volta na etapa, para nunca mais precisar traduzir de novo.
 */

import type { FlowLang, FlowStep, FlowTurnResult } from './flow-engine.ts'

const TRANSLATE_TIMEOUT_MS = 5000

const LANG_NAMES: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  es: 'espanhol',
  en: 'inglês',
  fr: 'francês',
}

/** Cache em memória do processo: mesmo texto + idioma nunca traduz duas vezes. */
const memoryCache = new Map<string, string>()

export function isPortugueseLang(lang: FlowLang): boolean {
  return String(lang || 'pt-BR').toLowerCase().startsWith('pt')
}

export function langName(lang: FlowLang): string {
  return LANG_NAMES[String(lang)] || LANG_NAMES['pt-BR']
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: number | undefined
  const guard = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[FLOW_I18N] ${label} excedeu ${ms}ms — mantendo texto original`)
      resolve(null)
    }, ms)
  })
  return Promise.race([
    p.catch((e) => {
      console.warn(`[FLOW_I18N] ${label} falhou:`, e instanceof Error ? e.message : e)
      return null
    }),
    guard,
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

function clean(out: string, original: string): string {
  const text = String(out || '').trim()
  if (!text) return original
  // Remove aspas/cercas que alguns modelos adicionam.
  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^"(.*)"$/s, '$1')
    .trim() || original
}

/**
 * Devolve o texto no idioma pedido. Se já estiver nesse idioma, o modelo
 * devolve idêntico. Falha/timeout → texto original (nunca trava o turno).
 */
export async function ensureLang(
  text: string,
  lang: FlowLang,
  callLLM?: ((prompt: string) => Promise<string>) | null,
): Promise<string> {
  const original = String(text || '').trim()
  if (!original) return original
  if (isPortugueseLang(lang)) return original
  if (!callLLM) return original

  const key = `${String(lang)}::${original}`
  const hit = memoryCache.get(key)
  if (hit) return hit

  const prompt = [
    `Você é um tradutor. Reescreva a mensagem abaixo em ${langName(lang)}.`,
    `Se a mensagem já estiver em ${langName(lang)}, devolva-a exatamente igual.`,
    'Preserve emojis, quebras de linha, nomes próprios, datas e formatações.',
    'Responda SOMENTE com o texto final, sem aspas e sem comentários.',
    '',
    'MENSAGEM:',
    original,
  ].join('\n')

  const out = await withTimeout(Promise.resolve(callLLM(prompt)), TRANSLATE_TIMEOUT_MS, 'translate')
  const finalText = clean(out || '', original)
  memoryCache.set(key, finalText)
  return finalText
}

// ---------------------------------------------------------------------------
// Detecção de lacunas por etapa

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  const text = String(value ?? '').trim()
  return text ? [text] : []
}

/** A etapa já tem tradução gravada para esse idioma (mensagens e reperguntas)? */
export function stepHasLang(step: FlowStep, lang: FlowLang): boolean {
  if (isPortugueseLang(lang)) return true
  const msgs = (step?.messages || {}) as Record<string, unknown>
  const reask = (step?.reask_messages || {}) as Record<string, unknown>
  const hasMsg = listOf(msgs[String(lang)]).length > 0
  const needsReask = listOf(reask['pt-BR']).length > 0
  const hasReask = !needsReask || listOf(reask[String(lang)]).length > 0
  return hasMsg && hasReask
}

/**
 * Completa (em segundo plano) as traduções faltantes da etapa e grava no banco.
 * Assim cada texto é traduzido uma única vez em toda a vida do fluxo.
 */
export async function backfillStepTranslations(
  supabase: any,
  step: FlowStep,
  lang: FlowLang,
  callLLM?: ((prompt: string) => Promise<string>) | null,
): Promise<void> {
  if (!supabase || !callLLM || isPortugueseLang(lang)) return
  if (stepHasLang(step, lang)) return

  try {
    const key = String(lang)
    const messages = { ...((step.messages || {}) as Record<string, unknown>) }
    const reask = { ...((step.reask_messages || {}) as Record<string, unknown>) }
    const patch: Record<string, unknown> = {}

    const baseMsgs = listOf(messages['pt-BR'] ?? Object.values(messages)[0])
    if (baseMsgs.length && !listOf(messages[key]).length) {
      messages[key] = await Promise.all(baseMsgs.map((m) => ensureLang(m, lang, callLLM)))
      patch.messages = messages
    }

    const baseReask = listOf(reask['pt-BR'] ?? Object.values(reask)[0])
    if (baseReask.length && !listOf(reask[key]).length) {
      reask[key] = await ensureLang(baseReask[0], lang, callLLM)
      patch.reask_messages = reask
    }

    if (!Object.keys(patch).length) return
    const { error } = await supabase.from('ai_agent_flow_steps').update(patch).eq('id', step.id)
    if (error) {
      console.warn('[FLOW_I18N] falha ao gravar tradução da etapa:', error.message)
      return
    }
    console.log('[FLOW_I18N] tradução gravada', JSON.stringify({ step: step.step_code, lang: key }))
  } catch (e) {
    console.warn('[FLOW_I18N] backfill falhou:', e instanceof Error ? e.message : e)
  }
}

// ---------------------------------------------------------------------------
// Camada única de saída

export interface LocalizeDeps {
  steps?: FlowStep[]
  callLLM?: ((prompt: string) => Promise<string>) | null
  supabase?: any
  logTag?: string
}

/**
 * Passa TODA mensagem do turno pela garantia de idioma. Cobre mensagem da
 * etapa, repergunta, resposta inesperada, reconhecimento, saudação, handoff e
 * qualquer texto avulso — nada sai em português quando a conversa é em outro
 * idioma.
 */
export async function localizeTurn(
  turn: FlowTurnResult,
  lang: FlowLang,
  deps: LocalizeDeps = {},
): Promise<FlowTurnResult> {
  if (!turn || isPortugueseLang(lang)) return turn
  const outbound = Array.isArray(turn.outbound) ? turn.outbound : []
  if (!outbound.length) return turn

  const tag = deps.logTag || '[FLOW_I18N]'
  const byCode = new Map<string, FlowStep>()
  for (const s of deps.steps || []) byCode.set(String(s.step_code), s)

  const localized = await Promise.all(outbound.map(async (item) => {
    const text = String(item?.text || '').trim()
    if (!text) return item
    const step = byCode.get(String(item?.step_code || ''))
    // Etapa já traduzida no editor: o motor já entregou no idioma certo.
    if (step && stepHasLang(step, lang)) return item
    const translated = await ensureLang(text, lang, deps.callLLM)
    if (translated !== text) {
      console.log(`${tag}[FIX]`, JSON.stringify({ step: item?.step_code || '', lang: String(lang) }))
    }
    return { ...item, text: translated }
  }))

  // Grava as lacunas encontradas, em segundo plano.
  if (deps.supabase && deps.callLLM) {
    const pending = new Set<string>()
    for (const item of outbound) {
      const step = byCode.get(String(item?.step_code || ''))
      if (step && !stepHasLang(step, lang) && !pending.has(String(step.id))) {
        pending.add(String(step.id))
        void backfillStepTranslations(deps.supabase, step, lang, deps.callLLM)
      }
    }
  }

  return {
    ...turn,
    outbound: localized,
    messages: localized.map((o) => String(o?.text || '')).filter(Boolean),
  }
}
