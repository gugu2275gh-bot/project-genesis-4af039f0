// @ts-nocheck
/**
 * Reconhecimento humanizado gerado pela IA (ligado por etapa no editor).
 *
 * Gera UMA frase curta reagindo à resposta que o cliente acabou de dar, no
 * idioma travado do atendimento. Nunca faz pergunta nova e nunca decide
 * transição — o grafo continua no comando.
 */

import type { FlowLang, FlowStep } from './flow-engine.ts'

const LANG_NAME: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  es: 'espanhol',
  en: 'inglês',
  fr: 'francês',
}

/** A etapa pede reconhecimento gerado pela IA? */
export function ackAiEnabledFor(step: FlowStep): boolean {
  const v = (step?.validation && typeof step.validation === 'object' ? step.validation : {}) as any
  return v.ack_ai === true
}

export async function generateAckPhrase(params: {
  question: string
  answer: string
  lang: FlowLang
  callLLM: (prompt: string) => Promise<string>
}): Promise<string> {
  const { question, answer, lang, callLLM } = params
  if (!answer.trim()) return ''

  const prompt = [
    'Você é a assistente virtual de uma assessoria de estrangeria na Espanha.',
    `Pergunta feita: ${question}`,
    `Resposta do cliente: ${answer}`,
    '',
    'Escreva APENAS uma frase curta (máximo 12 palavras) reconhecendo a resposta do cliente,',
    'de forma humana e cordial. Não faça perguntas. Não repita a pergunta. Não use aspas.',
    `Escreva em ${LANG_NAME[lang] || 'português do Brasil'}.`,
  ].join('\n')

  try {
    const out = await callLLM(prompt)
    return String(out || '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .split('\n')[0]
      .trim()
      .slice(0, 180)
  } catch (e) {
    console.warn('[FLOW_ACK] falha ao gerar reconhecimento:', e instanceof Error ? e.message : e)
    return ''
  }
}
