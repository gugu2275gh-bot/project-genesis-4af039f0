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

// Normaliza alongamentos coloquiais ("siim"→"sim", "naao"→"nao", "okkk"→"ok")
// reduzindo repetições de 2+ letras iguais consecutivas para 1. Mantém casos.
function collapseElongations(s: string): string {
  return String(s || '').replace(/([a-zA-ZáàâãéêíóôõúüñçÁÀÂÃÉÊÍÓÔÕÚÜÑÇ])\1{1,}/g, '$1')
}

function isYesNo(text: string): boolean {
  const t = collapseElongations(String(text || '').trim())
  return /^\s*(sim|s[íi]|yes|y|claro|correto|exato|exactly|exact|sure|ok|okay|vale|positivo|negativo|n[ãa]o|no|n[óo]p|nope|nunca|never|jamais|nunc?a|pode|pode\s+ser|podes|puede|puedes|dale|manda|vai|vamos|fala|pronto|go\s+ahead|adelante|allez(?:-?y)?)\s*[.!?]?\s*$/i.test(t)
}

function isShortNumber(text: string): boolean {
  return /^\s*\d{1,3}\s*$/.test(text)
}

// ============================================================================
// Detector universal de pergunta factual (definição, significado, preço,
// requisitos, "como funciona") cobrindo PT / ES / EN / FR. Usado por
// classifyOffTopic e por extractInterestFromMessage para garantir paridade.
// ============================================================================
const DEFINITION_QUESTION_RE = new RegExp(
  [
    // --- PT --- aceita "que" e "quê" (com circunflexo); "é/e/ê" (sem \b após acento — \b é ASCII em JS)
    String.raw`\bo\s+qu[eê]\s+(?:é|e|ê|sao|são|seria|significa|significam)(?=\s|$|[?.!,])`,
    String.raw`\bo\s+qu[eê]\s+quer\s+dizer\b`,

    String.raw`\bquanto\s+custa\b`,
    String.raw`\bcomo\s+funciona\b`,
    String.raw`\bquais\s+(?:são|sao)\s+os\s+requisitos\b`,
    // --- ES --- (cobre "qué es", "que es", "qué és", "que és")
    String.raw`\bqu[eé]\s+[eé]s\b`,
    String.raw`\bqu[eé]\s+son\b`,
    String.raw`\bqu[eé]\s+significa(?:n)?\b`,
    String.raw`\bqu[eé]\s+quiere\s+decir\b`,
    String.raw`\bcu[aá]nto\s+cuesta\b`,
    String.raw`\bc[oó]mo\s+funciona\b`,
    String.raw`\bcu[aá]les\s+son\s+los\s+requisitos\b`,
    // --- EN ---
    String.raw`\bwhat(?:'?s|\s+is|\s+are|\s+does)\b`,
    String.raw`\bwhat\s+does\s+\S+\s+mean\b`,
    String.raw`\bhow\s+(?:does|do|much)\b`,
    String.raw`\bwhat\s+are\s+the\s+requirements\b`,
    // --- FR ---
    String.raw`qu['’]?est[- ]ce\s+que`,
    String.raw`c['’]?est\s+quoi`,
    String.raw`\bque\s+(?:veut|signifie)\s+dire\b`,
    String.raw`\bcomment\s+fonctionne\b`,
    String.raw`\bcomment\s+ça\s+marche\b`,
    String.raw`\bcombien\s+(?:ça\s+coûte|coûte)\b`,
    String.raw`\bquels\s+sont\s+les\s+(?:requisits|prérequis|conditions)\b`,
  ].join('|'),
  'iu',
)

const FACTUAL_PREFIX_RE = /^\s*(o\s+qu[eê]|qu[eé]|what(?:'?s)?|how|qu['’]?est|c['’]?est\s+quoi|combien|comment|cu[aá]nto|c[oó]mo|quanto|como)\b/iu

export function isFactualQuestion(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (DEFINITION_QUESTION_RE.test(s)) return true
  // Fallback: pergunta curta com keyword de serviço, com OU sem '?'
  const noQ = s.replace(/\?/g, '').trim()
  if (s.split(/\s+/).length <= 6 && isPotentialInterestAnswer(noQ)) {
    if (/\?\s*$/.test(s)) return true
    if (FACTUAL_PREFIX_RE.test(s)) return true
  }
  return false
}

// ============================================================================
// Validação de resposta por etapa do cadastro básico.
// Para cada etapa, define o que conta como resposta VÁLIDA. Qualquer outra
// coisa (pergunta factual, dúvida, serviço fora da hora, etc.) é off-topic.
// ============================================================================
export type CadastroStepKey =
  | 'abertura' | 'nome' | 'email' | 'interesse'
  | 'localizacao' | 'data_entrada' | 'empadronamiento'
  | 'preHandoff' | 'handoff' | string

export function isValidAnswerForStep(
  rawMessage: string,
  step: CadastroStepKey | undefined | null,
  lastAssistantQuestion?: string | null,
): boolean {
  const s = String(rawMessage || '').trim()
  if (!s) return false
  if (!step) return true
  // Pergunta factual nunca é resposta válida a uma pergunta de cadastro.
  if (isFactualQuestion(s)) return false
  switch (step) {
    case 'abertura':
      return isYesNo(s)
    case 'nome':
      return isLikelyFullNameAnswer(s) || isNameRefusal(s)
    case 'email':
      return hasValidEmail(s) || isEmailRefusal(s)
    case 'interesse':
      return isPotentialInterestAnswer(s) || isStructuredQuestionAnswer(s)
    case 'localizacao':
      return isYesNo(s) || isNeverBeenToSpainAnswer(s) || LOCATION_IN_SPAIN_HINT_RE.test(s)
    case 'data_entrada':
      return isPotentialEntryDateAnswer(s) || isNeverBeenToSpainAnswer(s)
    case 'empadronamiento':
      return isYesNo(s) || isValidSpanishCity(s)
    case 'preHandoff':
    case 'handoff':
      return isYesNo(s) || isShortNumber(s) || isStructuredQuestionAnswer(s)
    default:
      return true
  }
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
  ctx?: { collectionGateActive?: boolean; currentStep?: CadastroStepKey | null },
): OffTopicResult | null {
  const raw = String(currentMessage || '').trim()
  if (!raw) return null
  if (!ctx?.collectionGateActive) return null

  // Autoridade por etapa: se sabemos qual é a etapa do cadastro, exigimos
  // resposta válida para essa etapa. Qualquer outra coisa é off-topic.
  if (ctx.currentStep) {
    if (isValidAnswerForStep(raw, ctx.currentStep, lastAssistantQuestion)) return null
    return { kind: isFactualQuestion(raw) ? 'question' : 'request' }
  }


  const q = String(lastAssistantQuestion || '')

  // Pergunta factual de definição/preço/requisitos tem PRECEDÊNCIA absoluta
  // em todas as 4 línguas suportadas (PT/ES/EN/FR).
  if (isFactualQuestion(raw)) return { kind: 'question' }

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
  if (language === 'es') return 'Por favor, terminemos primero el registro básico. A continuación podemos tratar otros temas.'
  if (language === 'en') return "Please, let's finish the basic registration first. Afterwards we can address other matters."
  if (language === 'fr') return "S'il vous plaît, terminons d'abord l'enregistrement de base. Ensuite, nous pourrons aborder d'autres sujets."
  return 'Por favor, vamos terminar o cadastro básico primeiro. Em seguida podemos tratar de outros assuntos.'
}

// ============================================================================
// Anti re-ask universal: detecta se uma frase pede um campo de cadastro
// que JÁ foi capturado (nome, e-mail, telefone, interesse, localização Espanha,
// data de entrada, cidade de empadronamiento, idade).
// ============================================================================

export interface CapturedSnapshot {
  fullName?: boolean
  email?: boolean
  phone?: boolean
  interest?: boolean
  locationSpain?: boolean
  entryDate?: boolean
  empadronamientoCity?: boolean
  age?: boolean
}

const REASK_PATTERNS: Record<keyof CapturedSnapshot, RegExp> = {
  fullName: /\b(qual\s+(?:é\s+)?(?:o\s+)?seu\s+nome|me\s+(?:diga|informa|passa)\s+seu\s+nome|cu[áa]l\s+es\s+tu\s+nombre|d[ií]me\s+tu\s+nombre|what(?:'?s|\s+is)\s+your\s+(?:full\s+)?name|may\s+i\s+have\s+your\s+name|comment\s+(?:vous\s+appelez|t['’]appelles)|quel\s+est\s+votre\s+nom)\b/i,
  email: /\b(qual\s+(?:é\s+)?(?:o\s+)?seu\s+(?:melhor\s+)?e-?mail|me\s+(?:passa|informa|diga)\s+(?:o\s+)?seu\s+e-?mail|cu[áa]l\s+es\s+tu\s+(?:mejor\s+)?(?:correo|e-?mail)|d[ií]me\s+tu\s+(?:correo|e-?mail)|what(?:'?s|\s+is)\s+your\s+(?:best\s+)?email|quel\s+est\s+votre\s+(?:meilleur\s+)?(?:e-?mail|courriel))\b/i,
  phone: /\b(qual\s+(?:é\s+)?(?:o\s+)?seu\s+(?:telefone|whatsapp|n[úu]mero)|cu[áa]l\s+es\s+tu\s+(?:tel[eé]fono|whatsapp|n[úu]mero)|what(?:'?s|\s+is)\s+your\s+(?:phone|whatsapp)\s*(?:number)?|quel\s+est\s+votre\s+(?:t[eé]l[eé]phone|num[eé]ro))\b/i,
  interest: /\b(qual\s+(?:é\s+)?(?:o\s+)?seu\s+interesse|em\s+que\s+(?:posso|podemos)\s+(?:te\s+)?ajudar|qual\s+servi[çc]o|qu[eé]\s+servicio|en\s+qu[eé]\s+(?:puedo|podemos)\s+ayudarte|tu\s+caso\s+encaja|which\s+service|how\s+can\s+(?:i|we)\s+help|quel\s+service|comment\s+(?:puis|pouvons)-(?:je|nous)\s+vous\s+aider)\b/i,
  locationSpain: /\b(voc[eê]\s+(?:est[áa]|mora|vive)\s+(?:na|em)\s+espanha|est[áa]s?\s+(?:en|na)\s+espa[ñn]a|vives?\s+en\s+espa[ñn]a|are\s+you\s+(?:in|living\s+in)\s+spain|do\s+you\s+live\s+in\s+spain|(?:vous\s+)?(?:êtes|etes|vis|vivez)\s+en\s+espagne)\b/i,
  entryDate: /\b(quando\s+(?:voc[eê]\s+)?(?:entrou|chegou)\s+(?:na|em|no)\s+espa[ñn]ha?|qual\s+(?:foi\s+)?(?:a\s+)?data\s+de\s+(?:entrada|chegada)|cu[áa]ndo\s+(?:entraste|llegaste)\s+a\s+espa[ñn]a|fecha\s+de\s+(?:entrada|llegada)|when\s+did\s+you\s+(?:enter|arrive\s+in)\s+spain|date\s+of\s+(?:entry|arrival)|quand\s+(?:êtes|etes|es)-?vous\s+(?:entr[eé]|arriv[eé])|date\s+d['’]?(?:entr[eé]e|arriv[eé]e))\b/i,
  empadronamientoCity: /(em\s+que\s+cidade\s+(?:voc[eê]\s+)?(?:est[áa]\s+)?empadronad\w*|en\s+qu[eé]\s+ciudad\s+(?:est[áa]s\s+)?empadronad\w*|in\s+which\s+city\s+are\s+you\s+(?:registered|empadronad\w*)|dans\s+quelle\s+ville\s+êtes-?vous\s+(?:enregistr\w*|empadronad\w*))/i,
  age: /\b(qual\s+(?:é\s+)?(?:a\s+)?sua\s+idade|quantos\s+anos\s+voc[eê]\s+tem|cu[áa]ntos\s+a[ñn]os\s+tienes|how\s+old\s+are\s+you|quel\s+âge\s+avez-?vous)\b/i,
}

export function findReAskField(text: string, captured: CapturedSnapshot): keyof CapturedSnapshot | null {
  const t = String(text || '')
  if (!t.trim()) return null
  for (const key of Object.keys(REASK_PATTERNS) as (keyof CapturedSnapshot)[]) {
    if (captured[key] && REASK_PATTERNS[key].test(t)) return key
  }
  return null
}

/**
 * Remove bolhas (separadas por `|||` ou linhas em branco) que pedem novamente
 * algum campo já capturado. Retorna `{ text, removed }`.
 */
export function stripReAskOfCapturedFields(
  text: string,
  captured: CapturedSnapshot,
): { text: string; removed: (keyof CapturedSnapshot)[] } {
  const raw = String(text || '')
  if (!raw.trim()) return { text: raw, removed: [] }
  const removed: (keyof CapturedSnapshot)[] = []
  const usePipes = raw.includes('|||')
  const parts = usePipes ? raw.split('|||') : raw.split(/\n{2,}/)
  const kept: string[] = []
  for (const part of parts) {
    const field = findReAskField(part, captured)
    if (field) { removed.push(field); continue }
    kept.push(part)
  }
  const out = kept.join(usePipes ? '|||' : '\n\n').trim()
  return { text: out || raw, removed }
}

