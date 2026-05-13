// @ts-nocheck
// Wave 3b step 6: response overrides (skip name, reask email, advance flow, loop)
import { type ChatLanguage } from './language.ts'
import { extractLastQuestion, extractTextBeforeLastQuestion, areQuestionsEquivalent } from './text-utils.ts'
import {
  isQuestionAboutFullName,
  isQuestionAboutEmail,
  isQuestionAboutSpainEntryDate,
  isQuestionAboutInterest,
  isQuestionAboutLocationSpain,
  isQuestionAboutEmpadronamientoCity,
  isNeverBeenToSpainAnswer,
  isPotentialEntryDateAnswer,
  isPotentialInterestAnswer,
  isStructuredQuestionAnswer,
  looksLikeIncompleteEntryDateWithoutYear,
  hasValidEmail,
  getEmailQuestion,
  getEmailReaskQuestion,
  getEntryDateNeedsYearQuestion,
  getEntryDateFutureConfirmQuestion,
  getOutsideSpainAgeQuestion,
  getEmpadronadoQuestion,
  getEmpadronamientoCityQuestion,
  getEmpadronamientoSinceQuestion,
  getInvalidSpanishCityReprompt,
  getLocationQuestion,
  getFullNameReaskQuestion,
  countAlphaWords,
  parseEntryDateFromText,
  getOutsideSpainNextQuestion,
  getServicesOfferedMessage,
  isServicesOfferedMessage,
  buildPreHandoffPayload,
  preHandoffSummarySent,
} from './questions.ts'
import { isValidSpanishCity, extractCityFromAnswer, normalizeCity } from './spanish-cities.ts'

// Sentinel invisível usado para "travar" a resposta após uma validação determinística
// (ex.: reprompt de cidade espanhola). Outras camadas (lock, anti-loop, F4, dedup)
// devem retornar a resposta intacta quando esse marcador estiver presente. Removido
// antes do envio via stripLockedSentinel().
export const LOCKED_SENTINEL = '\u200B[LOCKED]\u200B'
export const isLocked = (s: string): boolean => typeof s === 'string' && s.includes(LOCKED_SENTINEL)
export const stripLockedSentinel = (s: string): string => (s || '').replaceAll(LOCKED_SENTINEL, '').trim()
const lock = (s: string): string => `${LOCKED_SENTINEL}${s}`

/**
 * Calcula um patch determinístico do funil baseado em (previousQuestion, currentMessage).
 * Roda ANTES da chamada à IA — garante que interesse/localização/cidade já confirmados
 * sejam refletidos no estado mesmo que a extração best-effort tenha falhado.
 */
export function computeDeterministicFunnelPatch(
  previousAssistantMessage: string,
  currentMessage: string,
): {
  location_known?: 'spain' | 'outside'
  interest_confirmed?: string
  empadronado_city?: string
  empadronado_confirmed?: boolean
  entry_date_confirmed?: string
} {
  const prevQ = extractLastQuestion(previousAssistantMessage || '')
  const msg = String(currentMessage || '').trim()
  const patch: Record<string, unknown> = {}
  if (!msg) return patch as any

  const YES = /^\s*(sim|si|s[ií]|yes|yeah|yep|claro|estou|to[uy]|aham|aha|positivo|afirmativo|oui|of course|sure|ok|okay)\b/i
  const NO = /^\s*(n[ãa]o|no|nope|nay|negativo|nunca|jamais|non)\b/i

  // Localização
  if (isQuestionAboutLocationSpain(prevQ)) {
    if (YES.test(msg)) patch.location_known = 'spain'
    else if (NO.test(msg)) patch.location_known = 'outside'
  }
  // Reafirmação clara: cliente diz explicitamente que NÃO está na Espanha em qualquer turno
  // (ex.: "Eu não estou na Espanha", "no estoy en España", "I'm not in Spain")
  if (/\b(n[ãa]o (estou|moro|vivo) na espanha|no estoy en espa[ñn]a|i'?m not in spain|je ne suis pas en espagne)\b/i.test(msg)) {
    patch.location_known = 'outside'
  }
  if (/\b(estou na espanha|j[áa] estou na espanha|estoy en espa[ñn]a|i'?m in spain|je suis en espagne)\b/i.test(msg)) {
    patch.location_known = 'spain'
  }

  // Interesse — capta resposta válida MESMO se ainda não havia sido perguntado
  if (isPotentialInterestAnswer(msg)) {
    patch.interest_confirmed = msg
  }
  if (isQuestionAboutInterest(prevQ) && msg.length >= 3) {
    patch.interest_confirmed = msg
  }

  // Data de entrada
  if (isQuestionAboutSpainEntryDate(prevQ)) {
    const parsed = parseEntryDateFromText(msg)
    if (parsed && !parsed.isFuture) patch.entry_date_confirmed = parsed.iso
  }

  // Empadronado yes/no
  if (/\bempadron/i.test(prevQ) && !isQuestionAboutEmpadronamientoCity(prevQ) && !/(desde quando|desde cu[áa]ndo|since when|depuis quand)/i.test(prevQ)) {
    if (YES.test(msg)) patch.empadronado_confirmed = true
    else if (NO.test(msg)) patch.empadronado_confirmed = false
  }

  // Cidade de empadronamento — só grava se for cidade espanhola válida
  if (isQuestionAboutEmpadronamientoCity(prevQ) && isValidSpanishCity(msg)) {
    const extracted = extractCityFromAnswer(msg) || msg
    patch.empadronado_city = normalizeCity(extracted)
  }

  if (Object.keys(patch).length > 0) {
    try {
      console.log('[DETERMINISTIC_PATCH]', JSON.stringify({
        prevQ: prevQ.slice(0, 120),
        msg: msg.slice(0, 120),
        patch,
      }))
    } catch { /* noop */ }
  }
  return patch as any
}


/**
 * Wave 6: Trava determinística pós-IA.
 * Se a resposta da IA contém pergunta sobre dado JÁ CONFIRMADO (nome/email/interesse),
 * substitui por pergunta da próxima etapa real PENDENTE — sem nova chamada ao modelo.
 * Garante que mesmo após divergência do cliente, dados confirmados nunca são re-perguntados.
 */
export function lockConfirmedFieldsInResponse(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    nameKnown: boolean
    emailKnown: boolean
    interestKnown: boolean
    locationKnown: boolean
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  // Wave 7: se cadastro está COMPLETO, o lock é no-op — KB/tira-dúvidas livre.
  if (flags.nameKnown && flags.emailKnown && flags.interestKnown && flags.locationKnown) {
    return aiResponse
  }
  const q = extractLastQuestion(aiResponse)
  if (!q) return aiResponse
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()

  const nextPending = (): string => {
    if (!flags.nameKnown) return '' // não devemos remover; deixa fluir
    if (!flags.emailKnown) return getEmailQuestion(language)
    if (!flags.interestKnown) {
      if (language === 'es') return 'Cuéntame con calma: ¿qué buscas hoy? Puede ser nacionalidad, residencia, estudios, arraigo o algún documento específico.'
      if (language === 'en') return 'Tell me what you are looking for today: nationality, residence, studies, arraigo or a specific document.'
      if (language === 'fr') return 'Dites-moi ce que vous cherchez aujourd’hui: nationalité, résidence, études, arraigo ou un document spécifique.'
      return 'Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico.'
    }
    if (!flags.locationKnown) return getLocationQuestion(language)
    return ''
  }

  const replaceWithNext = (): string => {
    const next = nextPending()
    if (!next) return preamble || aiResponse
    return preamble ? `${preamble}\n${next}` : next
  }

  if (flags.nameKnown && isQuestionAboutFullName(q)) {
    return replaceWithNext()
  }
  if (flags.emailKnown && isQuestionAboutEmail(q)) {
    return replaceWithNext()
  }
  if (flags.interestKnown && isQuestionAboutInterest(q)) {
    return replaceWithNext()
  }
  return aiResponse
}

/**
 * Se o bot acabou de perguntar o NOME COMPLETO e o cliente respondeu com apenas
 * 1 palavra alfabética (ex.: só primeiro nome) e NÃO é email/data, força a IA
 * a re-perguntar o nome completo de forma explícita, sem "fingir aceitar" e
 * avançar para a próxima etapa. Garante que o nome será fornecido com 2+ palavras
 * antes de seguir.
 */
export function forceReaskFullNameIfSingleWord(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
  nameAlreadyKnown: boolean,
): string {
  if (nameAlreadyKnown) return aiResponse
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  if (!isQuestionAboutFullName(previousQuestion)) return aiResponse
  const raw = String(currentMessage || '').trim()
  if (!raw) return aiResponse
  if (hasValidEmail(raw)) return aiResponse // email-as-name é tratado em outro override
  if (isPotentialEntryDateAnswer(raw)) return aiResponse
  const alpha = countAlphaWords(raw)
  if (alpha >= 2) return aiResponse // já é nome completo válido
  if (alpha < 1) return aiResponse // sem letras (ex.: só números) — outros guards lidam
  // Substitui a resposta da IA por reask explícita do nome completo.
  return getFullNameReaskQuestion(language)
}

export function forceSkipFullNameIfAlreadyKnown(
  aiResponse: string,
  language: ChatLanguage,
  nameAlreadyKnown: boolean,
  emailMissing: boolean,
): string {
  if (!nameAlreadyKnown || !aiResponse) return aiResponse
  const nextQuestion = extractLastQuestion(aiResponse)
  if (!nextQuestion || !isQuestionAboutFullName(nextQuestion)) return aiResponse
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
  const replacement = emailMissing ? getEmailQuestion(language) : ''
  // Sem replacement: nome e email já conhecidos. NÃO devolva aiResponse (manteria a pergunta).
  // Devolva o preamble; se vazio, devolva string vazia para o caller disparar retry.
  if (!replacement) return preamble
  return preamble ? `${preamble}\n${replacement}` : replacement
}

export function forceReaskEmailIfMissing(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
  emailAlreadyOnFile: boolean,
): string {
  if (emailAlreadyOnFile) return aiResponse
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  if (!isQuestionAboutEmail(previousQuestion)) return aiResponse
  if (hasValidEmail(currentMessage)) return aiResponse
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
  const reask = getEmailReaskQuestion(language)
  return preamble ? `${preamble}\n${reask}` : reask
}

export function forceAdvanceFromEntryDateQuestion(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
  outsideSpainNextQuestion?: string,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()

  if (isQuestionAboutSpainEntryDate(previousQuestion) && isNeverBeenToSpainAnswer(currentMessage)) {
    const replacement = outsideSpainNextQuestion || getOutsideSpainAgeQuestion(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  if (isQuestionAboutSpainEntryDate(previousQuestion) && looksLikeIncompleteEntryDateWithoutYear(currentMessage)) {
    const replacement = getEntryDateNeedsYearQuestion(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  if (!isQuestionAboutSpainEntryDate(previousQuestion) || !isPotentialEntryDateAnswer(currentMessage)) {
    return aiResponse
  }

  // Validação determinística: se a data informada é parseável, decide aqui (não confiar no LLM
  // para distinguir passado/futuro — Gemini frequentemente erra por causa do cutoff de treinamento).
  const parsed = parseEntryDateFromText(currentMessage)
  if (parsed) {
    if (parsed.isFuture) {
      const replacement = getEntryDateFutureConfirmQuestion(language, parsed.iso)
      return preamble ? `${preamble}\n${replacement}` : replacement
    }
    // Data no passado/hoje → SEMPRE avança para empadronamento, ignorando qualquer pedido de confirmação que a IA tenha gerado.
    const replacement = getEmpadronadoQuestion(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  if (nextQuestion && areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    const replacement = getEmpadronadoQuestion(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  return aiResponse
}

export function forceAdvanceFromInterestQuestion(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!isQuestionAboutInterest(previousQuestion) || !isPotentialInterestAnswer(currentMessage)) {
    return aiResponse
  }

  if (nextQuestion && areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
    const replacement = getLocationQuestion(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  return aiResponse
}

/**
 * Encadeia o bloco de empadronamento (uma pergunta por vez):
 *   B3 (yes/no) → B4 (desde quando) → B5 (cidade) → Pré-Handoff
 * - Se cliente já incluiu data na resposta de B3, pula B4 → vai a B5.
 * - Se previousQuestion já é B5 (cidade), libera o LLM (não força nada).
 * - Se cliente disse "não" em B3, libera o LLM (Pré-Handoff).
 */
const YES_ANSWER_RE = /^\s*(sim|si|s[ií]|yes|yeah|yep|claro|estou|to[uy]|aham|aha|positivo|afirmativo|oui|of course|sure)\b/i
const NO_ANSWER_RE = /^\s*(n[ãa]o|no|nope|nay|negativo|nunca|jamais|non)\b/i

function isEmpadronadoYesNoQuestion(q: string): boolean {
  if (!q) return false
  if (isEmpadronamientoCityQuestion(q)) return false
  if (isEmpadronamientoSinceQuestion(q)) return false
  return /\bempadron/i.test(q)
}

function isEmpadronamientoCityQuestion(q: string): boolean {
  return /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i.test(q || '')
}

function isEmpadronamientoSinceQuestion(q: string): boolean {
  return /(desde quando|desde cu[áa]ndo|since when|depuis quand)/i.test(q || '')
}

export function forceAdvanceFromEmpadronadoQuestion(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const msg = (currentMessage || '').trim()
  if (!msg) return aiResponse

  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
  const wrap = (q: string) => (preamble ? `${preamble}\n${q}` : q)

  // B5 (cidade) já foi feita → validar se é cidade espanhola.
  // Se inválida, repergunta E TRAVA a resposta com sentinel para que nada mais sobrescreva.
  if (isEmpadronamientoCityQuestion(previousQuestion)) {
    if (!isValidSpanishCity(msg)) {
      console.log('[CITY_VALIDATION] invalid Spanish city in answer, reprompting:', msg.slice(0, 60))
      return lock(wrap(getInvalidSpanishCityReprompt(language)))
    }
    return aiResponse
  }

  // Caso o previousQuestion já seja a reprompt de cidade inválida → continua validando.
  if (/no reconoc|did not recognize|n[ãa]o reconheci|n ai pas reconnu|reconnu cette ville/i.test(previousQuestion || '')) {
    if (!isValidSpanishCity(msg)) {
      return lock(wrap(getInvalidSpanishCityReprompt(language)))
    }
    return aiResponse
  }

  // B4 (desde quando) → próxima é B5 (cidade).
  if (isEmpadronamientoSinceQuestion(previousQuestion)) {
    const nextQ = extractLastQuestion(aiResponse)
    if (isEmpadronamientoCityQuestion(nextQ)) return aiResponse
    return wrap(getEmpadronamientoCityQuestion(language))
  }

  // B3 (yes/no).
  if (!isEmpadronadoYesNoQuestion(previousQuestion)) return aiResponse

  // NÃO → libera LLM (Pré-Handoff).
  if (NO_ANSWER_RE.test(msg)) return aiResponse

  // SIM com data embutida ("sim, desde fevereiro de 2024") → pula B4, vai a B5.
  const hasDate = parseEntryDateFromText(msg) !== null
    || /\b(20\d{2}|19\d{2})\b/.test(msg)
    || /\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|mayo|junio|julio|septiembre|octubre|noviembre|diciembre|january|february|march|april|june|july|august|september|october|november|december)\b/i.test(msg)
  if (hasDate) {
    const nextQ = extractLastQuestion(aiResponse)
    if (isEmpadronamientoCityQuestion(nextQ)) return aiResponse
    return wrap(getEmpadronamientoCityQuestion(language))
  }

  // SIM puro (ou texto curto não-negativo) → pergunta B4 (desde quando).
  if (YES_ANSWER_RE.test(msg) || msg.length < 60) {
    const nextQ = extractLastQuestion(aiResponse)
    if (isEmpadronamientoSinceQuestion(nextQ)) return aiResponse
    return wrap(getEmpadronamientoSinceQuestion(language))
  }

  return aiResponse
}

function questionBlockHash(assistantText: string): string {
  if (!assistantText) return ''
  const lastQ = extractLastQuestion(assistantText) || ''
  const preamble = (extractTextBeforeLastQuestion(assistantText) || '').trim()
  const block = `${preamble} ${lastQ}`.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  return block.slice(0, 80)
}

export function isLikelyQuestionLoop(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  aiResponse: string,
): boolean {
  if (isLocked(aiResponse)) return false
  const lastAssistantMessage = [...conversationHistory].reverse().find((msg) => msg.role === 'assistant')?.content || ''
  const previousQuestion = extractLastQuestion(lastAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!previousQuestion || !nextQuestion) return false

  const isValidAnswer = isStructuredQuestionAnswer(currentMessage)
    || (isQuestionAboutInterest(previousQuestion) && isPotentialInterestAnswer(currentMessage))
    || (isQuestionAboutSpainEntryDate(previousQuestion) && isPotentialEntryDateAnswer(currentMessage))

  if (!isValidAnswer) return false

  // Wave 4: comparar bloco completo (preamble+pergunta), não só pergunta literal
  if (areQuestionsEquivalent(previousQuestion, nextQuestion)) return true
  const prevHash = questionBlockHash(lastAssistantMessage)
  const nextHash = questionBlockHash(aiResponse)
  return !!prevHash && prevHash === nextHash
}

/**
 * Sanitiza a pergunta de localização: se a IA gerar a versão antiga disjuntiva
 * ("ou ainda está em outro país"), reescreve para a forma yes/no clara.
 * Também remove perguntas redundantes "em qual país você está?" quando a
 * localização ainda não foi definida — o funil seguirá direto para o bloco
 * "fora da Espanha" assim que o cliente disser "não".
 */
export function sanitizeLocationQuestion(
  aiResponse: string,
  language: ChatLanguage,
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  let out = aiResponse
  // Substitui a forma disjuntiva pela yes/no
  const disjunctivePatterns: Array<[RegExp, string]> = [
    [/hoje voc[êe] j[áa] est[áa] na espanha\s+ou\s+ainda\s+est[áa]\s+em\s+outro\s+pa[íi]s\??/gi, getLocationQuestion(language)],
    [/hoy ya est[áa]s en espa[ñn]a\s+o\s+todav[ií]a\s+est[áa]s\s+en\s+otro\s+pa[íi]s\??/gi, getLocationQuestion(language)],
    [/are you already in spain today,?\s+or\s+are\s+you\s+still\s+in\s+another\s+country\??/gi, getLocationQuestion(language)],
    [/[êe]tes-vous d[ée]j[àa] en espagne aujourd[’']hui\s+ou\s+[êe]tes-vous\s+encore\s+dans\s+un\s+autre\s+pays\s*\??/gi, getLocationQuestion(language)],
  ]
  for (const [re, replacement] of disjunctivePatterns) {
    out = out.replace(re, replacement)
  }
  return out
}

/**
 * Trava determinística de bloco por localização.
 *
 * Caso real: cliente diz que está FORA da Espanha (location_known='outside'),
 * a IA mesmo assim pergunta "Qual a data exata da sua entrada na Espanha?" ou
 * "Está empadronado?" (perguntas exclusivas do bloco B — dentro da Espanha).
 * Aqui detectamos isso e substituímos pela próxima pergunta correta do bloco
 * "fora da Espanha" (ou Pré-Handoff se já completo).
 *
 * Caso simétrico: location_known='spain' e IA pergunta "Qual sua idade?",
 * "Esteve na Europa nos últimos 6 meses?", "Trabalha remoto?", "Formação superior?"
 * (perguntas exclusivas do bloco A — fora da Espanha) → substituímos pela próxima
 * pergunta correta do bloco "dentro da Espanha".
 */
export function forceCorrectBlockForLocation(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    locationKnown: 'spain' | 'outside' | null | undefined
    entryDateConfirmed: string | null | undefined
    empadronadoConfirmed: boolean | null | undefined
    empadronadoCity: string | null | undefined
    assistantTranscript: string
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  if (!flags.locationKnown) return aiResponse

  const q = extractLastQuestion(aiResponse)
  if (!q) return aiResponse
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
  const wrap = (replacement: string) => (preamble ? `${preamble}\n${replacement}` : replacement)

  const isOutsideOnlyQuestion =
    isQuestionAboutSpainEntryDate(q)
    || /\bempadron/i.test(q)
    || /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i.test(q)

  const isSpainOnlyQuestion =
    /\b(qual sua idade|cu[áa]ntos a[ñn]os|how old|quel [âa]ge)\b/i.test(q)
    || /\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months\b/i.test(q)
    || /\b(trabalha remoto|trabajas? remoto|work remotely|travaillez[- ]vous [àa] distance)\b/i.test(q)
    || /\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree|formation sup[ée]rieure)\b/i.test(q)
    || /\bfamiliar (europeu|europeo)|family member.*(eu|spain)|membre.*famille.*(europ|espagn)/i.test(q)

  if (flags.locationKnown === 'outside' && isOutsideOnlyQuestion) {
    console.log('[BLOCK_LOCK] outside cliente, IA fez pergunta de bloco-Espanha:', q.slice(0, 80))
    const next = getOutsideSpainNextQuestion(language, flags.assistantTranscript || '', {
      entryDateConfirmed: flags.entryDateConfirmed || null,
      locationKnown: flags.locationKnown,
    })
    return lock(wrap(next))
  }

  if (flags.locationKnown === 'spain' && isSpainOnlyQuestion) {
    console.log('[BLOCK_LOCK] cliente na Espanha, IA fez pergunta de bloco-fora:', q.slice(0, 80))
    // Próxima pergunta correta do bloco B
    let next: string
    if (!flags.entryDateConfirmed) {
      if (language === 'es') next = 'Perfecto. Ahora necesito entender tu situación aquí. ¿Cuál fue la fecha exacta de tu entrada en España?'
      else if (language === 'en') next = 'Got it. Now I need to understand your situation here. What was the exact date you entered Spain?'
      else if (language === 'fr') next = 'D’accord. Maintenant j’ai besoin de comprendre votre situation ici. Quelle est la date exacte de votre entrée en Espagne ?'
      else next = 'Perfeito. Agora preciso entender sua situação aqui. Qual foi a data exata da sua entrada na Espanha?'
    } else if (flags.empadronadoConfirmed === null || flags.empadronadoConfirmed === undefined) {
      next = getEmpadronadoQuestion(language)
    } else if (flags.empadronadoConfirmed && !flags.empadronadoCity) {
      next = getEmpadronamientoCityQuestion(language)
    } else {
      // Bloco completo → Pré-Handoff
      if (language === 'es') next = 'Perfecto. Ya puedo tener una visión inicial de tu caso.\nEn CB analizamos cada caso de forma individual, siempre buscando el camino más seguro y dentro de la ley.'
      else if (language === 'en') next = 'Perfect. I can already get an initial view of your case.\nAt CB, we analyze each case individually, always looking for the safest path within the law.'
      else if (language === 'fr') next = 'Parfait. Je peux déjà avoir une première vision de votre cas.\nChez CB, nous analysons chaque cas individuellement.'
      else next = 'Perfeito. Já consigo ter uma visão inicial do seu caso.\nNa CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei.'
    }
    return lock(wrap(next))
  }

  return aiResponse
}

