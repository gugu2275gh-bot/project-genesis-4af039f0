// Language detection + locale-aware directives.
// Extracted from index.ts (Wave 3b, step 1) — pure functions, no side effects.

export type ChatLanguage = 'pt-BR' | 'es' | 'en' | 'fr'

export function detectChatLanguage(text: string): ChatLanguage {
  const sample = text.toLowerCase().normalize('NFC')

  // Strong Spanish signals (must run BEFORE Portuguese to avoid false positives like
  // "española" matching \bola\b because ñ is not a JS word-character).
  if (/[¿¡ñ]/.test(sample) || /\b(hola|gracias|nombre|correo|quiero|necesito|estoy|espa[nñ]ola?|puedes|puede|ayuda|cu[aá]l|gustar[ií]a|me gusta|en mi|mi nacionalidad|por favor)\b/u.test(sample)) {
    return 'es'
  }

  // Strong Portuguese signal — uses 'u' flag so ñ is treated as a word char and
  // doesn't create false word boundaries inside Spanish words.
  if (/\b(ol[aá]|oi|obrigad[oa]|voc[eê]|n[aã]o|sim|meu|minha|nome|email|telefone|cpf|cnpj|whatsapp|preciso|quero|estou|tudo bem|bom dia|boa tarde|boa noite|valeu|brasil|portugu[eê]s|espanha)\b/u.test(sample) || /[ãõ]/.test(sample)) {
    return 'pt-BR'
  }

  // French requires explicit French words — accents alone are too ambiguous (PT/ES also use them)
  if (/\b(bonjour|bonsoir|salut|merci|s'il vous pla[iî]t|courriel|besoin|aide|espagne|comment|quel|quelle|oui|non|je suis|j'ai|monsieur|madame)\b/.test(sample)) {
    return 'fr'
  }

  if (/\b(hello|hi|thanks|thank you|name|email|need|help|spain|how|what|can you|please|good morning|good evening)\b/.test(sample)) {
    return 'en'
  }

  return 'pt-BR'
}

export function getLanguageDirective(language: ChatLanguage): string {
  if (language === 'es') return 'RESPONDA EXCLUSIVAMENTE EM ESPANHOL. NÃO use português.'
  if (language === 'en') return 'RESPOND EXCLUSIVELY IN ENGLISH. DO NOT use Portuguese.'
  if (language === 'fr') return 'RÉPONDEZ EXCLUSIVEMENT EN FRANÇAIS. N’utilisez pas le portugais.'
  return 'RESPONDA EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL.'
}

export function getTransientErrorReply(language: ChatLanguage): string {
  if (language === 'es') return 'Perdón, tuve una inestabilidad para responder ahora. ¿Puedes enviarme tu pregunta nuevamente en texto?'
  if (language === 'en') return 'Sorry, I had a temporary issue responding just now. Could you send your question again in text?'
  if (language === 'fr') return 'Désolé, j’ai eu une instabilité temporaire pour répondre. Pouvez-vous renvoyer votre question en texte ?'
  return 'Desculpe, tive uma instabilidade agora para responder. Pode me enviar novamente sua pergunta em texto?'
}

export function normalizeForLanguageChecks(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksPortuguese(text: string): boolean {
  const sample = normalizeForLanguageChecks(text)
  if (!sample) return false

  const strongSignals = [
    'voce',
    'voces',
    'obrigado',
    'obrigada',
    'ola',
    'encaminhar',
    'atendente',
    'nome completo',
    'qual e',
    'seu nome',
    'posso te ajudar',
    'prazo',
    'equipe',
    'vou te',
  ]

  const weakSignals = ['por favor', 'tudo bem', 'aqui na espanha', 'me conta', 'com calma']

  const strongHits = strongSignals.filter((signal) => sample.includes(signal)).length
  if (strongHits >= 1) return true

  const weakHits = weakSignals.filter((signal) => sample.includes(signal)).length
  return weakHits >= 2
}

export function getLanguageName(language: ChatLanguage): string {
  if (language === 'es') return 'espanhol'
  if (language === 'en') return 'inglês'
  if (language === 'fr') return 'francês'
  return 'português do Brasil'
}
