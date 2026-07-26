// @ts-nocheck
/**
 * Checagem da resposta do cliente contra a base de conhecimento, por etapa.
 *
 * Ligada no editor de fluxos (aba "Base"): antes de o fluxo avançar, a resposta
 * é pesquisada na base. Se for um serviço/tema atendido, o valor é normalizado
 * e gravado; se não for, o agente explica e repergunta a MESMA etapa — sem
 * nunca sair da sequência configurada.
 */

import type { FlowLang, FlowStep } from './flow-engine.ts'

export type KbCheckOnInvalid = 'REPERGUNTAR' | 'SEGUIR' | 'ENCAMINHAR'

export interface KbCheckConfig {
  enabled: boolean
  instruction: string
  on_invalid: KbCheckOnInvalid
  messages: Record<string, string>
  attempts: number
  normalize: boolean
}

export interface KbVerdict {
  valid: boolean
  /** Nome oficial encontrado na base (quando `normalize` está ligado). */
  value: string
  /** Explicação curta a enviar quando a resposta não é válida. */
  reply: string
  reason: string
}

const LANG_NAME: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  es: 'espanhol',
  en: 'inglês',
  fr: 'francês',
}

export function kbCheckOf(step: FlowStep): KbCheckConfig {
  const v = (step?.validation && typeof step.validation === 'object' ? step.validation : {}) as any
  const raw = (v.kb_check && typeof v.kb_check === 'object' ? v.kb_check : {}) as any
  const attempts = Number(raw.attempts)
  return {
    enabled: !!raw.enabled,
    instruction: String(raw.instruction || ''),
    on_invalid: ['REPERGUNTAR', 'SEGUIR', 'ENCAMINHAR'].includes(raw.on_invalid) ? raw.on_invalid : 'REPERGUNTAR',
    messages: (raw.messages && typeof raw.messages === 'object' ? raw.messages : {}) as Record<string, string>,
    attempts: Number.isFinite(attempts) && attempts >= 0 ? Math.min(5, Math.round(attempts)) : 1,
    normalize: raw.normalize !== false,
  }
}

/** Mensagem fixa configurada para a etapa (quando houver). */
export function kbInvalidMessage(cfg: KbCheckConfig, lang: FlowLang): string {
  const m = cfg.messages || {}
  return String(m[lang] || m['pt-BR'] || '').trim()
}

function parseJson(text: string): any {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Pede à IA um veredito estruturado sobre a resposta do cliente.
 * Devolve `null` quando não foi possível decidir (falha de LLM/base) —
 * nesse caso o fluxo segue normalmente, sem travar o atendimento.
 */
export async function runKbCheck(params: {
  question: string
  answer: string
  cfg: KbCheckConfig
  lang: FlowLang
  kbContext: string
  callLLM: (prompt: string) => Promise<string>
}): Promise<KbVerdict | null> {
  const { question, answer, cfg, lang, kbContext, callLLM } = params
  if (!answer.trim()) return null
  if (!kbContext.trim()) return null

  const prompt = [
    'Você valida a resposta de um cliente contra a base de conhecimento de uma assessoria de estrangeria na Espanha.',
    '',
    `PERGUNTA DA ETAPA: ${question}`,
    `RESPOSTA DO CLIENTE: ${answer}`,
    cfg.instruction ? `CRITÉRIO DE VALIDADE: ${cfg.instruction}` : '',
    '',
    'TRECHOS DA BASE DE CONHECIMENTO:',
    kbContext,
    '',
    'Responda APENAS com JSON válido, sem texto fora do JSON:',
    '{"valid": true|false, "value": "nome oficial do serviço/tema encontrado na base (ou a resposta original)", "reply": "explicação curta ao cliente quando valid=false, citando 1 a 3 serviços válidos da base e repetindo a pergunta"}',
    `O campo "reply" deve estar em ${LANG_NAME[lang] || 'português do Brasil'}, no máximo 2 frases, tom cordial.`,
    'Se a base não permitir concluir, use {"valid": true, "value": "<resposta original>", "reply": ""}.',
  ].filter(Boolean).join('\n')

  let raw = ''
  try {
    raw = await callLLM(prompt)
  } catch (e) {
    console.warn('[KB_CHECK] falha de LLM:', e instanceof Error ? e.message : e)
    return null
  }

  const parsed = parseJson(raw)
  if (!parsed || typeof parsed.valid !== 'boolean') return null

  return {
    valid: parsed.valid,
    value: cfg.normalize ? String(parsed.value || '').trim() : '',
    reply: String(parsed.reply || '').trim(),
    reason: parsed.valid ? 'valid' : 'invalid',
  }
}
