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
  getFullNameRequiredReaskQuestion,
  getEmailRequiredReaskQuestion,
  getLocationSpainRequiredReaskQuestion,
  classifyYesNo,
  countAlphaWords,
  parseEntryDateFromText,
  getOutsideSpainNextQuestion,
  getServicesOfferedMessage,
  isServicesOfferedMessage,
  buildPreHandoffPayload,
  preHandoffSummarySent,
  getPostHandoffWaitSuffix,
} from './questions.ts'
import { isLikelyFullNameAnswer, isNameRefusal, isEmailRefusal } from './name-extraction.ts'
import { isValidSpanishCity, extractCityFromAnswer, normalizeCity } from './spanish-cities.ts'

// Sentinel invisível usado para "travar" a resposta após uma validação determinística
// (ex.: reprompt de cidade espanhola). Outras camadas (lock, anti-loop, F4, dedup)
// devem retornar a resposta intacta quando esse marcador estiver presente. Removido
// antes do envio via stripLockedSentinel().
export const LOCKED_SENTINEL = '\u200B[LOCKED]\u200B'
export const isLocked = (s: string): boolean => typeof s === 'string' && s.includes(LOCKED_SENTINEL)
export const stripLockedSentinel = (s: string): string => (s || '').replaceAll(LOCKED_SENTINEL, '').trim()
export const lock = (s: string): string => `${LOCKED_SENTINEL}${s}`

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

// ============================================================================
// Ramo A (fora da Espanha) — extração determinística por pergunta-âncora
// ============================================================================
const A2_AGE_RE = /\b(qual sua idade|cu[áa]ntos a[ñn]os|how old|quel [âa]ge)\b/i
const A3_EUROPA_RE = /\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months|europe au cours des 6 derniers mois\b/i
const A4_FAMILIAR_RE = /\bfamiliar (europeu|europeo)|family member.*(eu|spain|european)|membre.*famille.*(europ|espagn)/i
const A5_REMOTO_RE = /\b(trabalha remoto|trabajas? remoto|trabajas? de forma remota|work remotely|travaillez[- ]vous [àa] distance)\b/i
const A6_FORMACAO_RE = /\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree|formation sup[ée]rieure)\b/i

const YES_RE = /^\s*(sim|si|s[ií]|yes|yeah|yep|claro|positivo|afirmativo|tenho|tengo|i (do|have)|oui|of course|sure)\b/i
const NO_RE = /^\s*(n[ãa]o|no|nope|nay|negativo|nunca|jamais|non|i don'?t|no tengo|no he)\b/i

export function extractOutsideProgressPatch(
  previousAssistantMessage: string,
  currentMessage: string,
): {
  a2_age?: string
  a3_europe_6m?: 'yes' | 'no'
  a4_eu_family?: 'yes' | 'no'
  a5_remote?: 'yes' | 'no'
  a6_higher_ed?: 'yes' | 'no'
} {
  const prevQ = extractLastQuestion(previousAssistantMessage || '')
  const msg = String(currentMessage || '').trim()
  const out: Record<string, unknown> = {}
  if (!prevQ || !msg) return out as any

  // A2 idade — extrai número 12-99
  if (A2_AGE_RE.test(prevQ)) {
    const m = msg.match(/\b(1[2-9]|[2-9]\d)\b/)
    if (m) out.a2_age = m[1]
  }
  const yn = (): 'yes' | 'no' | null => (YES_RE.test(msg) ? 'yes' : NO_RE.test(msg) ? 'no' : null)
  if (A3_EUROPA_RE.test(prevQ)) { const v = yn(); if (v) out.a3_europe_6m = v }
  if (A4_FAMILIAR_RE.test(prevQ)) { const v = yn(); if (v) out.a4_eu_family = v }
  if (A5_REMOTO_RE.test(prevQ)) { const v = yn(); if (v) out.a5_remote = v }
  if (A6_FORMACAO_RE.test(prevQ)) { const v = yn(); if (v) out.a6_higher_ed = v }

  if (Object.keys(out).length > 0) {
    try { console.log('[OUTSIDE_PROGRESS_PATCH]', JSON.stringify({ prevQ: prevQ.slice(0, 80), msg: msg.slice(0, 60), out })) } catch { /* noop */ }
  }
  return out as any
}

/**
 * Extrai a resposta de B4 ("desde quando empadronado") quando a previousQuestion
 * foi a pergunta de "desde quando". Retorna ISO YYYY-MM-DD se parseável,
 * caso contrário retorna o texto cru (limitado) para preservar o dado.
 * Persistido em outside_spain_progress.b4_empadronado_since.
 */
export function extractEmpadronadoSincePatch(
  previousAssistantMessage: string,
  currentMessage: string,
): { b4_empadronado_since?: string } {
  const prevQ = extractLastQuestion(previousAssistantMessage || '')
  const msg = String(currentMessage || '').trim()
  if (!prevQ || !msg) return {}
  const isSince = /(desde quando|desde cu[áa]ndo|since when|depuis quand)/i.test(prevQ)
  if (!isSince) return {}
  const parsed = parseEntryDateFromText(msg)
  if (parsed && !parsed.isFuture) return { b4_empadronado_since: parsed.iso }
  // fallback: salva o texto cru limitado a 60 chars (ex.: "fevereiro de 2024")
  if (msg.length <= 60) return { b4_empadronado_since: msg }
  return {}
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

  // Reforço: varrer TODAS as frases-pergunta (não apenas a última).
  // Se qualquer uma re-pergunta um campo já confirmado, removê-la (e o
  // que vier depois) e anexar a próxima pergunta pendente.
  try {
    const sentences = aiResponse.split(/(?<=[.?!])\s+/)
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i]
      if (!/\?\s*$/.test(s)) continue
      const hitsConfirmed =
        (flags.nameKnown && isQuestionAboutFullName(s)) ||
        (flags.emailKnown && isQuestionAboutEmail(s)) ||
        (flags.interestKnown && isQuestionAboutInterest(s))
      if (!hitsConfirmed) continue
      const keep = sentences.slice(0, i).join(' ').trim()
      const next = nextPending()
      if (!next) return keep || aiResponse
      return keep ? `${keep}\n${next}` : next
    }
  } catch (_) { /* defensive */ }

  return aiResponse
}

/**
 * Hard dedup pós-overrides: descarta parágrafos da resposta que já foram
 * enviados (literal ou quase-literal) nas últimas N mensagens do assistente,
 * ou que repetem o catálogo de serviços (Msg6) / a pergunta de interesse
 * quando essas etapas já foram cumpridas. Se sobrar só um ack curto
 * ("Certo.", "Ok.", "Vale."), anexa a próxima pergunta pendente do funil.
 */
export function stripAlreadySentCanonicalBlocks(
  aiResponse: string,
  assistantTranscript: string,
  language: ChatLanguage,
  flags: {
    nameKnown: boolean
    emailKnown: boolean
    interestKnown: boolean
    locationKnown: boolean
  },
  recentAssistantMessages: string[] = [],
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse

  const norm = (s: string) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const jaccard = (a: string, b: string): number => {
    const aw = new Set(a.split(' ').filter((w) => w.length > 3))
    const bw = new Set(b.split(' ').filter((w) => w.length > 3))
    if (!aw.size || !bw.size) return 0
    let inter = 0
    for (const w of aw) if (bw.has(w)) inter++
    const union = aw.size + bw.size - inter
    return union > 0 ? inter / union : 0
  }

  const transcript = assistantTranscript || ''
  const servicesAlreadySent = isServicesOfferedMessage(transcript)
  const recentNorm = (recentAssistantMessages || []).slice(-3).map(norm)

  // Quebra por linhas em branco E pelo delimitador "|||" preservando ordem.
  const chunks = aiResponse
    .split('|||')
    .flatMap((seg) => seg.split(/\n\s*\n/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const kept: string[] = []
  for (const p of chunks) {
    const pNorm = norm(p)
    if (!pNorm) continue

    if (servicesAlreadySent && isServicesOfferedMessage(p)) {
      console.log('[DEDUP] dropping repeated services catalog block')
      continue
    }
    if (flags.interestKnown && isQuestionAboutInterest(p)) {
      console.log('[DEDUP] dropping interest question (already confirmed)')
      continue
    }
    let isEcho = false
    for (const prev of recentNorm) {
      if (!prev) continue
      if (jaccard(pNorm, prev) >= 0.8) { isEcho = true; break }
    }
    if (isEcho) {
      console.log('[DEDUP] dropping near-literal echo paragraph')
      continue
    }
    kept.push(p)
  }

  if (kept.length === 0) return aiResponse

  let result = kept.join('\n\n')

  const ackOnly = /^\s*(certo|ok|okay|vale|claro|perfeito|entendido|entendi|d ?accord|d ?acuerdo|got it|sure|right)[\s.!,;:-]*$/i
  if (kept.every((k) => ackOnly.test(k))) {
    let next = ''
    if (!flags.nameKnown) next = ''
    else if (!flags.emailKnown) next = getEmailQuestion(language)
    else if (!flags.interestKnown) next = ''
    else if (!flags.locationKnown) next = getLocationQuestion(language)
    if (next) {
      result = `${result}\n\n${next}`
      console.log('[DEDUP] appended next pending question after ack-only remainder')
    }
  }

  return result
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
  // Recusa explícita ("não tenho nome", "no tengo", "I don't have a name", ...) → reask FIRME.
  if (isNameRefusal(raw)) return lock(getFullNameRequiredReaskQuestion(language))
  // Frase / verbo 1ª pessoa / qualquer coisa que não pareça nome próprio → reask FIRME.
  if (!isLikelyFullNameAnswer(raw)) {
    const alpha = countAlphaWords(raw)
    if (alpha < 1) return aiResponse // sem letras — outros guards lidam
    if (alpha >= 2) return lock(getFullNameRequiredReaskQuestion(language))
    // 1 palavra alfabética: reask padrão (mais leve)
    return lock(getFullNameReaskQuestion(language))
  }
  return aiResponse
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
  // Recusa explícita → reask FIRME, mantendo eventual preâmbulo da IA.
  if (isEmailRefusal(currentMessage)) {
    const firm = getEmailRequiredReaskQuestion(language)
    return lock(preamble ? `${preamble}\n${firm}` : firm)
  }
  const reask = getEmailReaskQuestion(language)
  return preamble ? `${preamble}\n${reask}` : reask
}

/**
 * Se o bot acabou de perguntar "Você está na Espanha?" e a resposta do cliente
 * NÃO é claramente sim/não, força um reask determinístico no formato
 * "Preciso saber se está na Espanha (Sim ou Não)". Não avança o fluxo até
 * receber resposta válida.
 */
export function forceReaskLocationSpainIfAmbiguous(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  if (!isQuestionAboutLocationSpain(previousQuestion)) return aiResponse
  const raw = String(currentMessage || '').trim()
  if (!raw) return aiResponse
  const verdict = classifyYesNo(raw)
  if (verdict === 'ambiguous') {
    return lock(getLocationSpainRequiredReaskQuestion(language))
  }
  return aiResponse
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
  assistantTranscript?: string,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!isQuestionAboutInterest(previousQuestion) || !isPotentialInterestAnswer(currentMessage)) {
    return aiResponse
  }

  if (nextQuestion && areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
    // D1 Bizagi: antes de pedir localização, listar serviços atendidos (Msg 6).
    const transcript = assistantTranscript || ''
    const servicesAlreadySent = isServicesOfferedMessage(transcript)
      || /(arraigo).{0,200}(reagrupa|reagrupacion|reunification|regroupement).{0,200}(homologa|homologation)/is.test(transcript)
    const replacement = servicesAlreadySent
      ? getLocationQuestion(language)
      : getServicesOfferedMessage(language)
    return preamble ? `${preamble}\n${replacement}` : replacement
  }

  return aiResponse
}

/**
 * BPMN v2 — Msg5 + Msg6 na MESMA rodada.
 * Quando a IA emite a pergunta de interesse (Msg5) sem ter anexado o catálogo (Msg6),
 * e Msg6 ainda não consta no transcript, anexa Msg6 como segunda bolha (separada por "|||").
 * Idempotente: não duplica se Msg6 já estiver presente na própria resposta ou no histórico.
 */
export function ensureServicesAttachedToInterest(
  aiResponse: string,
  language: ChatLanguage,
  assistantTranscript: string,
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  // Msg6 já está incluída na própria resposta? (texto literal ou já com âncoras)
  if (isServicesOfferedMessage(aiResponse)) return aiResponse
  // A resposta atual está pedindo o interesse?
  const lastQ = extractLastQuestion(aiResponse)
  if (!isQuestionAboutInterest(lastQ)) return aiResponse
  // Já enviada antes no histórico? (não reenviar)
  if (isServicesOfferedMessage(assistantTranscript || '')) return aiResponse
  const msg6 = getServicesOfferedMessage(language)
  console.log('[BPMN_V2] attaching Msg6 (services catalog) to Msg5 in same round')
  return `${aiResponse}|||${msg6}`
}

/**
 * D1 Bizagi (Msg 6): após `interest_confirmed`, garante que o bot envie a
 * mensagem de "serviços atendidos" antes de avançar para a pergunta de
 * localização. Se a IA gerou outra pergunta (ex.: pulou direto para localização
 * ou começou outro assunto), substituímos pela Msg 6. Idempotente via transcript.
 */
export function forceServicesMessageAfterInterest(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    interestKnown: boolean
    locationKnown: boolean
    assistantTranscript: string
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  if (!flags.interestKnown) return aiResponse
  if (flags.locationKnown) return aiResponse // já passou da etapa
  const transcript = flags.assistantTranscript || ''
  const alreadySent = isServicesOfferedMessage(transcript)
  if (alreadySent) {
    // Catálogo já foi enviado. Se a IA tentou reenviar, removemos e
    // forçamos avanço para a pergunta de localização.
    if (isServicesOfferedMessage(aiResponse)) {
      const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
      const replacement = getLocationQuestion(language)
      console.log('[D1_SERVICES] catalog already sent — replacing repeat with location question')
      return preamble ? `${preamble}\n${replacement}` : replacement
    }
    return aiResponse
  }
  // Se a IA já gerou justamente a Msg 6, mantém.
  if (isServicesOfferedMessage(aiResponse)) return aiResponse
  // Substitui pela Msg 6 (mantém preâmbulo curto da IA, se houver).
  const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
  const replacement = getServicesOfferedMessage(language)
  console.log('[D1_SERVICES] injecting Msg 6 (services offered) before location')
  return preamble ? `${preamble}\n${replacement}` : replacement
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

  // B5 (cidade) já foi feita → validar se é cidade espanhola.
  if (isEmpadronamientoCityQuestion(previousQuestion)) {
    if (!isValidSpanishCity(msg)) {
      console.log('[CITY_VALIDATION] invalid Spanish city in answer, reprompting:', msg.slice(0, 60))
      return lock(getInvalidSpanishCityReprompt(language))
    }
    return aiResponse
  }

  // Caso o previousQuestion já seja a reprompt de cidade inválida → continua validando.
  if (/no reconoc|did not recognize|n[ãa]o reconheci|n ai pas reconnu|reconnu cette ville/i.test(previousQuestion || '')) {
    if (!isValidSpanishCity(msg)) {
      return lock(getInvalidSpanishCityReprompt(language))
    }
    return aiResponse
  }

  // B4 (desde quando) → próxima é B5 (cidade). LOCK puro para impedir vazamento de H1.
  if (isEmpadronamientoSinceQuestion(previousQuestion)) {
    const nextQ = extractLastQuestion(aiResponse)
    if (isEmpadronamientoCityQuestion(nextQ)) return aiResponse
    return lock(getEmpadronamientoCityQuestion(language))
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
    return lock(getEmpadronamientoCityQuestion(language))
  }

  // SIM puro (ou texto curto não-negativo) → pergunta B4 (desde quando).
  if (YES_ANSWER_RE.test(msg) || msg.length < 60) {
    const nextQ = extractLastQuestion(aiResponse)
    if (isEmpadronamientoSinceQuestion(nextQ)) return aiResponse
    return lock(getEmpadronamientoSinceQuestion(language))
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
    preHandoffSent?: boolean
    handoffSent?: boolean
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
      outsideProgress: (flags as any).outsideProgress || null,
    })
    return lock(wrap(next))
  }

  if (flags.locationKnown === 'spain' && isSpainOnlyQuestion) {
    console.log('[BLOCK_LOCK] cliente na Espanha, IA fez pergunta de bloco-fora:', q.slice(0, 80))
    const op = ((flags as any).outsideProgress || {}) as any
    const b1Sent = !!op.b1_situation_sent
    let next: string
    if (!flags.entryDateConfirmed) {
      if (b1Sent) {
        if (language === 'es') next = '¿Cuál fue la fecha exacta de tu entrada en España?'
        else if (language === 'en') next = 'What was the exact date you entered Spain?'
        else if (language === 'fr') next = 'Quelle est la date exacte de votre entrée en Espagne ?'
        else next = 'Qual foi a data exata da sua entrada na Espanha?'
      } else {
        if (language === 'es') next = 'Perfecto. Ahora necesito entender tu situación aquí.\n\n¿Cuál fue la fecha exacta de tu entrada en España?'
        else if (language === 'en') next = 'Got it. Now I need to understand your situation here.\n\nWhat was the exact date you entered Spain?'
        else if (language === 'fr') next = 'D’accord. Maintenant j’ai besoin de comprendre votre situation ici.\n\nQuelle est la date exacte de votre entrée en Espagne ?'
        else next = 'Perfeito. Agora preciso entender sua situação aqui.\n\nQual foi a data exata da sua entrada na Espanha?'
      }
    } else if (flags.empadronadoConfirmed === null || flags.empadronadoConfirmed === undefined) {
      next = getEmpadronadoQuestion(language)
    } else if (flags.empadronadoConfirmed && !flags.empadronadoCity) {
      next = getEmpadronamientoCityQuestion(language)
    } else {
      // BPMN-3: bloco B completo → H1|||H2|||H3 na mesma rodada (flags persistidas evitam reenvio)
      // IMPORTANTE: NÃO usar wrap() aqui — o payload deve sair literalmente sem
      // qualquer preâmbulo inventado pelo LLM colado antes de H1.
      const payload = buildPreHandoffPayload(language, {
        preHandoffSent: flags.preHandoffSent,
        handoffSent: flags.handoffSent,
        transcript: flags.assistantTranscript || '',
      })
      if (!payload) return aiResponse
      return lock(payload)
    }
    return lock(wrap(next))
  }

  return aiResponse
}

/**
 * Defesa final: se o texto contém H1 do pré-handoff (BPMN-v2) precedido por
 * qualquer preâmbulo (separado por \n e não por |||), descarta tudo antes do H1.
 * Garante que H1|||H2|||H3 saiam sem frases inventadas pelo LLM coladas antes.
 */
const PREHANDOFF_H1_RE = /Perfeito\. Já consigo ter uma visão inicial do seu caso\.|Perfecto\. Ya puedo tener una visión inicial de tu caso\.|Perfect\. I can already get an initial view of your case\.|Parfait\. Je peux déjà avoir une première vision de votre cas\./i

export function stripPreambleBeforePreHandoff(text: string): string {
  if (!text) return text
  const match = text.match(PREHANDOFF_H1_RE)
  if (!match || match.index === undefined || match.index === 0) return text
  // Só descarta se o que vem antes NÃO contém o delimitador ||| (i.e., é preâmbulo solto).
  const before = text.slice(0, match.index)
  if (before.includes('|||')) return text
  console.warn('[BPMN-v2] Preâmbulo descartado antes do H1:', before.trim().slice(0, 120))
  return text.slice(match.index)
}

/**
 * Gate determinístico: se o LLM emitiu H1 (pré-handoff) MAS o bloco A/B ainda
 * não está completo segundo as flags persistidas, descarta o aiResponse e
 * retorna a próxima pergunta canônica do ramo, com lock().
 *
 * Ramo B (location_known='spain'): data entrada → empadronado yes/no → desde quando → cidade
 * Ramo A (location_known='outside'): idade → Europa 6m → familiar → remoto → formação
 */
export function enforceBlockCompletion(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    locationKnown: 'spain' | 'outside' | null | undefined
    entryDateConfirmed: string | null | undefined
    empadronadoConfirmed: boolean | null | undefined
    empadronadoCity: string | null | undefined
    assistantTranscript: string
    outsideProgress?: {
      a1_scenario_sent?: boolean
      a2_age?: string
      a3_europe_6m?: 'yes' | 'no'
      a4_eu_family?: 'yes' | 'no'
      a5_remote?: 'yes' | 'no'
      a6_higher_ed?: 'yes' | 'no'
      b1_situation_sent?: boolean
      b4_empadronado_since?: string
    } | null
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  if (!flags.locationKnown) return aiResponse
  if (!PREHANDOFF_H1_RE.test(aiResponse)) return aiResponse

  const transcript = flags.assistantTranscript || ''

  if (flags.locationKnown === 'spain') {
    if (!flags.entryDateConfirmed) {
      const q = language === 'es' ? '¿Cuál fue la fecha exacta de tu entrada en España?'
        : language === 'en' ? 'What was the exact date you entered Spain?'
        : language === 'fr' ? 'Quelle est la date exacte de votre entrée en Espagne ?'
        : 'Qual foi a data exata da sua entrada na Espanha?'
      console.warn('[BLOCK_GATE] H1 prematuro — falta data entrada. Forçando B1.')
      return lock(q)
    }
    if (flags.empadronadoConfirmed === null || flags.empadronadoConfirmed === undefined) {
      console.warn('[BLOCK_GATE] H1 prematuro — falta empadronado yes/no. Forçando B2.')
      return lock(getEmpadronadoQuestion(language))
    }
    if (flags.empadronadoConfirmed === true) {
      const op = (flags.outsideProgress || {}) as any
      const sinceAnswered = !!op.b4_empadronado_since
        || /(desde quando|desde cu[áa]ndo|since when|depuis quand)/i.test(transcript)
      if (!sinceAnswered) {
        console.warn('[BLOCK_GATE] H1 prematuro — falta "desde quando". Forçando B3.')
        return lock(getEmpadronamientoSinceQuestion(language))
      }
      if (!flags.empadronadoCity) {
        console.warn('[BLOCK_GATE] H1 prematuro — falta cidade empadronamento. Forçando B4.')
        return lock(getEmpadronamientoCityQuestion(language))
      }
    }
    return aiResponse
  }

  // Ramo A (outside) — usa flags persistidas com fallback ao transcript.
  if (flags.locationKnown === 'outside') {
    const op = flags.outsideProgress || {}
    const askedInTranscript = (re: RegExp) => re.test(transcript)
    const has = {
      idade: !!op.a2_age || askedInTranscript(A2_AGE_RE),
      europa: !!op.a3_europe_6m || askedInTranscript(A3_EUROPA_RE),
      familiar: !!op.a4_eu_family || askedInTranscript(A4_FAMILIAR_RE),
      remoto: !!op.a5_remote || askedInTranscript(A5_REMOTO_RE),
      formacao: !!op.a6_higher_ed || askedInTranscript(A6_FORMACAO_RE),
    }
    // Se TODOS os flags A2-A6 estão preenchidos com RESPOSTA, libera H1.
    const allAnswered = !!op.a2_age && !!op.a3_europe_6m && !!op.a4_eu_family && !!op.a5_remote && !!op.a6_higher_ed
    if (allAnswered) return aiResponse
    // Caso contrário, devolve a próxima pergunta canônica do ramo A.
    const next = getOutsideSpainNextQuestion(language, transcript, {
      entryDateConfirmed: flags.entryDateConfirmed || null,
      locationKnown: flags.locationKnown,
    })
    if (PREHANDOFF_H1_RE.test(next)) {
      // transcript diz "completo" mas flags não — não bloqueamos para evitar loop.
      return aiResponse
    }
    console.warn('[BLOCK_GATE] H1 prematuro — bloco A incompleto. Flags:', JSON.stringify(has))
    return lock(next)
  }

  return aiResponse
}

// ============================================================================
// Anti-repetição global de perguntas canônicas
// ============================================================================
/**
 * Cataloga perguntas canônicas (A1-A6, B1-B5, Msg7 localização) por âncoras.
 * Se a IA emite uma pergunta cujo token-âncora JÁ consta no transcript
 * (i.e., já foi feita), substitui pela próxima pergunta pendente do bloco
 * via enforceBlockCompletion / getOutsideSpainNextQuestion.
 */
export function preventRepeatedCanonicalQuestion(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    locationKnown: 'spain' | 'outside' | null | undefined
    entryDateConfirmed: string | null | undefined
    empadronadoConfirmed: boolean | null | undefined
    empadronadoCity: string | null | undefined
    assistantTranscript: string
    outsideProgress?: {
      a1_scenario_sent?: boolean
      a2_age?: string
      a3_europe_6m?: 'yes' | 'no'
      a4_eu_family?: 'yes' | 'no'
      a5_remote?: 'yes' | 'no'
      a6_higher_ed?: 'yes' | 'no'
      b1_situation_sent?: boolean
      b4_empadronado_since?: string
    } | null
    /** Msg3 nome / Msg4 email já confirmados — evita repergunta canônica. */
    nameKnown?: boolean
    emailKnown?: boolean
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  const q = extractLastQuestion(aiResponse)
  if (!q) return aiResponse
  const transcript = flags.assistantTranscript || ''

  // Cada anchor: (regex pergunta, regex transcript "já feita").
  // Se a pergunta atual bate E já há eco no transcript → repete.
  // Msg3/Msg4 são guardados por flags (nameKnown/emailKnown) para evitar repergunta.
  const anchors: Array<{ name: string; q: RegExp; t: RegExp; guard?: () => boolean }> = [
    { name: 'Msg3_nome', q: /\b(nome completo|nombre completo|full name|nom complet)\b/i, t: /.^/, guard: () => !!flags.nameKnown },
    { name: 'Msg4_email', q: /\b(e ?mail|correo|email)\b.{0,40}\b(qual|cual|cu[áa]l|melhor|mejor|best|what|which)\b|\b(qual|cual|cu[áa]l|melhor|mejor|best|what|which)\b.{0,40}\b(e ?mail|correo|email)\b/i, t: /.^/, guard: () => !!flags.emailKnown },
    { name: 'A2_idade', q: A2_AGE_RE, t: A2_AGE_RE },
    { name: 'A3_europa', q: A3_EUROPA_RE, t: A3_EUROPA_RE },
    { name: 'A4_familiar', q: A4_FAMILIAR_RE, t: A4_FAMILIAR_RE },
    { name: 'A5_remoto', q: A5_REMOTO_RE, t: A5_REMOTO_RE },
    { name: 'A6_formacao', q: A6_FORMACAO_RE, t: A6_FORMACAO_RE },
    { name: 'B2_data', q: /\b(data exata|fecha exacta|exact date|date exacte).{0,40}(espanha|espa[ñn]a|spain|espagne)/i, t: /\b(data exata|fecha exacta|exact date|date exacte).{0,40}(espanha|espa[ñn]a|spain|espagne)/i },
    { name: 'B3_empadronado', q: /\bestá empadron|estás empadron|are you (registered|empadron)|êtes-vous empadron/i, t: /\bestá empadron|estás empadron|are you (registered|empadron)|êtes-vous empadron/i },
    { name: 'B4_desde_quando', q: /(desde quando|desde cu[áa]ndo|since when|depuis quand)/i, t: /(desde quando|desde cu[áa]ndo|since when|depuis quand)/i },
    { name: 'B5_cidade', q: /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i, t: /(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)/i },
    // Msg7: padrão original + paráfrases ("ainda no/em outro país", "currently/where are you")
    { name: 'Msg7_local', q: /(j[áa] est[áa] na espanha|ya est[áa]s en espa[ñn]a|already in spain|d[ée]j[àa] en espagne|ainda (est[áa]|mora|vive) (em outro|no) pa[íi]s|todav[ií]a (est[áa]s|vives) en otro pa[íi]s|where are you (currently|now)|currently in spain)/i, t: /(j[áa] est[áa] na espanha|ya est[áa]s en espa[ñn]a|already in spain|d[ée]j[àa] en espagne|j[áa] est[áa] aqui na espanha|ya vives en espa[ñn]a)/i, guard: () => !!flags.locationKnown },
  ]

  for (const a of anchors) {
    const guardForce = a.guard ? a.guard() : false
    // Para anchors com guard ativo (ex.: nameKnown/emailKnown/locationKnown),
    // basta que a IA tenha emitido a pergunta — independente do transcript.
    if (a.q.test(q) && (guardForce || a.t.test(transcript))) {
      // Pergunta já foi feita. Pega próxima canônica.
      console.warn(`[ANTI_REPEAT] pergunta canônica ${a.name} já feita — substituindo por próxima pendente`)
      // Reusa enforceBlockCompletion injetando "fake H1" para forçar próxima pergunta.
      const fakeH1 = language === 'es' ? 'Perfecto. Ya puedo tener una visión inicial de tu caso.'
        : language === 'en' ? 'Perfect. I can already get an initial view of your case.'
        : language === 'fr' ? 'Parfait. Je peux déjà avoir une première vision de votre cas.'
        : 'Perfeito. Já consigo ter uma visão inicial do seu caso.'
      const replacement = enforceBlockCompletion(fakeH1, language, flags)
      // Se enforceBlockCompletion devolveu o próprio fakeH1 (i.e., bloco completo), libera resposta original.
      if (replacement === fakeH1) return aiResponse
      return replacement // já vem com lock()
    }
  }
  return aiResponse
}

// ============================================================================
// Anti-repetição da ABERTURA (Msg1 greeting + Msg2 consent)
// ============================================================================

/** Greeting tokens (Msg1) — agradecimento por contato em 4 línguas. */
const OPENER_GREETING_RE =
  /\b(obrigad[oa] por (falar|escrever|entrar|contat)|gracias por (hablar|escribir|contact)|thank(s)? you for (reaching|contacting|writing)|merci de (nous|m'avoir) contact)/i

/** Consent question (Msg2) — "perguntas rápidas … pode ser/is that okay/can we proceed". */
const OPENER_CONSENT_RE =
  /\b(perguntas? r[áa]pidas?|preguntas r[áa]pidas?|quick questions?|questions rapides)\b[\s\S]{0,200}\b(pode ser|podemos (continuar|seguir|proceder)|est[áa] bien|is that ok(ay)?|can we proceed|d['’]accord|on continue)\b\s*[?¿]?/i

/** Re-greeting que reabre opener pós-nome (ex.: "Great to meet you, X! ..."). */
const REGREETING_RE =
  /^\s*(prazer em (te )?conhecer|encantad[oa] de conocer|nice to meet you|great to meet you|enchant[ée] de (vous|te) conna[iî]tre|muito (prazer|bom)|oi[, ]+|ol[áa][, ]+|hola[, ]+|hello[, ]+|hi[, ]+|bonjour[, ]+|salut[, ]+)/i

/** Próxima pergunta canônica pendente (Msg3 → Msg4 → próxima do bloco). */
function nextPendingCanonical(
  language: ChatLanguage,
  flags: {
    locationKnown: 'spain' | 'outside' | null | undefined
    entryDateConfirmed: string | null | undefined
    empadronadoConfirmed: boolean | null | undefined
    empadronadoCity: string | null | undefined
    assistantTranscript: string
    outsideProgress?: any
    nameKnown?: boolean
    emailKnown?: boolean
  },
): string {
  if (!flags.nameKnown) {
    if (language === 'es') return 'Perfecto. Para empezar, ¿cuál es tu nombre completo?'
    if (language === 'en') return 'Perfect. First of all, what is your full name?'
    if (language === 'fr') return 'Parfait. Tout d’abord, quel est votre nom complet ?'
    return 'Perfeito. Antes de mais nada, qual é o seu nome completo?'
  }
  if (!flags.emailKnown) return getEmailQuestion(language)
  const fakeH1 = language === 'es' ? 'Perfecto. Ya puedo tener una visión inicial de tu caso.'
    : language === 'en' ? 'Perfect. I can already get an initial view of your case.'
    : language === 'fr' ? 'Parfait. Je peux déjà avoir une première vision de votre cas.'
    : 'Perfeito. Já consigo ter uma visão inicial do seu caso.'
  const replacement = enforceBlockCompletion(fakeH1, language, flags as any)
  if (replacement === fakeH1) {
    if (language === 'es') return 'Perfecto, sigamos.'
    if (language === 'en') return 'Perfect, let’s continue.'
    if (language === 'fr') return 'Parfait, continuons.'
    return 'Perfeito, vamos seguir.'
  }
  return stripLockedSentinel(replacement)
}

/**
 * Suprime repetição da ABERTURA (greeting/consent) e do RE-GREETING pós-nome.
 * Quando `openerSent=true` (ou eco no transcript), substitui pela próxima
 * canônica pendente. Idempotência via flag persistida em outside_spain_progress.
 */
export function stripRepeatedOpener(
  aiResponse: string,
  language: ChatLanguage,
  flags: {
    locationKnown: 'spain' | 'outside' | null | undefined
    entryDateConfirmed: string | null | undefined
    empadronadoConfirmed: boolean | null | undefined
    empadronadoCity: string | null | undefined
    assistantTranscript: string
    outsideProgress?: { opener_sent?: boolean; [k: string]: any } | null
    nameKnown?: boolean
    emailKnown?: boolean
    openerSent?: boolean
  },
): string {
  if (!aiResponse) return aiResponse
  if (isLocked(aiResponse)) return aiResponse
  const transcript = flags.assistantTranscript || ''
  const openerAlreadySent =
    !!flags.openerSent
    || !!(flags.outsideProgress && flags.outsideProgress.opener_sent)
    || OPENER_GREETING_RE.test(transcript)
    || OPENER_CONSENT_RE.test(transcript)
  if (!openerAlreadySent) return aiResponse

  const hasGreeting = OPENER_GREETING_RE.test(aiResponse)
  const hasConsent = OPENER_CONSENT_RE.test(aiResponse)
  const hasRegreeting = REGREETING_RE.test(aiResponse) && !!flags.nameKnown
  if (!hasGreeting && !hasConsent && !hasRegreeting) return aiResponse

  console.warn('[ANTI_REPEAT_OPENER] opener/re-greeting detectado — substituindo por próxima canônica', JSON.stringify({ hasGreeting, hasConsent, hasRegreeting }))
  return lock(nextPendingCanonical(language, flags))
}

// ============================================================================
// Anti-repetição do PRÉ-HANDOFF (H1/H2/H3) após handoff já enviado
// ============================================================================

/** H2 — "cada caso de forma individual" / "each case individually" / "cada caso individualmente" / "chaque cas individuellement". */
const PREHANDOFF_H2_RE =
  /(cada caso de forma individual|each case individually|analizamos cada caso|analisamos cada caso|chaque cas individuellement|caminho mais seguro|camino m[áa]s seguro|safest path|voie la plus s[ûu]re)/i

/** H3 — "encaminhar suas informações / remitir tu información / forward your information / transmettre vos informations". */
const PREHANDOFF_H3_RE =
  /(encaminhar suas informa[çc][õo]es|remitir tu informaci[óo]n|forward your information|transmettre vos informations|enviar tu informaci[óo]n a un especialista|enviar suas informa[çc][õo]es para um especialista)/i

/** Frase final "estou à disposição… vou te encaminhar com um atendente". */
const PREHANDOFF_TAIL_RE =
  /(estou [àa] disposi[çc][ãa]o.{0,80}(atendente|especialista)|estoy a tu disposici[óo]n.{0,80}(asistente|atendente|especialista)|i('?m| am) (here|available).{0,80}(agent|specialist)|je suis [àa] (votre|ta) disposition.{0,80}(agent|sp[ée]cialiste))/i

/**
 * Após `pre_handoff_sent=true`, remove qualquer reemissão de H1/H2/H3 (e cauda).
 * - Divide por "|||" e por parágrafos (\n\n); descarta partes que casem com qualquer âncora.
 * - Se sobrar texto útil → devolve apenas ele (lock para impedir overrides posteriores).
 * - Se sobrar nada → devolve o sufixo pós-handoff localizado, em uma única bolha.
 */
export function stripRepeatedPreHandoff(
  aiResponse: string,
  language: ChatLanguage,
  flags: { preHandoffSent?: boolean },
): string {
  if (!aiResponse) return aiResponse
  if (!flags?.preHandoffSent) return aiResponse
  if (isLocked(aiResponse)) return aiResponse

  const matchesPreHandoff = (s: string): boolean =>
    PREHANDOFF_H1_RE.test(s) || PREHANDOFF_H2_RE.test(s) || PREHANDOFF_H3_RE.test(s) || PREHANDOFF_TAIL_RE.test(s)

  const bubbles = aiResponse.split('|||').map(b => b.trim()).filter(Boolean)
  const cleanedBubbles: string[] = []
  let removedAny = false

  for (const bubble of bubbles) {
    // Dentro de cada bolha, filtra parágrafos (\n\n) que casem com âncora.
    const paragraphs = bubble.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    const keptParagraphs: string[] = []
    for (const p of paragraphs) {
      if (matchesPreHandoff(p)) {
        removedAny = true
        continue
      }
      // Mesmo dentro de um parágrafo, se houver linhas individuais com âncoras, remove-as.
      const lines = p.split(/\n/).map(l => l.trim())
      const keptLines = lines.filter(l => !l || !matchesPreHandoff(l))
      const remaining = keptLines.join('\n').trim()
      if (remaining.length === 0) {
        removedAny = true
        continue
      }
      if (remaining !== p) removedAny = true
      keptParagraphs.push(remaining)
    }
    const cleaned = keptParagraphs.join('\n\n').trim()
    if (cleaned.length > 0) cleanedBubbles.push(cleaned)
  }

  if (!removedAny) return aiResponse

  if (cleanedBubbles.length === 0) {
    console.warn('[ANTI_REPEAT_PREHANDOFF] resposta era apenas bloco H1/H2/H3 — substituindo por sufixo pós-handoff')
    return lock(getPostHandoffWaitSuffix(language))
  }

  console.warn('[ANTI_REPEAT_PREHANDOFF] removidas frases de fechamento; mantido conteúdo útil')
  return lock(cleanedBubbles.join('|||'))
}
