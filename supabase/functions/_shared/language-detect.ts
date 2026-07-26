// Detecção de idioma compartilhada (sandbox / motor de fluxo).
// Padrões espelhados de `whatsapp-webhook/lib/language.ts` — funções puras,
// sem dependência do runtime do webhook.

export type FlowLanguage = 'pt-BR' | 'es' | 'en' | 'fr'

export const SUPPORTED_FLOW_LANGUAGES: FlowLanguage[] = ['pt-BR', 'es', 'en', 'fr']

export function isFlowLanguage(value: unknown): value is FlowLanguage {
  return typeof value === 'string' && (SUPPORTED_FLOW_LANGUAGES as string[]).includes(value)
}

export function detectFlowLanguageOrNull(text: string): FlowLanguage | null {
  const sample = String(text || '').toLowerCase().normalize('NFC')
  if (!sample.trim()) return null

  // Espanhol primeiro (evita falso positivo do PT por causa de ñ/¿).
  if (
    /[¿¡ñ]/.test(sample) ||
    /\b(hola|hol[aá]|buenas|buenos|buen(?:os|as)?\s+(?:d[ií]as?|tardes?|noches?)|buen\s+d[ií]a|gracias|nombre|apellido|correo|quiero|necesito|estoy|espa[nñ]ola?|puedes|puede|ayuda|cu[aá]l|gustar[ií]a|me gusta|en mi|mi nacionalidad|por favor|entiendo|no\s+entiendo|en\s+espa[nñ]ol|s[ií]|residencia|trabajo)\b/u.test(sample)
  ) {
    return 'es'
  }

  if (
    /\b(ol[aá]|oi|obrigad[oa]|voc[eê]|n[aã]o|sim|meu|minha|nome|sobrenome|email|telefone|cpf|cnpj|whatsapp|preciso|quero|estou|tudo bem|bom dia|boa tarde|boa noite|valeu|brasil|portugu[eê]s|espanha|moro|trabalho)\b/u.test(sample) ||
    /[ãõ]/.test(sample)
  ) {
    return 'pt-BR'
  }

  if (
    /\b(bonjour|bonsoir|salut|merci|coucou|s'il vous pla[iî]t|courriel|besoin|aide|espagne|comment|quel|quelle|oui|non|je suis|j'ai|je m'appelle|monsieur|madame|nationalit[eé]|r[eé]sidence)\b/.test(sample)
  ) {
    return 'fr'
  }

  if (
    /\b(hello|hi|hey|good\s+(?:morning|evening|afternoon)|thanks|thank you|name|my name|email|need|help|helping|spain|how|what|where|when|why|can you|could you|would you|please|plz|mroning|mornin|are you|i am|i'm|yes|no|my|your|information|info|residency|citizenship)\b/.test(sample)
  ) {
    return 'en'
  }

  return null
}

/**
 * Resolve o idioma do turno atual:
 * - se já houver idioma travado no estado, mantém (não re-detecta);
 * - senão tenta detectar na mensagem do cliente;
 * - senão usa o idioma padrão do agente.
 */
export function resolveFlowLanguage(
  lockedLang: unknown,
  message: string,
  defaultLang: unknown,
): { lang: FlowLanguage; locked: boolean; detected: FlowLanguage | null } {
  if (isFlowLanguage(lockedLang)) {
    return { lang: lockedLang, locked: true, detected: null }
  }
  const detected = detectFlowLanguageOrNull(message)
  if (detected) return { lang: detected, locked: true, detected }
  const fallback = isFlowLanguage(defaultLang) ? defaultLang : 'pt-BR'
  return { lang: fallback, locked: false, detected: null }
}

export function getFlowLanguageDirective(lang: FlowLanguage): string {
  if (lang === 'es') return 'IDIOMA TRAVADO: RESPONDA EXCLUSIVAMENTE EM ESPANHOL. Mesmo se o cliente escrever em outro idioma, continue respondendo em espanhol. NÃO misture idiomas.'
  if (lang === 'en') return 'LOCKED LANGUAGE: RESPOND EXCLUSIVELY IN ENGLISH. Even if the customer writes in another language, keep responding in English. DO NOT mix languages.'
  if (lang === 'fr') return 'LANGUE VERROUILLÉE: RÉPONDEZ EXCLUSIVEMENT EN FRANÇAIS. Même si le client écrit dans une autre langue, continuez à répondre en français. NE mélangez pas les langues.'
  return 'IDIOMA TRAVADO: RESPONDA EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL. Mesmo se o cliente escrever em outro idioma, continue respondendo em português. NÃO misture idiomas.'
}
