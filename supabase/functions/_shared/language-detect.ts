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

/**
 * Respostas curtas e ambíguas (sim/não/ok em qualquer idioma) NÃO são sinal
 * confiável de idioma: "Sim", "no", "sí", "oui" aparecem o tempo todo como
 * resposta a perguntas do fluxo e não devem travar/alterar o idioma.
 */
const AMBIGUOUS_SHORT_ANSWERS = new Set([
  'sim', 's', 'ss', 'sss', 'nao', 'n', 'nn', 'no', 'nop', 'nope',
  'yes', 'y', 'yeah', 'yep', 'si', 'oui', 'non', 'ok', 'okay', 'oka',
  'claro', 'certo', 'correto', 'exato', 'perfeito',
])

function normalizeAmbiguous(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A mensagem é curta/ambígua demais para servir de sinal de idioma? */
export function isAmbiguousLanguageSample(text: string): boolean {
  const sample = normalizeAmbiguous(text)
  if (!sample) return true
  const words = sample.split(' ').filter(Boolean)
  if (words.length > 2) return false
  return words.every((w) => AMBIGUOUS_SHORT_ANSWERS.has(w))
}

/** Detecção usada para TRAVAR o idioma: ignora amostras ambíguas. */
export function detectLockableLanguageOrNull(text: string): FlowLanguage | null {
  if (isAmbiguousLanguageSample(text)) return null
  return detectFlowLanguageOrNull(text)
}

/**
 * Pedido EXPLÍCITO de troca de idioma ("em português", "en español",
 * "in english", "en français", "fale comigo em inglês"...).
 * Única situação em que o idioma travado pode mudar no meio da conversa.
 */
export function detectExplicitLanguageRequest(text: string): FlowLanguage | null {
  const sample = normalizeAmbiguous(text)
  if (!sample) return null
  if (/\b(em|en|in|no|para|fala[r]?|fale|speak|habla[r]?|parle[rz]?)\s+(portugues|brasileiro)\b/.test(sample)) return 'pt-BR'
  if (/\b(em|en|in|no|para|fala[r]?|fale|speak|habla[r]?|parle[rz]?)\s+(espanhol|espanol|spanish)\b/.test(sample)) return 'es'
  if (/\b(em|en|in|no|para|fala[r]?|fale|speak|habla[r]?|parle[rz]?)\s+(ingles|english|anglais)\b/.test(sample)) return 'en'
  if (/\b(em|en|in|no|para|fala[r]?|fale|speak|habla[r]?|parle[rz]?)\s+(frances|french|francais)\b/.test(sample)) return 'fr'
  return null
}
