// @ts-nocheck
// Wave 3b step 4: question detectors + localized model phrases
import { type ChatLanguage, normalizeForLanguageChecks, getPromptTemplates } from './language.ts'
import { isValidSpanishCity } from './spanish-cities.ts'

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
  const n = normalizeForLanguageChecks(question)
  if (!n) return false
  // Token "espanha/espana/spain/espagne" deve estar presente
  if (!/\b(espanha|espana|spain|espagne)\b/.test(n)) return false
  // E algum termo de "entrada/chegada" em qualquer idioma
  return /\b(entrada|entrou|entrar|entraste|entraron|entered|enter|entry|entree|chegada|chegou|chegar|llegada|llego|llegaste|llegar|arrival|arrived|arrive|arrivee)\b/.test(n)
    // ou perguntas no formato "quando você entrou/chegou em ..." e equivalentes
    || /\b(quando|cuando|when|quand)\b.{0,40}\b(entr|cheg|lleg|arriv)/.test(n)
}

export function isNeverBeenToSpainAnswer(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)
  if (!normalized || normalized.includes('?')) return false

  return /\b(nunca fui|nunca estive|nunca entrei|jamais fui|jamais estive)\b/.test(normalized)
    || /\b(nao|no|not|never|jamais|never been|jamais ete|jamais ete a)\b.{0,24}\b(fui|estive|entrei|estoy|been|entered|entre|ete|allee|alle|allee a|alle a)\b/.test(normalized)
    || /\b(never been|never entered|never gone)\b.{0,16}\b(spain|espana|espanha|espagne)\b/.test(normalized)
    || /\b(nunca he estado|nunca estuve|nunca entre|nunca fui|no he estado|no he ido|no he entrado)\b/.test(normalized)
    || /\b(n ai jamais|je n ai jamais|jamais ete|jamais alle|jamais allee)\b/.test(normalized)
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
  // NOVO: aceita "mês YYYY" ou "YYYY mês" sem dia (ex.: "setembro 2024")
  const hasMonthYearOnly = new RegExp(`\\b(${monthName}\\s+(de\\s+|del\\s+)?\\d{4}|\\d{4}\\s+(de\\s+)?${monthName})\\b`).test(normalized)

  return hasDateRange || hasSingleDate || hasFullMonthNameDate || hasMonthYearOnly
}

/**
 * Tenta extrair uma data completa (com ano) da mensagem do cliente.
 * Retorna { iso: 'YYYY-MM-DD', isPast: boolean, isFuture: boolean } ou null.
 * Considera "hoje" como referência (UTC date-only).
 */
export function parseEntryDateFromText(text: string, today: Date = new Date()): { iso: string; isPast: boolean; isFuture: boolean } | null {
  if (!text) return null
  const raw = text.trim()
  const normalized = normalizeForLanguageChecks(text)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const buildResult = (y: number, m: number, d: number) => {
    if (!y || !m || !d) return null
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    if (y < 1900 || y > 2100) return null
    const ts = Date.UTC(y, m - 1, d)
    if (Number.isNaN(ts)) return null
    const iso = `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
    return { iso, isPast: ts <= todayUtc, isFuture: ts > todayUtc }
  }

  // YYYY-MM-DD or YYYY/MM/DD
  let m = raw.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/)
  if (m) return buildResult(+m[1], +m[2], +m[3])

  // DD/MM/YYYY or DD-MM-YYYY (assume DD/MM, not US MM/DD)
  m = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/)
  if (m) {
    let y = +m[3]
    if (y < 100) y += y < 50 ? 2000 : 1900
    return buildResult(y, +m[2], +m[1])
  }

  // "D de mês de YYYY" / "D month YYYY"
  const months: Record<string, number> = {
    janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6, julio: 7, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
  }
  const monthRe = Object.keys(months).join('|')
  const re1 = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+|del\\s+|do\\s+)?(${monthRe})\\s*(?:de\\s+|del\\s+|do\\s+)?(\\d{2,4})\\b`, 'i')
  m = normalized.match(re1)
  if (m) {
    let y = +m[3]
    if (y < 100) y += y < 50 ? 2000 : 1900
    return buildResult(y, months[m[2].toLowerCase()], +m[1])
  }
  // "month D, YYYY"
  const re2 = new RegExp(`\\b(${monthRe})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{2,4})\\b`, 'i')
  m = normalized.match(re2)
  if (m) {
    let y = +m[3]
    if (y < 100) y += y < 50 ? 2000 : 1900
    return buildResult(y, months[m[1].toLowerCase()], +m[2])
  }
  // NOVO: "mês YYYY" (sem dia) → assume dia 1
  const monthYearRe = new RegExp(`\\b(${monthRe})\\s+(?:de\\s+|del\\s+)?(\\d{4})\\b`, 'i')
  m = normalized.match(monthYearRe)
  if (m) return buildResult(+m[2], months[m[1].toLowerCase()], 1)
  // NOVO: "YYYY mês" (sem dia)
  const yearMonthRe = new RegExp(`\\b(\\d{4})\\s+(?:de\\s+)?(${monthRe})\\b`, 'i')
  m = normalized.match(yearMonthRe)
  if (m) return buildResult(+m[1], months[m[2].toLowerCase()], 1)

  return null
}

export function getEntryDateFutureConfirmQuestion(language: ChatLanguage, iso: string): string {
  if (language === 'es') return `La fecha que mencionaste (${iso}) parece estar en el futuro. ¿Puedes confirmarla?`
  if (language === 'en') return `The date you mentioned (${iso}) appears to be in the future. Can you confirm it?`
  if (language === 'fr') return `La date que vous avez indiquée (${iso}) semble être dans le futur. Pouvez-vous la confirmer ?`
  return `A data que você informou (${iso}) parece estar no futuro. Pode confirmar?`
}

export function looksLikeIncompleteEntryDateWithoutYear(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)
  if (!normalized || normalized.includes('?')) return false
  if (isPotentialEntryDateAnswer(text)) return false

  const monthName = '(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)'
  const monthAbbr = '(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|ene|feb|abr|may|jun|jul|ago|sep|oct|nov|dic)'
  return !/\b\d{4}\b/.test(normalized)
    && (new RegExp(`\\b\\d{1,2}\\s*(de\\s+|del\\s+|do\\s+)?${monthName}\\b`).test(normalized)
      || new RegExp(`\\b\\d{1,2}[\\s\\-/.]${monthAbbr}\\b`).test(normalized)
      || /\b\d{1,2}[\/.-]\d{1,2}\b/.test(normalized)
      || /\b(no dia|em|el|on|le)\s+\d{1,2}\b/.test(normalized))
}

export function getEntryDateNeedsYearQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Necesito la fecha completa, con día, mes y año. Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025). ¿Cuál fue la fecha exacta de tu entrada en España?'
  if (language === 'en') return 'I need the full date, including day, month and year. Please send it in the format DD/MM/YYYY (example: 22/05/2025). What was the exact date you entered Spain?'
  if (language === 'fr') return 'J’ai besoin de la date complète, avec le jour, le mois et l’année. Merci de l’envoyer au format JJ/MM/AAAA (exemple : 22/05/2025). Quelle était la date exacte de votre entrée en Espagne ?'
  return 'Preciso da data completa, com dia, mês e ano. Por favor, envie no formato DD/MM/AAAA (exemplo: 22/05/2025). Qual foi a data exata da sua entrada na Espanha?'
}

export function isQuestionAboutInterest(question: string): boolean {
  const n = normalizeForLanguageChecks(question)
  if (!n) return false
  // PT/ES/EN/FR — cobre 1ª/2ª/3ª pessoa e variantes ("buscas", "procura", "busca hoy", etc.)
  const re = /(o que (voce |voces )?(busca|procura|deseja|gostaria|quer|esta procurando)\b)|(\bque (buscas|busca|estas buscando|deseas|necesitas|quieres|te interesa)\b)|(\bcomo posso (te )?ajudar\b)|(\bem que (te )?(posso )?ajudar\b)|(\bqual (e )?(o )?seu interesse\b)|(\ben que (te )?puedo ayudar\b)|(\bcual es tu interes\b)|(\bwhat (are you (looking for|seeking)|brings you|do you need|can i help)\b)|(\bhow can i help\b)|(\b(que|qu) (cherchez|recherchez)[- ]vous\b)|(\bcomment (puis je|puis-je) (vous )?aider\b)|(\bquel est (votre|ton) (besoin|interet)\b)/
  return re.test(n)
}

// Levenshtein ≤ 1 para tolerar typos como "cuurso"→"curso", "residenccia"→"residencia"
function levenshteinLE1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (la === lb) { i++; j++ }
    else if (la > lb) { i++ }
    else { j++ }
  }
  if (i < la || j < lb) edits++
  return edits <= 1
}

export function isPotentialInterestAnswer(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)

  if (!normalized || normalized.includes('?')) return false
  if (normalized.length < 3) return false

  const interestKeywords = [
    'resid', 'residir', 'morar', 'viver', 'espanha', 'espana', 'nacional', 'cidad', 'arraigo',
    'document', 'nie', 'tie', 'estudo', 'estudar', 'homologa', 'antecedente', 'reagrupa',
    'trabalh', 'trabalho', 'family', 'famil', 'mae', 'madre', 'visa', 'visto', 'visado',
    'nacionalidade', 'nacionalidad', 'nationality',
    'autorizacao de regresso', 'autorizacao de regreso',
    'autorizacion de regreso', 'autorizacion de regresso',
    'return authorization',
    'curso', 'course', 'idioma', 'language',
    'social', 'laboral', 'familiar', 'formacion', 'formacao', 'formación',
    'permiso', 'permit', 'reagrupacao', 'reagrupacion',
    'regreso', 'regresso',
    'homologacao', 'homologacion', 'homologação', 'homologación',
  ]

  const exactTokens = new Set([
    'nacionalidade', 'nacionalidad', 'arraigo', 'nie', 'tie', 'curso', 'residencia',
    'residência', 'visado', 'visa', 'visto', 'homologacao', 'homologação', 'reagrupamento',
    'regreso', 'regresso',
  ])
  const trimmed = normalized.trim()
  if (exactTokens.has(trimmed)) return true

  // Tolerância a typos para tokens-chave isolados (uma única palavra)
  if (!/\s/.test(trimmed)) {
    const fuzzyTargets = ['curso', 'arraigo', 'nacionalidade', 'nacionalidad', 'residencia',
      'visado', 'homologacao', 'reagrupamento', 'regreso', 'regresso']
    if (fuzzyTargets.some((t) => levenshteinLE1(trimmed, t))) return true
  }

  return interestKeywords.some((keyword) => normalized.includes(keyword))
}

export function getLocationQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Hoy ya estás en España?'
  if (language === 'en') return 'Are you already in Spain today?'
  if (language === 'fr') return 'Êtes-vous déjà en Espagne aujourd’hui ?'
  return 'Hoje você já está na Espanha?'
}

/**
 * Detector multi-idioma para a pergunta de localização ("Você está na Espanha?",
 * "Hoje você já está na Espanha?", "¿Estás en España?", etc.).
 */
export function isQuestionAboutLocationSpain(question: string): boolean {
  const n = normalizeForLanguageChecks(question)
  if (!n) return false
  if (!/(espanha|espana|spain|espagne)/.test(n)) return false
  // Formas longas e curtas, com ou sem prefixo "ya"/"já"/"hoje":
  // "¿Estás en España?", "Você está na Espanha?", "Are you in Spain?",
  // "Êtes-vous en Espagne ?", "Hoy ya estás en España", etc.
  return /(voce esta na|voce ja esta na|hoje voce|esta na espanha|estas en espana|ya estas en|hoy ya estas|are you (already|currently)? in|are you in spain|etes vous (deja )?en espagne|deja en espagne)/.test(n)
    || /^\s*(voce |tu |usted |you )?\s*(esta|estas|are|etes vous|etes-vous)\s+(em |en |in |na )?(espanha|espana|spain|espagne)\s*$/.test(n)
    || /^\s*(estas|esta)\s+en\s+espa(n|ñ)a\s*$/.test(n)
}

/**
 * Detector multi-idioma para B5 ("Em qual cidade você está empadronado?").
 */
export function isQuestionAboutEmpadronamientoCity(question: string): boolean {
  return /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i.test(question || '')
    || /(no reconoc|did not recognize|n[ãa]o reconheci|n ai pas reconnu|reconnu cette ville)/i.test(question || '')
}

export function getEmpadronadoQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Estás empadronado?'
  if (language === 'en') return 'Are you registered (empadronado)?'
  if (language === 'fr') return 'Êtes-vous empadronado ?'
  return 'você está empadronado?'
}

export function getEmpadronamientoSinceQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Desde cuándo estás empadronado?\n\nSolo la fecha DD/MM/AAAA'
  if (language === 'en') return 'Since when are you registered (empadronado)?\n\nOnly the date DD/MM/YYYY'
  if (language === 'fr') return 'Depuis quand êtes-vous empadronado ?\n\nUniquement la date JJ/MM/AAAA'
  return 'Desde quando está empadronado?\n\nsomente a data DD/MM/AAAA'
}

export function getEmpadronamientoCityQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿En qué ciudad fuiste empadronado?'
  if (language === 'en') return 'In which city were you registered (empadronado)?'
  if (language === 'fr') return 'Dans quelle ville avez-vous été empadronado ?'
  return 'Em qual cidade você foi empadronado?'
}

export function getInvalidSpanishCityReprompt(language: ChatLanguage): string {
  if (language === 'es') return 'No reconocí esa ciudad como un municipio español. ¿Puedes confirmar el nombre del municipio de España donde estás empadronado?'
  if (language === 'en') return 'I did not recognize that as a Spanish municipality. Could you confirm the name of the city in Spain where you are registered (empadronado)?'
  if (language === 'fr') return 'Je n’ai pas reconnu cette ville comme une commune espagnole. Pouvez-vous confirmer le nom de la ville en Espagne où vous êtes empadronado ?'
  return 'Não reconheci essa cidade como um município espanhol. Pode confirmar o nome da cidade na Espanha onde você está empadronado?'
}

export function getOutsideSpainAgeQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Cuál es tu edad?'
  if (language === 'en') return 'How old are you?'
  if (language === 'fr') return 'Quel âge avez-vous ?'
  return 'Qual sua idade?'
}

// D1 Bizagi (Msg 6): após o cliente declarar interesse, listar serviços atendidos
// pela CB e validar antes de pedir a localização.
export function getServicesOfferedMessage(language: ChatLanguage): string {
  if (language === 'es') {
    return 'En CB trabajamos con: residencia (NIE/TIE), nacionalidad española, arraigo (social, laboral, familiar, formación), reagrupación familiar, homologación de títulos y autorización de regreso.'
  }
  if (language === 'en') {
    return 'At CB we handle: residence (NIE/TIE), Spanish nationality, arraigo (social, labor, family, training), family reunification, diploma homologation and return authorization.'
  }
  if (language === 'fr') {
    return 'Chez CB, nous traitons : résidence (NIE/TIE), nationalité espagnole, arraigo (social, professionnel, familial, formation), regroupement familial, homologation de diplômes et autorisation de retour.'
  }
  return 'Na CB trabalhamos com: residência (NIE/TIE), nacionalidade espanhola, arraigo (social, laboral, familiar, formação), reagrupamento familiar, homologação de diploma e autorização de regresso.'
}

export function isServicesOfferedMessage(text: string): boolean {
  const n = normalizeForLanguageChecks(text || '')
  if (!n) return false
  // tokens-âncora multi-idioma estáveis
  return /(arraigo)/.test(n)
    && /(reagrupa|reagrupacion|reunification|regroupement)/.test(n)
    && /(homologa|homologation)/.test(n)
}

// BPMN v2 (CB_pre-handoff_v2.bpm): pré-handoff + handoff = 3 mensagens distintas (H1, H2, H3),
// enviadas na MESMA rodada após A/B-completos. H4 foi REMOVIDA — o fluxo termina em H3.
// Cada função retorna bolhas separadas pelo delimitador "|||" (o caller faz split e envia mensagens individuais).

// H1 ||| H2  — texto literal do diagrama
export function getPreHandoffSummaryMessage(language: ChatLanguage): string {
  if (language === 'es') {
    return 'Perfecto, ya puedo tener una visión inicial de tu caso.|||En CB analizamos cada caso de forma individual, siempre buscando el camino más seguro y dentro de la ley.'
  }
  if (language === 'en') {
    return 'Perfect, I can already get an initial view of your case.|||At CB we analyze each case individually, always looking for the safest path within the law.'
  }
  if (language === 'fr') {
    return 'Parfait, je peux déjà avoir une première vision de votre cas.|||Chez CB, nous analysons chaque cas individuellement, en cherchant toujours la voie la plus sûre et conforme à la loi.'
  }
  return 'Perfeito, já consigo ter uma visão inicial do seu caso.|||Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.'
}

// H3 — texto literal do diagrama (única bolha; H4 removida na v2)
export function getHandoffTransferMessage(language: ChatLanguage): string {
  if (language === 'es') {
    return 'Voy a remitir tu información a un especialista para que la analice con más profundidad.'
  }
  if (language === 'en') {
    return 'I will forward your information to a specialist to analyze it in more depth.'
  }
  if (language === 'fr') {
    return 'Je vais transmettre vos informations à un spécialiste pour qu’il les analyse plus en profondeur.'
  }
  return 'Vou encaminhar suas informações para um especialista analisar com mais profundidade.'
}

// Sufixo localizado anexado a cada resposta de KB no MODO PÓS-HANDOFF (após H3).
export function getPostHandoffWaitSuffix(language: ChatLanguage): string {
  if (language === 'es') return 'En breve uno de nuestros especialistas podrá ayudarte con eso. Por favor, aguarda.'
  if (language === 'en') return 'One of our specialists will be able to help you with this shortly. Please wait.'
  if (language === 'fr') return 'Un de nos spécialistes pourra vous aider avec cela très bientôt. Merci de patienter.'
  return 'Em breve um de nossos especialistas poderá lhe ajudar com isso. Por favor aguarde.'
}

const PRE_HANDOFF_SUMMARY_RE = /(vis[ãa]o inicial do seu caso|visi[óo]n inicial de tu caso|initial view of your case|premi[èe]re vision de votre cas)/i
// BPMN v2: âncoras só de H3 (H4 removida)
const HANDOFF_TRANSFER_RE = /(encaminhar suas informa[çc][õo]es|remitir tu informaci[óo]n|forward your information|transmettre vos informations)/i
export function preHandoffSummarySent(transcript: string): boolean {
  return PRE_HANDOFF_SUMMARY_RE.test(transcript || '')
}
export function handoffTransferSent(transcript: string): boolean {
  return HANDOFF_TRANSFER_RE.test(transcript || '')
}

/**
 * Monta o payload BPMN v2: H1|||H2|||H3 numa única rodada (3 bolhas).
 * Aceita um transcript (legado, fallback por regex) OU flags persistidas (preferido).
 * Retorna string vazia quando ambos já foram enviados.
 */
export function buildPreHandoffPayload(
  language: ChatLanguage,
  source: string | { preHandoffSent?: boolean; handoffSent?: boolean; transcript?: string },
): string {
  let summarySent = false
  let transferSent = false
  if (typeof source === 'string') {
    summarySent = preHandoffSummarySent(source)
    transferSent = handoffTransferSent(source)
  } else {
    summarySent = !!source.preHandoffSent || (!!source.transcript && preHandoffSummarySent(source.transcript))
    transferSent = !!source.handoffSent || (!!source.transcript && handoffTransferSent(source.transcript))
  }
  if (summarySent && transferSent) return ''
  if (summarySent && !transferSent) return getHandoffTransferMessage(language)
  if (!summarySent && transferSent) return getPreHandoffSummaryMessage(language)
  // Nada enviado → BPMN v2 manda H1-H2-H3 na mesma rodada (3 bolhas)
  return `${getPreHandoffSummaryMessage(language)}|||${getHandoffTransferMessage(language)}`
}

export function getOutsideSpainNextQuestion(
  language: ChatLanguage,
  assistantTranscript: string,
  options?: {
    entryDateConfirmed?: string | null
    locationKnown?: string | null
    outsideProgress?: {
      a2_age?: string
      a3_europe_6m?: 'yes' | 'no'
      a4_eu_family?: 'yes' | 'no'
      a5_remote?: 'yes' | 'no'
      a6_higher_ed?: 'yes' | 'no'
    } | null
  },
): string {
  const op = options?.outsideProgress || {}
  const askedIdade = !!op.a2_age || /\b(qual sua idade|cu[áa]ntos a[ñn]os|how old)\b/i.test(assistantTranscript)
  // A3–A6 avançam SOMENTE quando temos a resposta válida capturada (sim/não).
  // Se a pergunta foi feita mas o cliente respondeu algo inválido (ex.: "cachorro"),
  // repetimos a mesma pergunta com prefixo de reask em vez de pular para a próxima.
  const answeredEuropa = !!op.a3_europe_6m
  const answeredFamiliar = !!op.a4_eu_family
  const answeredRemoto = !!op.a5_remote
  const answeredFormacao = !!op.a6_higher_ed

  const askedEuropaInTranscript = /\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months\b/i.test(assistantTranscript)
  const askedFamiliarInTranscript = /\bfamiliar (europeu|europeo)|family member.*(eu|spain)\b/i.test(assistantTranscript)
  const askedRemotoInTranscript = /\b(trabalha remoto|trabajas? remoto|work remotely)\b/i.test(assistantTranscript)
  const askedFormacaoInTranscript = /\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree)\b/i.test(assistantTranscript)

  const reaskPrefix = (lang: ChatLanguage): string => {
    if (lang === 'es') return 'Por favor, responde solo con *sí* o *no*. '
    if (lang === 'en') return 'Please answer only with *yes* or *no*. '
    if (lang === 'fr') return 'Merci de répondre uniquement par *oui* ou *non*. '
    return 'Por favor, responda apenas com *sim* ou *não*. '
  }

  // Pular A3 quando já temos a informação implícita: cliente está na Espanha
  // OU informou data de entrada nos últimos 180 dias.
  const entryDateInLast6Months = (() => {
    const d = options?.entryDateConfirmed
    if (!d) return false
    const t = Date.parse(d)
    if (Number.isNaN(t)) return false
    const days = (Date.now() - t) / 86_400_000
    return days >= 0 && days <= 180
  })()
  const skipEuropa = options?.locationKnown === 'spain' || entryDateInLast6Months

  if (!askedIdade) return getOutsideSpainAgeQuestion(language)
  if (!skipEuropa && !answeredEuropa) {
    const prefix = askedEuropaInTranscript ? reaskPrefix(language) : ''
    if (language === 'es') return prefix + '¿Estuviste en Europa en los últimos 6 meses?'
    if (language === 'en') return prefix + 'Have you been in Europe in the last 6 months?'
    if (language === 'fr') return prefix + 'Êtes-vous allé en Europe au cours des 6 derniers mois ?'
    return prefix + 'você esteve na Europa nos últimos 6 meses?'
  }
  if (!answeredFamiliar) {
    const prefix = askedFamiliarInTranscript ? reaskPrefix(language) : ''
    if (language === 'es') return prefix + '¿Tienes algún familiar europeo o residente legal en España?'
    if (language === 'en') return prefix + 'Do you have a European family member or a legal resident in Spain?'
    if (language === 'fr') return prefix + 'Avez-vous un membre de votre famille européen ou résident légal en Espagne ?'
    return prefix + 'possui familiar europeu ou residente legal na espanha?'
  }
  if (!answeredRemoto) {
    const prefix = askedRemotoInTranscript ? reaskPrefix(language) : ''
    if (language === 'es') return prefix + '¿Trabajas de forma remota?'
    if (language === 'en') return prefix + 'Do you work remotely?'
    if (language === 'fr') return prefix + 'Travaillez-vous à distance ?'
    return prefix + 'você trabalha remoto?'
  }
  if (!answeredFormacao) {
    const prefix = askedFormacaoInTranscript ? reaskPrefix(language) : ''
    if (language === 'es') return prefix + '¿Tienes formación superior?'
    if (language === 'en') return prefix + 'Do you have higher education?'
    if (language === 'fr') return prefix + 'Avez-vous une formation supérieure ?'
    return prefix + 'Você possui formação superior?'
  }


  // D3 Bizagi: pré-handoff em 2 mensagens (summary ||| transfer). Idempotência via transcript.
  const payload = buildPreHandoffPayload(language, assistantTranscript || '')
  if (payload) return payload
  return getPreHandoffSummaryMessage(language)
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
  if (language === 'es') return '¿Cuál es el mejor email para enviarte orientaciones y dar seguimiento a tu caso?'
  if (language === 'en') return 'What is the best email to send you guidance and follow up on your case?'
  if (language === 'fr') return 'Quel est le meilleur e-mail pour vous envoyer des orientations et suivre votre dossier ?'
  return 'Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?'
}

export function getFullNameReaskQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Gracias. Para continuar, necesito tu *nombre y apellido* (nombre completo). ¿Puedes enviármelo?'
  if (language === 'en') return 'Thanks. To continue, I need your *first and last name* (full name). Could you send it?'
  if (language === 'fr') return 'Merci. Pour continuer, j’ai besoin de votre *prénom et nom* (nom complet). Pouvez-vous me l’envoyer ?'
  return 'Obrigado. Para seguir, preciso do seu *nome e sobrenome* (nome completo). Pode me enviar?'
}

export function getFullNameRequiredReaskQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Para poder atender tu caso, *necesito tu nombre completo* (nombre y apellido). Sin esa información no puedo continuar. ¿Puedes informarlo, por favor?'
  if (language === 'en') return 'To handle your case I *need your full name* (first and last name). I can’t continue without it. Could you please share it?'
  if (language === 'fr') return 'Pour traiter votre dossier, j’ai *besoin de votre nom complet* (prénom et nom). Je ne peux pas continuer sans cette information. Pouvez-vous me l’indiquer ?'
  return 'Para conseguir atender seu caso, *preciso do seu nome completo* (nome e sobrenome). Sem essa informação não consigo continuar. Pode me informar, por favor?'
}

export function getLocationSpainRequiredReaskQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Necesito saber si estás en España (Sí o No).'
  if (language === 'en') return 'I need to know whether you are in Spain (Yes or No).'
  if (language === 'fr') return "J'ai besoin de savoir si vous êtes en Espagne (Oui ou Non)."
  return 'Preciso saber se você está na Espanha (Sim ou Não).'
}

export type YesNoClassification = 'yes' | 'no' | 'ambiguous'

/**
 * Classifica a resposta do cliente à pergunta "Está na Espanha?" em yes/no/ambíguo.
 * Modo rigoroso: ignora frases longas e respostas evasivas; aceita apenas palavras-chave
 * claras de SIM/NÃO ou menção explícita a localização na/fora da Espanha.
 */
export function classifyYesNo(text: string): YesNoClassification {
  const raw = String(text || '').trim()
  if (!raw) return 'ambiguous'

  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Tokens simples da mensagem (ignora palavras muito curtas/comuns sozinhas)
  const words = normalized.split(' ').filter(w => w.length > 0)

  // Frases evasivas/ambíguas → sempre ambíguo
  const ambiguousPhrases = [
    /\b(nao sei|n[ãa]o sei|no se|no s[ée]|dont know|don't know|do not know|ne sais pas|sais pas)\b/i,
    /\b(talvez|maybe|perhaps|peut[ -]?etre|peut[ -]?être)\b/i,
    /\b(depende|depends|quem sabe|quien sabe)\b/i,
    /\b(sou de l[aá]|soy de all[aá]|je suis de l[aà])\b/i,
  ]
  for (const re of ambiguousPhrases) {
    if (re.test(raw)) return 'ambiguous'
  }

  // "Pode ser" isolado pode ser afirmativo informal; só é ambíguo se não houver contexto de localização
  if (/\b(pode ser|puede ser)\b/i.test(raw) && !/\b(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|valencia|sevilla|m[áa]laga|malaga|bilbao|alicante|zaragoza|murcia|palma|granada)\b/i.test(raw)) {
    return 'ambiguous'
  }

  // Correspondência EXATA de respostas curtas afirmativas
  const yesExact = /^(sim|si|s[ií]|yes|yep|yeah|yea|y|oui|claro|exacto|exactamente|exactly|correto|certo|positivo|sure|ok|okay|vale|dale|manda|vai|vamos|fala|pronto|adelante|go ahead|all[ée]z)(\s*[.!?])?$/i
  if (yesExact.test(raw)) return 'yes'

  // Correspondência EXATA de respostas curtas negativas
  const noExact = /^(n[ãa]o|no|nope|nah|n|non|negativo|jamais|nunca|never)(\s*[.!?])?$/i
  if (noExact.test(raw)) return 'no'

  // Recusas explícitas
  const refusalRe = /(n[ãa]o quero (responder|dizer|falar|informar)|prefiro n[ãa]o|prefer not|don'?t want to (answer|say)|no quiero (responder|decir)|prefiero no|je (ne )?(veux|pr[ée]f[èe]re) pas)/i
  if (refusalRe.test(raw)) return 'ambiguous'

  // Negativas com contexto de localização
  const locationNegative = /\b(estou|estoy|moro|vivo|fico|trabalho|trabajo|living|live|i am|i'm|je suis|eu estou|yo estoy)\s+(em|en|in|na|no|nos|a|de)\s+(brasil|brazil|portugal|argentina|m[ée]xico|mexico|colombia|chile|uruguai|uruguay|venezuela|paraguai|paraguay|estados unidos|eua|usa|outro pa[ií]s|en otro pa[ií]s|em outro pa[ií]s|other country|autre pays)\b/i
  const outsideSpain = /\b(fora da espanha|fora de espanha|fora da espa[ñn]a|fora de espa[ñn]a|estou fora|estoy fuera|outside spain|pas en espagne|no estoy en espa[ñn]a|não estou na espanha|não estou em espanha|não estou na espa[ñn]a)\b/i
  const otherCountry = /\b(sou de outro pa[ií]s|soy de otro pa[ií]s|outro pa[ií]s|otro pa[ií]s|other country|autre pays)\b/i

  // "fora"/"outro país" sem negação explícita ainda é claramente fora
  if (outsideSpain.test(raw) || otherCountry.test(raw)) return 'no'

  const isNegative = /\b(n[ãa]o|no|not|non|ne)\b/i.test(raw)
    && (/\b(ainda n[ãa]o|todav[ií]a no|not yet|pas encore)\b/i.test(raw)
      || /\b(n[ãa]o (estou|moro|vivo|trabalho)|no (estoy|vivo|trabajo)|i'?m not|not in spain|je ne suis pas|pas en espagne)\b/i.test(raw)
      || locationNegative.test(raw)
      || outsideSpain.test(raw)
      || otherCountry.test(raw))
  if (isNegative) return 'no'

  // Afirmativas com contexto de localização
  const locationAffirmative = /\b(estou|estoy|moro|vivo|fico|trabalho|trabajo|living|live|i am|i'm|je suis|eu estou|yo estoy)\s+(em|en|in|na|no|nos|a|de)\s+(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|val[éeèê]ncia|sevilla|m[áa]laga|malaga|bilbao|alicante|zaragoza|murcia|palma|granada)\b/i
  const inSpain = /\b(j[áa] estou|ya estoy|estou (na |em )?espanha|estou na espa[ñn]a|estoy en espa[ñn]a|i'?m in spain|aqui na espanha|aqu[ií] en espa[ñn]a|je suis en espagne|oui en espagne|s[ií] en espa[ñn]a|yes,? i am in spain|yes in spain)\b/i.test(raw)
  const yesWithCity = /\b(sim|si|s[ií]|yes|oui|claro|exacto|exactamente|exactly|correto|certo|positivo|sure|ok|okay|vale),?\s+(em|en|in|na|a|de)\s+(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|val[éeèê]ncia|sevilla|m[áa]laga|malaga|bilbao|alicante|zaragoza|murcia|palma|granada)\b/i.test(raw)
  const isAffirmative = inSpain
    || locationAffirmative.test(raw)
    || yesWithCity
    || (/\b(sim|si|s[ií]|yes|oui|claro|exacto|exactamente|exactly|correto|certo|positivo|sure|ok|okay|vale|dale|manda|vai|vamos|fala|pronto|adelante|go ahead|all[ée]z)\b/i.test(raw)
      && /\b(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|val[éeèê]ncia|sevilla|m[áa]laga|malaga|bilbao|alicante|zaragoza|murcia|palma|granada)\b/i.test(raw))
  if (isAffirmative) return 'yes'

  // País mencionado sozinho (sem Espanha) → fora
  const countryAlone = /^(brasil|brazil|portugal|argentina|m[ée]xico|mexico|colombia|chile|uruguai|uruguay|venezuela|paraguai|paraguay|estados unidos|eua|usa|autre pays|other country)$/i
  if (countryAlone.test(normalized)) return 'no'

  return 'ambiguous'
}

export function getEmailRequiredReaskQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Necesito *un correo electrónico válido* para enviarte las orientaciones y dar seguimiento a tu caso. Sin eso no puedo continuar. ¿Cuál es tu mejor email? (ej.: nombre@gmail.com)'
  if (language === 'en') return 'I *need a valid email address* to send you the next steps and follow up on your case. I can’t continue without it. What is your best email? (e.g. name@gmail.com)'
  if (language === 'fr') return 'J’ai *besoin d’une adresse e-mail valide* pour vous envoyer les orientations et suivre votre dossier. Je ne peux pas continuer sans cela. Quel est votre meilleur e-mail ? (ex. nom@gmail.com)'
  return 'Preciso de *um e-mail válido* para te enviar as orientações e acompanhar seu caso. Sem isso não consigo continuar. Qual é o seu melhor e-mail? (ex.: nome@gmail.com)'
}

/**
 * Conta palavras "alfabéticas" (≥2 letras) em uma resposta de texto, ignorando
 * pontuação, números e tokens curtos. Usado para detectar se o cliente respondeu
 * só com primeiro nome (1 palavra) à pergunta de nome completo.
 */
export function countAlphaWords(text: string): number {
  if (!text) return 0
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  return words.filter((w) => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(w)).length
}

// ============================================================================
// Pré-handoff determinístico — dispatcher único de perguntas literais (BPMN v2)
// ============================================================================

function getInsideSpainEntryDateQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Cuál fue la fecha exacta de entrada en España? Solo la fecha DD/MM/AAAA'
  if (language === 'en') return 'What was the exact date of entry into Spain? Only the date DD/MM/YYYY'
  if (language === 'fr') return "Quelle a été la date exacte d'entrée en Espagne ? Uniquement la date JJ/MM/AAAA"
  return 'Qual foi a data exata de entrada na espanha? somente a data DD/MM/AAAA'
}

/**
 * Retorna a próxima pergunta literal do BLOCO B (cliente NA Espanha), em ordem:
 * B1 (intro) → B2 (data entrada) → B3 (empadronado?) → B4 (desde quando) → B5 (cidade)
 * → pré-handoff (H1|||H2|||H3) quando bloco completo.
 *
 * Importante: B1 intro só é incluído quando ainda não foi enviado (b1IntroSent=false).
 * Garante que a frase "Agora preciso entender como está sua situação aqui."
 * NUNCA vaze para o bloco fora-da-Espanha (bug do screenshot).
 */
export function getInsideSpainNextQuestion(
  language: ChatLanguage,
  assistantTranscript: string,
  options?: {
    entryDateConfirmed?: string | null
    empadronadoConfirmed?: boolean | null
    empadronadoCity?: string | null
    empadronadoSinceConfirmed?: string | null
    preHandoffSent?: boolean
    handoffSent?: boolean
  },
): string {
  const t = getPromptTemplates(language)
  const transcript = assistantTranscript || ''
  const opts = options || {}

  const b1IntroSent = /\bagora preciso entender como est[áa] sua situa[çc][ãa]o aqui|ahora necesito entender|now i need to understand|maintenant je dois comprendre\b/i.test(transcript)
  const askedEntryDate = !!opts.entryDateConfirmed
    || /\b(data (exata )?da sua entrada|fecha (exacta )?de tu entrada|date (exacte )?(de votre|of your) entr|date you entered|when did you (enter|arrive))\b/i.test(transcript)
  const askedEmpadronado = opts.empadronadoConfirmed !== null && opts.empadronadoConfirmed !== undefined
    || /voc[êe] est[áa] empadronad|est[áa]s empadronad|are you (registered|empadronad)|[êe]tes-vous empadronad/i.test(transcript)
  const askedDesdeQuando = !!opts.empadronadoSinceConfirmed
    || /\b(desde quando|desde cu[áa]ndo|since when|depuis quand)\b/i.test(transcript)
  const askedCidade = !!opts.empadronadoCity
    || /\b(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)\b/i.test(transcript)

  // B2 — data de entrada (sem intro extra; mensagem literal do cliente)
  if (!askedEntryDate) {
    return getInsideSpainEntryDateQuestion(language)
  }
  // B3 — empadronado?
  if (!askedEmpadronado) return getEmpadronadoQuestion(language)
  // B4 — desde quando (só se empadronado=true; se false, pula direto para pré-handoff)
  if (opts.empadronadoConfirmed === true && !askedDesdeQuando) return getEmpadronamientoSinceQuestion(language)
  // B5 — cidade (só se empadronado=true)
  if (opts.empadronadoConfirmed === true && !askedCidade) return getEmpadronamientoCityQuestion(language)

  // Bloco completo → pré-handoff
  return buildPreHandoffPayload(language, {
    preHandoffSent: !!opts.preHandoffSent,
    handoffSent: !!opts.handoffSent,
    transcript,
  })
}

export type ScriptedStepKey = 'abertura' | 'nome' | 'email' | 'interesse' | 'localizacao' | 'aprofundamento' | 'preHandoff'

export interface ScriptedDispatchContext {
  userInSpain: boolean
  userOutsideSpain: boolean
  assistantTranscript: string
  entryDateConfirmed?: string | null
  locationKnown?: string | null
  empadronadoConfirmed?: boolean | null
  empadronadoCity?: string | null
  empadronadoSinceConfirmed?: string | null
  preHandoffSent?: boolean
  handoffSent?: boolean
  outsideProgress?: any
  catalogSent?: boolean
}

/**
 * Dispatcher único: dado o stepKey atual do gate, retorna a pergunta literal
 * do roteiro (sem qualquer invenção do LLM). String vazia significa "sem pergunta
 * canônica para este turno" (deixa o LLM agir).
 */
export function getNextScriptedQuestion(
  stepKey: ScriptedStepKey,
  language: ChatLanguage,
  ctx: ScriptedDispatchContext,
): string {
  const t = getPromptTemplates(language)
  switch (stepKey) {
    case 'abertura':
      return `${t.openingLine1}|||${t.openingLine2}`
    case 'nome':
      return t.askName
    case 'email':
      return t.thanksThenAskEmail
    case 'interesse': {
      // Msg5 + Msg6 sempre como duas bolhas, salvo se Msg6 já foi enviada.
      if (ctx.catalogSent) return t.interestQuestion
      return `${t.interestQuestion}|||${getServicesOfferedMessage(language)}`
    }
    case 'localizacao':
      return t.askLocationSpain
    case 'aprofundamento': {
      if (ctx.userInSpain) {
        return getInsideSpainNextQuestion(language, ctx.assistantTranscript, {
          entryDateConfirmed: ctx.entryDateConfirmed,
          empadronadoConfirmed: ctx.empadronadoConfirmed,
          empadronadoCity: ctx.empadronadoCity,
          empadronadoSinceConfirmed: ctx.empadronadoSinceConfirmed,
          preHandoffSent: ctx.preHandoffSent,
          handoffSent: ctx.handoffSent,
        })
      }
      if (ctx.userOutsideSpain) {
        return getOutsideSpainNextQuestion(language, ctx.assistantTranscript, {
          entryDateConfirmed: ctx.entryDateConfirmed,
          locationKnown: ctx.locationKnown,
          outsideProgress: ctx.outsideProgress,
        })
      }
      // Sem localização confirmada — não emitir nada (LLM já tem instrução de aguardar)
      return ''
    }
    case 'preHandoff':
      return buildPreHandoffPayload(language, {
        preHandoffSent: !!ctx.preHandoffSent,
        handoffSent: !!ctx.handoffSent,
        transcript: ctx.assistantTranscript,
      })
    default:
      return ''
  }
}

/**
 * Acknowledgment curto e localizado para anteceder a próxima pergunta canônica.
 * "Certo." / "Perfecto." para sim/não; "Obrigado." quando o cliente acabou
 * de responder nome/e-mail/texto livre. Vazio quando a etapa anterior é abertura
 * ou quando não há contexto.
 */
export function getShortAck(
  language: ChatLanguage,
  prevAssistantQuestion: string,
  customerMessage: string,
): string {
  if (!prevAssistantQuestion) return ''
  const ans = String(customerMessage || '').trim().toLowerCase()
  if (!ans) return ''

  const isYesNoLike = /^(sim|s[ií]|yes|yep|yeah|claro|exato|oui|ouais|n[ãa]o|no|nope|nah|non)\b/.test(ans)
    || /^\d{1,4}$/.test(ans) // idade
  const ackText: Record<string, string> = {
    'pt-BR': 'Obrigado.',
    'es': 'Gracias.',
    'en': 'Thank you.',
    'fr': 'Merci.',
  }
  // Após sim/não/idade → sem ack (evita repetição de "Certo." / "Perfecto." / etc).
  if (isYesNoLike) return ''
  // Após nome/e-mail/texto livre → agradece.
  if (isQuestionAboutFullName(prevAssistantQuestion) || isQuestionAboutEmail(prevAssistantQuestion)) {
    return ackText[language] || ackText['pt-BR']
  }
  return ''
}


/**
 * Detector CONSERVADOR de residência atual na Espanha declarada espontaneamente.
 *
 * Só retorna { matched:true } quando o cliente afirma, em presente do indicativo,
 * que ESTÁ / MORA / VIVE / RESIDE na Espanha (ou em cidade espanhola conhecida).
 *
 * NUNCA aciona por:
 *  - passado ("estive na Espanha", "was in Spain", "j'étais")
 *  - futuro/intenção ("vou pra Espanha", "quiero ir", "I'm going to")
 *  - terceiros ("minha família mora na Espanha", "mi familia vive en España")
 *  - condicional ("se eu for", "quando eu chegar")
 *
 * Usado APENAS para auto-preencher location_known='spain'. Nunca 'outside'.
 */
export function detectSpainResidenceClaim(text: string): { matched: boolean; evidence: string; city?: string } {
  const raw = String(text || '').trim()
  if (!raw) return { matched: false, evidence: '' }
  const n = normalizeForLanguageChecks(raw)
  if (!n) return { matched: false, evidence: '' }

  const THIRD_PARTY = /\b(minha|meu|mi|mis|my|ma|mon|mes)\s+(familia|família|filho|filha|filhos|filhas|marido|esposa|esposo|mulher|pai|mae|mãe|hijo|hija|hijos|hijas|esposo|esposa|padre|madre|husband|wife|son|daughter|children|kids|father|mother|mari|femme|fils|fille|pere|mere|père|mère)\b/i
  if (THIRD_PARTY.test(n)) return { matched: false, evidence: '' }

  const NEGATIVE_CONTEXT = new RegExp([
    '\\b(estive|estava|estivemos|fui|fomos|morei|moramos|vivi|vivemos|residi|estuve|estaba|estuvimos|vivi|vivimos|viviamos|residi|residia)\\b',
    '\\b(was|were|used to|have been|had been|lived|resided)\\b',
    "\\b(etais|etions|j ai vecu|ai vecu|habitais|habitions|residais|j etais)\\b",
    '\\b(vou|iremos|vamos ir|pretendo|penso em ir|quero ir|planejo|voy a ir|voy a mudarme|pienso ir|quiero ir|planeo|i want to go|i plan to|i m going to|i am going to|going to move|i ll move|je vais aller|je compte|je pense aller|je vais m installer)\\b',
    '\\b(se eu for|quando eu chegar|se eu chegar|si voy|cuando llegue|si llego|if i go|when i arrive|when i get|si je vais|quand j arriverai)\\b',
    '\\b(nao|no|not|never|jamais|non)\\b[^.!?]{0,15}\\b(estou|to|tou|moro|vivo|resido|estoy|live|reside|habite|suis|vis)\\b',
  ].join('|'), 'i')
  if (NEGATIVE_CONTEXT.test(n)) return { matched: false, evidence: '' }

  const SPAIN = '(espanha|espana|spain|espagne)'
  const patterns: RegExp[] = [
    new RegExp(`\\b(estou|to|tou|moro|vivo|resido|me encontro)\\s+(aqui\\s+)?(na|em|no)\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bja\\s+(estou|moro|vivo|resido)\\s+(aqui\\s+)?(na|em)\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\b(estoy|vivo|resido|me encuentro)\\s+(actualmente\\s+|ya\\s+)?(en|aqui en)\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bya\\s+(estoy|vivo|resido)\\s+(aqui\\s+)?en\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bi\\s*(am|m)\\s+(currently\\s+|already\\s+)?(in|living in|residing in)\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bi\\s+(live|reside)\\s+in\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bje\\s+(suis|vis|reside|habite)\\s+(actuellement\\s+|deja\\s+)?(en|a)\\s+${SPAIN}\\b`, 'i'),
    new RegExp(`\\bj\\s+habite\\s+(en|a)\\s+${SPAIN}\\b`, 'i'),
  ]
  for (const re of patterns) {
    const m = n.match(re)
    if (m) return { matched: true, evidence: m[0].trim() }
  }

  const cityPreps: RegExp[] = [
    /\b(?:estou|to|tou|moro|vivo|resido|me encontro)\s+(?:aqui\s+)?(?:em|na|no)\s+([a-z][a-z '.-]{1,40})/i,
    /\b(?:estoy|vivo|resido|me encuentro)\s+(?:actualmente\s+|ya\s+)?(?:en)\s+([a-z][a-z '.-]{1,40})/i,
    /\bi\s*(?:am|m)\s+(?:currently\s+|already\s+)?(?:in|living in)\s+([a-z][a-z '.-]{1,40})/i,
    /\bi\s+(?:live|reside)\s+in\s+([a-z][a-z '.-]{1,40})/i,
    /\bje\s+(?:suis|vis|habite|reside)\s+(?:actuellement\s+)?(?:a|en|dans)\s+([a-z][a-z '.-]{1,40})/i,
    /\bj\s+habite\s+(?:a|en|dans)\s+([a-z][a-z '.-]{1,40})/i,
  ]
  const STOPWORD_TAIL = /^(agora|actualmente|actualment|already|now|maintenant|desde|hace|há|ha|depuis|since|for|por|pela|pelo|em|and|e|y|et|mas|pero|but|mais|com|con|with|avec)\b/i
  for (const re of cityPreps) {
    const m = n.match(re)
    if (!m || !m[1]) continue
    let candidate = m[1].split(/[,.;!?]|(?:\s+e\s+)|(?:\s+y\s+)|(?:\s+and\s+)|(?:\s+et\s+)/i)[0].trim()
    if (!candidate) continue
    const words = candidate.split(/\s+/)
    for (let k = words.length; k >= 1; k--) {
      const sub = words.slice(0, k).join(' ')
      if (k === words.length && k > 1 && STOPWORD_TAIL.test(words[k - 1])) continue
      if (isValidSpanishCity(sub)) {
        const cityTitle = sub.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        return { matched: true, evidence: m[0].trim(), city: cityTitle }
      }
    }
  }

  return { matched: false, evidence: '' }
}


