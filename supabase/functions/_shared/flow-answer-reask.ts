// @ts-nocheck
/**
 * "Responde e volta na hora".
 *
 * Quando a resposta do cliente não é a esperada mas é uma pergunta ou um
 * comentário fora do tema, o agente NÃO gasta um turno só reperguntando: ele
 * monta UMA única mensagem com a resposta curta (base de conhecimento) seguida
 * da pergunta da etapa. O fluxo nunca sai da etapa.
 */

import type { FlowLang } from './flow-engine.ts'

const LANG_NAME: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  es: 'espanhol',
  en: 'inglês',
  fr: 'francês',
}

/** Frase de ligação entre a resposta e a retomada da pergunta. */
const BRIDGE: Record<string, string> = {
  'pt-BR': 'Voltando ao seu caso:',
  es: 'Volviendo a tu caso:',
  en: 'Back to your case:',
  fr: 'Revenons à votre dossier :',
}

/** Reconhecimento usado quando a base não tem resposta. */
const ACK_FALLBACK: Record<string, string> = {
  'pt-BR': 'Entendi o seu ponto — já te explico melhor em seguida.',
  es: 'Entiendo tu punto — te lo explico mejor enseguida.',
  en: 'I understand your point — I will explain it in more detail shortly.',
  fr: 'Je comprends votre point — je vous explique cela juste après.',
}

/** A mensagem parece uma pergunta ou um assunto fora da etapa? */
export function looksLikeQuestion(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (t.includes('?')) return true
  return /^(o que|oque|que |qual|quais|quanto|quantos|quanta|como|onde|quando|por que|porque|porqu[eê]|preciso|posso|pode|d[aá] para|tem como|serve|vale|é poss[ií]vel|explica|me explica|qu[ée]|cu[aá]l|cu[aá]les|cu[aá]nto|c[oó]mo|d[oó]nde|cu[aá]ndo|por qu[eé]|puedo|puede|what|which|how|where|when|why|can i|could|do i|is it|does it|quoi|quel|quelle|comment|o[uù]|quand|pourquoi|puis-je|est-ce)\b/i.test(t)
}

function firstSentences(text: string, max = 3): string {
  const parts = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
  return parts.slice(0, max).join(' ').slice(0, 600)
}

/**
 * Gera a resposta curta para a dúvida do cliente com base na base de
 * conhecimento. Devolve string vazia quando não há base ou LLM disponível.
 */
export async function answerAside(params: {
  question: string
  lang: FlowLang
  kbContext: string
  callLLM: (prompt: string) => Promise<string>
}): Promise<string> {
  const { question, lang, kbContext, callLLM } = params
  if (!String(question || '').trim()) return ''
  if (!String(kbContext || '').trim()) return ''

  const prompt = [
    'Você é a assistente virtual de uma assessoria de estrangeria na Espanha.',
    'Responda a dúvida do cliente usando SOMENTE os trechos da base abaixo.',
    'Se a base não responder, devolva exatamente: SEM_RESPOSTA',
    '',
    `DÚVIDA DO CLIENTE: ${question}`,
    '',
    'TRECHOS DA BASE DE CONHECIMENTO:',
    kbContext,
    '',
    'Regras: no máximo 3 frases curtas, sem listas, sem saudação, sem fazer perguntas.',
    `Escreva em ${LANG_NAME[lang] || 'português do Brasil'}.`,
  ].join('\n')

  try {
    const out = String(await callLLM(prompt) || '').trim()
    if (!out || /SEM_RESPOSTA/i.test(out)) return ''
    return firstSentences(out)
  } catch (e) {
    console.warn('[ANSWER_REASK] falha ao responder pela base:', e instanceof Error ? e.message : e)
    return ''
  }
}

/** Junta resposta + retomada da pergunta em uma única bolha. */
export function composeAnswerAndReask(answer: string, reask: string, lang: FlowLang): string {
  const a = String(answer || '').trim()
  const q = String(reask || '').trim()
  if (!q) return a
  if (!a) return q
  const bridge = BRIDGE[String(lang)] || BRIDGE['pt-BR']
  return `${a}\n\n${bridge} ${q}`
}

export function defaultAsideAck(lang: FlowLang): string {
  return ACK_FALLBACK[String(lang)] || ACK_FALLBACK['pt-BR']
}
