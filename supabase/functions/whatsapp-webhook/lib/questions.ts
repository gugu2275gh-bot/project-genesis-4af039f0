// @ts-nocheck
// Wave 3b step 4: question detectors + localized model phrases
import { type ChatLanguage, normalizeForLanguageChecks } from './language.ts'

export function isStructuredQuestionAnswer(text: string): boolean {
  const sample = normalizeForLanguageChecks(text)
  if (!sample || sample.length > 40) return false

  const raw = text.trim()
  const isDateLike = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})$/.test(raw)
  const isNumericLike = /^\d{1,4}$/.test(sample)
  const isShortFreeText = sample.length <= 20 && !sample.includes('?')

  return isDateLike || isNumericLike || [
    'sim', 'si', 's', 'yes', 'yep', 'ok', 'okay', 'claro', 'correto', 'isso', 'perfeito',
    'nao', 'não', 'no', 'not', 'talvez', 'acho que sim', 'acho que nao', 'acho que não',
  ].includes(sample) || isShortFreeText
}

export function isQuestionAboutSpainEntryDate(question: string): boolean {
  const normalized = normalizeForLanguageChecks(question)
  return normalized.includes('data exata da sua entrada na espanha')
    || normalized.includes('entrada na espanha')
    || normalized.includes('fecha exacta de tu entrada a espana')
    || normalized.includes('date of your entry into spain')
    || normalized.includes('date exacte de votre entree en espagne')
}

export function isNeverBeenToSpainAnswer(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)
  if (!normalized || normalized.includes('?')) return false

  return /\b(nunca fui|nunca estive|nunca entrei|jamais fui|jamais estive)\b/.test(normalized)
    || /\b(nao|no|not|never)\b.{0,24}\b(fui|estive|entrei|estoy|been|entered)\b/.test(normalized)
    || /\b(never been|never entered)\b.{0,16}\b(spain|espana|espanha)\b/.test(normalized)
    || /\b(nunca he estado|nunca entre|nunca fui)\b/.test(normalized)
}

export function isPotentialEntryDateAnswer(text: string): boolean {
  const raw = text.trim()
  const normalized = normalizeForLanguageChecks(text)

  if (!raw || normalized.includes('?')) return false

  const numericFullDate = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/
  const hasSingleDate = numericFullDate.test(raw)
  const hasDateRange = new RegExp(`${numericFullDate.source}.{0,20}(ate|até|a|to|-).{0,20}${numericFullDate.source}`, 'i').test(raw)
  const monthName = '(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)'
  const hasFullMonthNameDate = new RegExp(`\\b(\\d{1,2}\\s+(de\\s+)?${monthName}\\s+(de\\s+)?\\d{2,4}|${monthName}\\s+\\d{1,2}(st|nd|rd|th)?[,]?\\s+\\d{2,4})\\b`).test(normalized)

  return hasDateRange || hasSingleDate || hasFullMonthNameDate
}

export function looksLikeIncompleteEntryDateWithoutYear(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)
  if (!normalized || normalized.includes('?')) return false
  if (isPotentialEntryDateAnswer(text)) return false

  const monthName = '(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)'
  return !/\b\d{4}\b/.test(normalized)
    && (new RegExp(`\\b\\d{1,2}\\s+(de\\s+)?${monthName}\\b`).test(normalized)
      || /\b\d{1,2}[\/.-]\d{1,2}\b/.test(normalized))
}

export function getEntryDateNeedsYearQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Necesito la fecha completa, incluyendo el año. ¿Cuál fue la fecha exacta de tu entrada en España?'
  if (language === 'en') return 'I need the full date, including the year. What was the exact date you entered Spain?'
  if (language === 'fr') return 'J’ai besoin de la date complète, avec l’année. Quelle était la date exacte de votre entrée en Espagne ?'
  return 'Preciso da data completa, incluindo o ano. Qual foi a data exata da sua entrada na Espanha?'
}

export function isQuestionAboutInterest(question: string): boolean {
  const normalized = normalizeForLanguageChecks(question)
  return normalized.includes('o que voce busca hoje')
    || normalized.includes('que voce busca hoje')
    || normalized.includes('que busca hoy')
    || normalized.includes('what are you looking for today')
    || normalized.includes('ce que vous recherchez aujourd hui')
}

export function isPotentialInterestAnswer(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)

  if (!normalized || normalized.includes('?')) return false
  if (normalized.length < 4) return false

  const interestKeywords = [
    'resid', 'residir', 'morar', 'viver', 'espanha', 'espanha', 'nacional', 'cidad', 'arraigo',
    'document', 'nie', 'tie', 'estudo', 'estudar', 'homologa', 'antecedente', 'reagrupa',
    'trabalh', 'trabalho', 'family', 'famil', 'mae', 'madre', 'mãe', 'visa', 'visto',
  ]

  return normalized.split(' ').length >= 1
    && interestKeywords.some((keyword) => normalized.includes(keyword))
}

export function getLocationQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿Hoy ya estás en España o todavía estás en otro país?'
  if (language === 'en') return 'Perfect. Are you already in Spain today, or are you still in another country?'
  if (language === 'fr') return 'Parfait. Êtes-vous déjà en Espagne aujourd’hui ou êtes-vous encore dans un autre pays ?'
  return 'Perfeito. Hoje você já está na Espanha ou ainda está em outro país?'
}

export function getEmpadronadoQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿Estás empadronado?'
  if (language === 'en') return 'Got it. Are you registered at the town hall (empadronado)?'
  if (language === 'fr') return 'D’accord. Êtes-vous empadronado ?'
  return 'Perfeito. Você está empadronado?'
}

export function getOutsideSpainAgeQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Entendido. Entonces seguimos por tu escenario fuera de España. ¿Cuál es tu edad?'
  if (language === 'en') return 'Got it. Then we’ll continue with your situation outside Spain. How old are you?'
  if (language === 'fr') return 'D’accord. Nous continuons donc avec votre situation hors d’Espagne. Quel âge avez-vous ?'
  return 'Entendido. Então seguimos pelo seu cenário fora da Espanha. Qual sua idade?'
}

export function getOutsideSpainNextQuestion(language: ChatLanguage, assistantTranscript: string): string {
  const askedIdade = /\b(qual sua idade|cu[áa]ntos a[ñn]os|how old)\b/i.test(assistantTranscript)
  const askedEuropa = /\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months\b/i.test(assistantTranscript)
  const askedFamiliar = /\bfamiliar (europeu|europeo)|family member.*(eu|spain)\b/i.test(assistantTranscript)
  const askedRemoto = /\b(trabalha remoto|trabajas? remoto|work remotely)\b/i.test(assistantTranscript)
  const askedFormacao = /\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree)\b/i.test(assistantTranscript)

  if (!askedIdade) return getOutsideSpainAgeQuestion(language)
  if (!askedEuropa) {
    if (language === 'es') return '¿Estuviste en Europa en los últimos 6 meses?'
    if (language === 'en') return 'Have you been in Europe in the last 6 months?'
    if (language === 'fr') return 'Êtes-vous allé en Europe au cours des 6 derniers mois ?'
    return 'Você esteve na Europa nos últimos 6 meses?'
  }
  if (!askedFamiliar) {
    if (language === 'es') return '¿Tienes algún familiar europeo o residente legal en España?'
    if (language === 'en') return 'Do you have a European family member or a legal resident in Spain?'
    if (language === 'fr') return 'Avez-vous un membre de votre famille européen ou résident légal en Espagne ?'
    return 'Possui familiar europeu ou residente legal na Espanha?'
  }
  if (!askedRemoto) {
    if (language === 'es') return '¿Trabajas de forma remota?'
    if (language === 'en') return 'Do you work remotely?'
    if (language === 'fr') return 'Travaillez-vous à distance ?'
    return 'Você trabalha remoto?'
  }
  if (!askedFormacao) {
    if (language === 'es') return '¿Tienes formación superior?'
    if (language === 'en') return 'Do you have higher education?'
    if (language === 'fr') return 'Avez-vous une formation supérieure ?'
    return 'Você possui formação superior?'
  }

  if (language === 'es') return 'Perfecto. Ya puedo tener una visión inicial de tu caso.\nEn CB analizamos cada caso de forma individual, siempre buscando el camino más seguro y dentro de la ley.'
  if (language === 'en') return 'Perfect. I can already get an initial view of your case.\nAt CB, we analyze each case individually, always looking for the safest path within the law.'
  if (language === 'fr') return 'Parfait. Je peux déjà avoir une première vision de votre cas.\nChez CB, nous analysons chaque cas individuellement, en cherchant toujours la voie la plus sûre et conforme à la loi.'
  return 'Perfeito. Já consigo ter uma visão inicial do seu caso.\nNa CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.'
}

export function isQuestionAboutEmail(question: string): boolean {
  const n = normalizeForLanguageChecks(question)
  return /\b(e ?mail|correo|email)\b/.test(n)
    && /\b(qual|cual|cu[áa]l|melhor|mejor|best|what|which)\b/.test(n)
}

export function isQuestionAboutFullName(question: string): boolean {
  const n = normalizeForLanguageChecks(question)
  return /\b(nome completo|nombre completo|full name|nom complet)\b/.test(n)
    || (/\b(nome|nombre|name|nom)\b/.test(n) && /\b(como|qual|cual|what|which)\b/.test(n))
}

export function isAutoGeneratedContactName(name: string | null | undefined, whatsappProfileName: string | null | undefined, phoneNumber: string): boolean {
  const normalizedName = String(name || '').trim()
  const normalizedProfile = String(whatsappProfileName || '').trim()
  if (!normalizedName) return true
  if (/^WhatsApp\s/i.test(normalizedName)) return true
  if (normalizedProfile && normalizedName.toLowerCase() === normalizedProfile.toLowerCase()) return true
  return normalizedName === `WhatsApp ${phoneNumber.slice(-4)}`
}

export function hasValidEmail(text: string): boolean {
  return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text || '')
}

export function getEmailReaskQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Necesito un correo electrónico válido para enviarte las orientaciones. ¿Cuál es tu mejor email? (ejemplo: nombre@gmail.com)'
  if (language === 'en') return 'I need a valid email address to send you the next steps. What is your best email? (e.g. name@gmail.com)'
  if (language === 'fr') return 'J’ai besoin d’une adresse e-mail valide pour vous envoyer les informations. Quel est votre meilleur e-mail ? (ex. nom@gmail.com)'
  return 'Preciso de um e-mail válido para te enviar as orientações. Qual é o seu melhor e-mail? (ex.: nome@gmail.com)'
}

export function getEmailQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Gracias. ¿Cuál es el mejor email para enviarte orientaciones y dar seguimiento a tu caso?'
  if (language === 'en') return 'Thank you. What is the best email to send you guidance and follow up on your case?'
  if (language === 'fr') return 'Merci. Quel est le meilleur e-mail pour vous envoyer des orientations et suivre votre dossier ?'
  return 'Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?'
}
