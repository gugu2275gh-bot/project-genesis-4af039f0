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
  if (language === 'es') return 'IDIOMA TRAVADO: RESPONDA EXCLUSIVAMENTE EM ESPANHOL. Mesmo se o cliente enviar mensagens em português ou outro idioma, continue respondendo SEMPRE em espanhol. NÃO misture idiomas.'
  if (language === 'en') return 'LOCKED LANGUAGE: RESPOND EXCLUSIVELY IN ENGLISH. Even if the customer writes in Portuguese or another language, keep responding in English. DO NOT mix languages.'
  if (language === 'fr') return 'LANGUE VERROUILLÉE: RÉPONDEZ EXCLUSIVEMENT EN FRANÇAIS. Même si le client écrit dans une autre langue, continuez à répondre en français. NE mélangez pas les langues.'
  return 'IDIOMA TRAVADO: RESPONDA EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL. Mesmo se o cliente enviar mensagens em outro idioma, continue respondendo em português. NÃO misture idiomas.'
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

// Localized prompt templates — pre-translated so the LLM never sees PT
// when the locked language is not Portuguese. This eliminates "leaks"
// where Gemini copies the start of a PT reference phrase verbatim.
export type PromptTemplates = {
  askName: string
  thanksThenAskEmail: string
  interestQuestion: string
  servicesCatalog: string
  oneMomentPlease: string
  askLocationSpain: string
  openingLine1: string
  openingLine2: string
  outsideIntro: string
  insideIntro: string
}

const TEMPLATES: Record<ChatLanguage, PromptTemplates> = {
  'pt-BR': {
    askName: 'Antes de tudo, como é seu nome completo?',
    thanksThenAskEmail: 'Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?',
    interestQuestion: 'Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico.',
    servicesCatalog: 'Trabalhamos com cidadania espanhola, nômade digital, residências, NIE, TIE, homologação de estudos, antecedentes, reagrupação e outros processos.',
    oneMomentPlease: 'Ótima pergunta, já te explico em seguida.',
    askLocationSpain: 'Você está na Espanha?',
    openingLine1: 'Olá 😊 Tudo bem? Obrigado por falar com a CB Asesoría. Vou te ajudar a entender seus caminhos legais aqui na Espanha.',
    openingLine2: 'Vou te fazer algumas perguntas rápidas só para entender seu caso e te direcionar para o especialista certo, pode ser?',
    outsideIntro: 'Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário.',
    insideIntro: 'Perfeito. Agora preciso entender como está sua situação aqui.',
  },
  'es': {
    askName: 'Antes de nada, ¿cuál es tu nombre completo?',
    thanksThenAskEmail: 'Gracias. ¿Cuál es el mejor e-mail para enviarte orientaciones y acompañar tu caso?',
    interestQuestion: 'Cuéntame con calma: ¿qué buscas hoy? Puede ser nacionalidad, residencia, estudios, arraigo o algún documento específico.',
    servicesCatalog: 'Trabajamos con ciudadanía española, nómada digital, residencias, NIE, TIE, homologación de estudios, antecedentes, reagrupación y otros procesos.',
    oneMomentPlease: 'Buena pregunta, ya te lo explico enseguida.',
    askLocationSpain: '¿Estás en España?',
    openingLine1: 'Hola 😊 ¿Todo bien? Gracias por hablar con CB Asesoría. Voy a ayudarte a entender tus caminos legales aquí en España.',
    openingLine2: 'Voy a hacerte algunas preguntas rápidas solo para entender tu caso y dirigirte al especialista correcto, ¿puede ser?',
    outsideIntro: 'Perfecto. Voy a hacerte preguntas rápidas solo para entender mejor tu situación.',
    insideIntro: 'Perfecto. Ahora necesito entender cómo está tu situación aquí.',
  },
  'en': {
    askName: 'First of all, what is your full name?',
    thanksThenAskEmail: 'Thank you. What is the best e-mail so we can send you guidance and follow up on your case?',
    interestQuestion: 'Tell me calmly: what are you looking for today? It can be citizenship, residency, studies, arraigo or a specific document.',
    servicesCatalog: 'We work with Spanish citizenship, digital nomad, residencies, NIE, TIE, education recognition, background checks, family reunification and other processes.',
    oneMomentPlease: 'Great question, I will explain in a moment.',
    askLocationSpain: 'Are you in Spain?',
    openingLine1: 'Hello 😊 How are you? Thank you for contacting CB Asesoría. I will help you understand your legal paths here in Spain.',
    openingLine2: 'I will ask you a few quick questions just to understand your case and direct you to the right specialist, is that okay?',
    outsideIntro: 'Perfect. I will ask you quick questions just to better understand your situation.',
    insideIntro: 'Perfect. Now I need to understand your current situation here.',
  },
  'fr': {
    askName: 'Tout d’abord, quel est votre nom complet ?',
    thanksThenAskEmail: 'Merci. Quel est le meilleur e-mail pour vous envoyer des orientations et suivre votre dossier ?',
    interestQuestion: 'Racontez-moi calmement : que recherchez-vous aujourd’hui ? Cela peut être la nationalité, la résidence, des études, l’arraigo ou un document spécifique.',
    servicesCatalog: 'Nous travaillons avec la nationalité espagnole, le nomade numérique, les résidences, le NIE, le TIE, l’homologation d’études, les antécédents, le regroupement familial et d’autres procédures.',
    oneMomentPlease: 'Très bonne question, je vous explique tout de suite.',
    askLocationSpain: 'Êtes-vous en Espagne ?',
    openingLine1: 'Bonjour 😊 Tout va bien ? Merci de contacter CB Asesoría. Je vais vous aider à comprendre vos voies légales ici en Espagne.',
    openingLine2: 'Je vais vous poser quelques questions rapides juste pour comprendre votre cas et vous orienter vers le bon spécialiste, d’accord ?',
    outsideIntro: 'Parfait. Je vais vous poser des questions rapides pour mieux comprendre votre situation.',
    insideIntro: 'Parfait. Maintenant je dois comprendre votre situation ici.',
  },
}

export function getPromptTemplates(language: ChatLanguage): PromptTemplates {
  return TEMPLATES[language] || TEMPLATES['pt-BR']
}

export function getLanguageName(language: ChatLanguage): string {
  if (language === 'es') return 'espanhol'
  if (language === 'en') return 'inglês'
  if (language === 'fr') return 'francês'
  return 'português do Brasil'
}
