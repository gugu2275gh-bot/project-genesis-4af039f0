// @ts-nocheck
/**
 * Portão do handoff — decide o que o agente faz DEPOIS que o pré-handoff
 * terminou (todos os dados coletados e mensagem de transferência enviada).
 *
 *  - Handoff LIBERADO (padrão): o agente continua respondendo dúvidas usando a
 *    base de conhecimento, até um atendente humano assumir a conversa.
 *  - Handoff BLOQUEADO: o agente não consulta a base nem chama o LLM; ele
 *    responde sempre a mesma mensagem de espera configurada no agente.
 */

export type HoldLang = 'pt-BR' | 'es' | 'en' | 'fr'

export const DEFAULT_HANDOFF_HOLD_MESSAGE: Record<HoldLang, string> = {
  'pt-BR': 'Seu caso já foi encaminhado ao especialista da CB Asesoría. Em breve um de nossos especialistas irá lhe atender. Por favor, aguarde.',
  es: 'Su caso ya fue derivado al especialista de CB Asesoría. En breve uno de nuestros especialistas le atenderá. Por favor, aguarde.',
  en: 'Your case has already been forwarded to a CB Asesoría specialist. One of our specialists will assist you shortly. Please wait.',
  fr: 'Votre dossier a déjà été transmis à un spécialiste de CB Asesoría. Un de nos spécialistes vous répondra très bientôt. Merci de patienter.',
}

interface HandoffRuntimeLike {
  handoffReleased?: boolean
  handoffHoldMessage?: Record<string, string> | null
}

/** Verdadeiro quando o agente NÃO pode responder livremente após o handoff. */
export function isHandoffBlocked(runtime: HandoffRuntimeLike | null | undefined): boolean {
  if (!runtime) return false
  return runtime.handoffReleased === false
}

/** Mensagem de espera localizada (com fallback pt-BR e texto padrão). */
export function handoffHoldMessage(
  runtime: HandoffRuntimeLike | null | undefined,
  lang: string,
): string {
  const key = (['pt-BR', 'es', 'en', 'fr'].includes(String(lang)) ? String(lang) : 'pt-BR') as HoldLang
  const custom = runtime?.handoffHoldMessage || {}
  const picked = String(custom[key] || '').trim()
  if (picked) return picked
  const base = String(custom['pt-BR'] || '').trim()
  if (base) return base
  return DEFAULT_HANDOFF_HOLD_MESSAGE[key]
}
