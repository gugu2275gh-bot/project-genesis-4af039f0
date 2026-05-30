// @ts-nocheck
// Classificador determinístico de "off-topic" durante o pré-handoff.
// Decide se uma mensagem do cliente é resposta válida à pergunta corrente do
// agente OU se é uma dúvida/pedido fora da sequência (que deve ser parqueado).

import {
  isQuestionAboutFullName,
  isQuestionAboutEmail,
  isQuestionAboutInterest,
  isQuestionAboutLocationSpain,
  isQuestionAboutSpainEntryDate,
  isQuestionAboutEmpadronamientoCity,
  isPotentialEntryDateAnswer,
  isPotentialInterestAnswer,
  isStructuredQuestionAnswer,
  isNeverBeenToSpainAnswer,
  hasValidEmail,
} from './questions.ts'
import { isLikelyFullNameAnswer, isNameRefusal, isEmailRefusal } from './name-extraction.ts'
import { isValidSpanishCity } from './spanish-cities.ts'

export type OffTopicKind = 'question' | 'request'

export interface OffTopicResult {
  kind: OffTopicKind
}

const QUESTION_HINT_RE = /\?|\b(como|c[óo]mo|comment|how|what|qual|cual|cu[áa]l|quais|quels|quelles|quanto|cu[áa]nto|combien|quanto custa|how much|onde|d[óo]nde|o[uù]|where|when|cuando|cu[áa]ndo|quand|por que|por qu[eé]|why|pourquoi)\b/i
const REQUEST_HINT_RE = /\b(quero|queria|gostaria|me interessa|preciso|tenho d[úu]vida|tengo (una )?duda|me gustar[ií]a|necesito|i\s*(want|need|would\s+like|d['’]?like)|i'?d\s+like|j['’]?aimerais|je\s+(veux|voudrais|souhaite)|j['’]?ai\s+besoin)\b/i

function isYesNo(text: string): boolean {
  return /^\s*(sim|s[íi]|yes|y|claro|correto|exato|exactly|exact|sure|ok|okay|vale|positivo|negativo|n[ãa]o|no|n[óo]p|nope|nunca|never|jamais|nunc?a)\s*[.!]?\s*$/i.test(text)
}

function isShortNumber(text: string): boolean {
  return /^\s*\d{1,3}\s*$/.test(text)
}

/**
 * Retorna `null` se a mensagem é resposta válida à pergunta corrente do bot
 * (ou se for uma recusa que outros guards já tratam). Caso contrário,
 * classifica como `question` (dúvida factual) ou `request` (pedido/menção
 * de serviço fora do roteiro).
 */
// Catálogo de serviços ou pergunta "seu caso se encaixa em algum desses?" emitidos
// pelo bot na rodada anterior — para esses casos, qualquer resposta que cite um
// serviço válido (residencia, arraigo, nacionalidad, etc.) é resposta legítima.
const CATALOG_FOLLOWUP_RE = /(se encaixa em algum|encaja en alguno|fits any of these|correspond[^?]{0,40}l['’]un de ces|tu caso encaja|seu caso se encaixa)/i

// Sinais "está na Espanha" embutidos numa resposta composta.
const LOCATION_IN_SPAIN_HINT_RE = /\b(estou na espanha|estoy en espa[ñn]a|i'?m in spain|je suis en espagne|moro na espanha|vivo en espa[ñn]a|vivo na espanha|aqui na espanha|aqu[ií] en espa[ñn]a|\d+\s*(anos|años|years|ans)\s*(em|en|in)\s*espa[ñn]ha?|\d+\s*(anos|años|years|ans)\s*(em|en|in)\s*spain)\b/i

export function classifyOffTopic(
  currentMessage: string,
  lastAssistantQuestion: string | null | undefined,
  ctx?: { collectionGateActive?: boolean },
): OffTopicResult | null {
  const raw = String(currentMessage || '').trim()
  if (!raw) return null
  if (!ctx?.collectionGateActive) return null

  const q = String(lastAssistantQuestion || '')

  // Recusas explícitas de nome/email são tratadas pelos guards específicos.
  if (q && isQuestionAboutFullName(q) && (isNameRefusal(raw) || isLikelyFullNameAnswer(raw))) return null
  if (q && isQuestionAboutEmail(q) && (isEmailRefusal(raw) || hasValidEmail(raw))) return null

  // Resposta válida explícita à pergunta corrente.
  if (q) {
    if (isQuestionAboutInterest(q) && isPotentialInterestAnswer(raw)) return null
    // O follow-up do catálogo ("seu caso se encaixa em algum desses?") também é
    // pergunta de interesse — aceitar resposta com keyword de serviço.
    if (CATALOG_FOLLOWUP_RE.test(q) && isPotentialInterestAnswer(raw)) return null
    if (isQuestionAboutLocationSpain(q) && (isYesNo(raw) || isNeverBeenToSpainAnswer(raw))) return null
    if (isQuestionAboutSpainEntryDate(q) && (isPotentialEntryDateAnswer(raw) || isNeverBeenToSpainAnswer(raw))) return null
    if (isQuestionAboutEmpadronamientoCity(q) && isValidSpanishCity(raw)) return null
    if (isStructuredQuestionAnswer(raw)) return null
    // Heurísticas de respostas curtas para perguntas SIM/NÃO ou idade.
    if (/(idade|age|edad|[âa]ge|cu[áa]ntos? a[ñn]os|how old)/i.test(q) && isShortNumber(raw)) return null
    if (/(empadronad|europa nos? [úu]ltimos? 6 meses|europa en los? [úu]ltimos? 6 meses|europe in the last 6 months|familiar (europeu|europeo)|family member|trabalh[aoe] remoto|trabajas? remoto|work remotely|forma[çc][ãa]o superior|formaci[óo]n superior|higher education)/i.test(q) && isYesNo(raw)) return null
    if (/(qual sua idade|cu[áa]ntos a[ñn]os|how old)/i.test(q) && /\b\d{1,3}\b/.test(raw)) return null
  }

  // Resposta composta: contém um serviço válido E/OU pista de localização → não parqueia.
  // Cobre o caso clássico "Sí, ya tengo 2 años en España y quiero solicitar mi residencia",
  // que responde catálogo+localização ao mesmo tempo.
  if (isPotentialInterestAnswer(raw) || LOCATION_IN_SPAIN_HINT_RE.test(raw)) return null

  // Resposta MUITO curta sem pergunta corrente clara → não classifica como off-topic.
  if (raw.length <= 3 && !/[?]/.test(raw)) return null

  // GUARDS anti-parking de dados de cadastro: se a mensagem parece um dado de
  // cadastro (nome, e-mail, data, cidade espanhola) OU se NÃO há pergunta corrente
  // do bot (primeiro turno), NUNCA parqueia — caso contrário o REPLAY vai pedir
  // o mesmo dado de novo no final.
  const hasAssistantQuestion = !!String(lastAssistantQuestion || '').trim()
  if (!hasAssistantQuestion) {
    // Sem pergunta corrente, só parqueia se for explicitamente uma pergunta.
    if (QUESTION_HINT_RE.test(raw)) return { kind: 'question' }
    return null
  }

  // Perguntas/pedidos explícitos têm precedência sobre os guards de cadastro:
  // "Quanto custa o processo?" pode parecer "3 palavras alfa" e bater com
  // isLikelyFullNameAnswer, mas é claramente uma pergunta off-topic.
  if (QUESTION_HINT_RE.test(raw)) return { kind: 'question' }
  if (REQUEST_HINT_RE.test(raw)) return { kind: 'request' }

  // Guards anti-parking de dados de cadastro (nome, e-mail, data, cidade).
  if (isLikelyFullNameAnswer(raw)) return null
  if (hasValidEmail(raw)) return null
  if (isPotentialEntryDateAnswer(raw)) return null
  if (isValidSpanishCity(raw)) return null

  // Frase mais longa que não bate com nada esperado → trata como request (off-topic).
  if (raw.length >= 12) return { kind: 'request' }
  return null
}



export function getOffTopicAckPhrase(language: string): string {
  if (language === 'es') return 'Anotado — trataré ese punto en cuanto terminemos este registro rapidísimo.'
  if (language === 'en') return "Noted — I'll cover that as soon as we finish this quick intake."
  if (language === 'fr') return 'Noté — je traiterai ce point dès que nous aurons terminé ce bref questionnaire.'
  return 'Anotado — vou tratar desse ponto assim que terminarmos esse cadastro rapidíssimo.'
}
