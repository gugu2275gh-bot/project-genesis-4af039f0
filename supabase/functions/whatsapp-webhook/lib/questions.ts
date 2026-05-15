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

  return hasDateRange || hasSingleDate || hasFullMonthNameDate
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
  if (language === 'es') return 'Necesito la fecha completa, incluyendo el año. ¿Cuál fue la fecha exacta de tu entrada en España?'
  if (language === 'en') return 'I need the full date, including the year. What was the exact date you entered Spain?'
  if (language === 'fr') return 'J’ai besoin de la date complète, avec l’année. Quelle était la date exacte de votre entrée en Espagne ?'
  return 'Preciso da data completa, incluindo o ano. Qual foi a data exata da sua entrada na Espanha?'
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
  if (language === 'es') return 'Perfecto. ¿Hoy ya estás en España?'
  if (language === 'en') return 'Perfect. Are you already in Spain today?'
  if (language === 'fr') return 'Parfait. Êtes-vous déjà en Espagne aujourd’hui ?'
  return 'Perfeito. Hoje você já está na Espanha?'
}

/**
 * Detector multi-idioma para a pergunta de localização ("Você está na Espanha?",
 * "Hoje você já está na Espanha?", "¿Estás en España?", etc.).
 */
export function isQuestionAboutLocationSpain(question: string): boolean {
  const n = normalizeForLanguageChecks(question)
  if (!n) return false
  if (!/(espanha|espana|spain|espagne)/.test(n)) return false
  return /(voce esta na|voce ja esta na|hoje voce|esta na espanha|estas en espana|ya estas en|hoy ya estas|are you (already|currently)? in|are you in spain|etes vous (deja )?en espagne|deja en espagne)/.test(n)
}

/**
 * Detector multi-idioma para B5 ("Em qual cidade você está empadronado?").
 */
export function isQuestionAboutEmpadronamientoCity(question: string): boolean {
  return /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i.test(question || '')
    || /(no reconoc|did not recognize|n[ãa]o reconheci|n ai pas reconnu|reconnu cette ville)/i.test(question || '')
}

export function getEmpadronadoQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿Estás empadronado?'
  if (language === 'en') return 'Got it. Are you registered at the town hall (empadronado)?'
  if (language === 'fr') return 'D’accord. Êtes-vous empadronado ?'
  return 'Perfeito. Você está empadronado?'
}

export function getEmpadronamientoSinceQuestion(language: ChatLanguage): string {
  if (language === 'es') return '¿Desde cuándo estás empadronado?'
  if (language === 'en') return 'Since when have you been registered (empadronado)?'
  if (language === 'fr') return 'Depuis quand êtes-vous empadronado ?'
  return 'Desde quando você está empadronado?'
}

export function getEmpadronamientoCityQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿En qué ciudad estás empadronado?'
  if (language === 'en') return 'Got it. In which city are you registered (empadronado)?'
  if (language === 'fr') return 'D’accord. Dans quelle ville êtes-vous empadronado ?'
  return 'Perfeito. Em qual cidade você está empadronado?'
}

export function getInvalidSpanishCityReprompt(language: ChatLanguage): string {
  if (language === 'es') return 'No reconocí esa ciudad como un municipio español. ¿Puedes confirmar el nombre del municipio de España donde estás empadronado?'
  if (language === 'en') return 'I did not recognize that as a Spanish municipality. Could you confirm the name of the city in Spain where you are registered (empadronado)?'
  if (language === 'fr') return 'Je n’ai pas reconnu cette ville comme une commune espagnole. Pouvez-vous confirmer le nom de la ville en Espagne où vous êtes empadronado ?'
  return 'Não reconheci essa cidade como um município espanhol. Pode confirmar o nome da cidade na Espanha onde você está empadronado?'
}

export function getOutsideSpainAgeQuestion(language: ChatLanguage, includePreamble: boolean = true): string {
  // D2 Bizagi: A1 (confirmar cenário) e A2 (idade) entregues como blocos visuais
  // separados (mesma mensagem, separados por linha em branco). Quando A1 já foi
  // enviado anteriormente (a1_scenario_sent), omitimos o preâmbulo para não repetir.
  if (!includePreamble) {
    if (language === 'es') return '¿Cuál es tu edad?'
    if (language === 'en') return 'How old are you?'
    if (language === 'fr') return 'Quel âge avez-vous ?'
    return 'Qual sua idade?'
  }
  if (language === 'es') return 'Entendido. Entonces seguimos por tu escenario fuera de España.\n\n¿Cuál es tu edad?'
  if (language === 'en') return 'Got it. Then we’ll continue with your situation outside Spain.\n\nHow old are you?'
  if (language === 'fr') return 'D’accord. Nous continuons donc avec votre situation hors d’Espagne.\n\nQuel âge avez-vous ?'
  return 'Entendido. Então seguimos pelo seu cenário fora da Espanha.\n\nQual sua idade?'
}

// D1 Bizagi (Msg 6): após o cliente declarar interesse, listar serviços atendidos
// pela CB e validar antes de pedir a localização.
export function getServicesOfferedMessage(language: ChatLanguage): string {
  if (language === 'es') {
    return 'En CB trabajamos con: residencia (NIE/TIE), nacionalidad española, arraigo (social, laboral, familiar, formación), reagrupación familiar, homologación de títulos y autorización de regreso.\n\n¿Tu caso encaja en alguno de estos?'
  }
  if (language === 'en') {
    return 'At CB we handle: residence (NIE/TIE), Spanish nationality, arraigo (social, labor, family, training), family reunification, diploma homologation and return authorization.\n\nDoes your case fit any of these?'
  }
  if (language === 'fr') {
    return 'Chez CB, nous traitons : résidence (NIE/TIE), nationalité espagnole, arraigo (social, professionnel, familial, formation), regroupement familial, homologation de diplômes et autorisation de retour.\n\nVotre cas correspond-il à l’un d’eux ?'
  }
  return 'Na CB trabalhamos com: residência (NIE/TIE), nacionalidade espanhola, arraigo (social, laboral, familiar, formação), reagrupamento familiar, homologação de diploma e autorização de regresso.\n\nO seu caso se encaixa em algum desses?'
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
    return 'Perfecto. Ya puedo tener una visión inicial de tu caso.|||En CB analizamos cada caso de forma individual, siempre buscando el camino más seguro y dentro de la ley.'
  }
  if (language === 'en') {
    return 'Perfect. I can already get an initial view of your case.|||At CB we analyze each case individually, always looking for the safest path within the law.'
  }
  if (language === 'fr') {
    return 'Parfait. Je peux déjà avoir une première vision de votre cas.|||Chez CB, nous analysons chaque cas individuellement, en cherchant toujours la voie la plus sûre et conforme à la loi.'
  }
  return 'Perfeito. Já consigo ter uma visão inicial do seu caso.|||Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.'
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
  const askedEuropa = !!op.a3_europe_6m || /\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months\b/i.test(assistantTranscript)
  const askedFamiliar = !!op.a4_eu_family || /\bfamiliar (europeu|europeo)|family member.*(eu|spain)\b/i.test(assistantTranscript)
  const askedRemoto = !!op.a5_remote || /\b(trabalha remoto|trabajas? remoto|work remotely)\b/i.test(assistantTranscript)
  const askedFormacao = !!op.a6_higher_ed || /\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree)\b/i.test(assistantTranscript)

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
  const askedEuropaEffective = askedEuropa || skipEuropa

  if (!askedIdade) return getOutsideSpainAgeQuestion(language, !op.a1_scenario_sent)
  if (!askedEuropaEffective) {
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
  if (language === 'es') return 'Gracias. ¿Cuál es el mejor email para enviarte orientaciones y dar seguimiento a tu caso?'
  if (language === 'en') return 'Thank you. What is the best email to send you guidance and follow up on your case?'
  if (language === 'fr') return 'Merci. Quel est le meilleur e-mail pour vous envoyer des orientations et suivre votre dossier ?'
  return 'Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?'
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
 * Estrito: qualquer coisa que não seja claramente um sim ou não vira 'ambiguous'.
 */
export function classifyYesNo(text: string): YesNoClassification {
  const ans = String(text || '').toLowerCase().trim()
  if (!ans) return 'ambiguous'

  // Recusas e respostas evasivas → ambíguo (precisa re-perguntar firme)
  const refusalRe = /(n[ãa]o quero (responder|dizer|falar|informar)|prefiro n[ãa]o|prefer not|don'?t want to (answer|say)|no quiero (responder|decir)|prefiero no|je (ne )?(veux|pr[ée]f[èe]re) pas)/i
  if (refusalRe.test(ans)) return 'ambiguous'

  // Negativa pura tem prioridade
  const isNegative = /^\s*(n[ãa]o|no|nope|nah|non)\b/i.test(ans)
    || /\b(ainda n[ãa]o|todav[ií]a no|not yet|pas encore)\b/i.test(ans)
    || /\b(n[ãa]o (estou|moro|vivo)|no (estoy|vivo)|i'?m not|not in spain|je ne suis pas)\b/i.test(ans)
    || /\b(brasil|brazil|portugal|argentina|m[ée]xico|mexico|colombia|chile|uruguai|uruguay|venezuela|paraguai|paraguay|estados unidos|eua|usa|fora|outro pa[ií]s|en otro pa[ií]s|em outro pa[ií]s|other country)\b/i.test(ans)
  if (isNegative) return 'no'

  const isAffirmative = /^\s*(sim|si|s[ií]|yes|yep|yeah|claro|exato|exactamente|exactly|oui|ouais)\b/i.test(ans)
    || /\b(j[áa] estou|ya estoy|estou (na |em )?espanha|estoy en espa[ñn]a|i'?m in spain|aqui na espanha|aqu[ií] en espa[ñn]a|je suis en espagne)\b/i.test(ans)
    || /\b(estou|estoy|moro|vivo|living|live here)\b/i.test(ans)
    || /\b(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|valencia|sevilla|m[áa]laga|bilbao|alicante|zaragoza|murcia|palma|granada)\b/i.test(ans)
  if (isAffirmative) return 'yes'

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
