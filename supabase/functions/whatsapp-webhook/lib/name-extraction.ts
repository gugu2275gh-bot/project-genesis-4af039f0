// @ts-nocheck
// Wave 3b step 5: name extraction & denylist
import { normalizeForLanguageChecks } from './language.ts'
import { hasValidEmail, isQuestionAboutFullName } from './questions.ts'
import { isPotentialEntryDateAnswer } from './questions.ts'

export const FULL_NAME_DENYLIST_PATTERNS: RegExp[] = [
  /^(minha|meu|nosso|nossa|tu|tua|teu|sua|seu|este|esta|esse|essa|aquele|aquela)\s/i,
  /^(mi|mis|mio|mia|tu|tus|el|la|los|las|este|esta)\s/i,
  /^(my|your|the|this|that|his|her)\s/i,
  /\b(mae|mãe|pai|filho|filha|irma[oã]o?|esposa|marido|namorado|namorada|tio|tia|primo|prima|amigo|amiga|parente)\b/i,
  /\b(madre|padre|hijo|hija|hermano|hermana|esposo|esposa|novio|novia|amigo|amiga)\b/i,
  /\b(mother|father|son|daughter|brother|sister|husband|wife|friend)\b/i,
  /^(sao paulo|sp|rio|rio de janeiro|brasilia|belo horizonte|salvador|recife|fortaleza|porto alegre|curitiba|manaus|brasil|portugal|espanha|madri|madrid|barcelona|valencia|sevilla|lisboa|porto|paris|londres)$/i,
  // Meta-tokens da PRÓPRIA pergunta ("nome completo?", "full name?") não podem virar nome
  /^(completo|completa|complet[eo]s?|nome|nombre|name|full\s*name|nom|apellido|sobrenome)$/i,
  /\b(completo|completa|complet[eo]s?)\b/i,
  /^\d/,
]


// Padrões de RECUSA / FRASES (não são nomes) — pt/es/en/fr.
export const NAME_REFUSAL_PATTERNS: RegExp[] = [
  /\b(n[ãa]o\s+tenho|sem\s+nome|prefiro\s+n[ãa]o|n[ãa]o\s+quero\s+(dizer|informar|falar))\b/i, // pt
  /\b(no\s+tengo|sin\s+nombre|prefiero\s+no|no\s+quiero\s+(decir|dar|informar))\b/i, // es
  /\b(i\s+(do\s*n'?t|don'?t)\s+(have|want|wanna)|without\s+a?\s*name|i\s+have\s+no\s+name|prefer\s+not)\b/i, // en
  /\b(je\s+n['’]?ai\s+pas|sans\s+nom|je\s+(ne\s+)?(veux|souhaite)\s+pas)\b/i, // fr
  // "Não entendo / no entiendo / I don't understand / je ne comprends pas"
  /\b(n[ãa]o\s+(entendo|entendi|compreendo|percebo)|no\s+(entiendo|comprendo|s[eé])|i\s+(do\s*n'?t|don'?t|cannot|can'?t)\s+understand|je\s+(ne\s+)?comprends\s+pas)\b/i,
  // Pedidos de troca de idioma ("en español", "em português", "in english", "en français")
  /\b(en\s+(espa[ñn]ol|ingl[eé]s|franc[eé]s|portugu[eé]s)|em\s+(portugu[eê]s|espanhol|ingl[eê]s|franc[eê]s)|in\s+(english|spanish|portuguese|french)|en\s+fran[çc]ais)\b/i,
]

// Verbos em 1ª pessoa indicam frase, não nome próprio.
const FIRST_PERSON_VERB_RE = /\b(tenho|tenha|quero|queria|preciso|sou|estou|vou|posso|gosto|acho|prefiro|tengo|tenga|quiero|necesito|soy|estoy|voy|puedo|prefiero|have|want|need|am|going|can|prefer|like|ai|veux|voudrais|suis|vais|peux|aime|pr[ée]f[èe]re)\b/i

// Prefixos de introdução de nome em PT/ES/EN/FR. Usado para remover
// "Me llamo", "Meu nome é", "My name is", "Je m'appelle" etc. antes de
// persistir o nome em contacts.full_name.
// Também remove acks isolados que vêm antes do nome ("ok THAYANA",
// "vale Pedro Silva", "sim João Almeida") — o cliente aceitou o pedido
// e emendou o nome na mesma mensagem.
// IMPORTANTE: alternativas mais longas primeiro (okay antes de ok, sim antes de si,
// yeah antes de yes) para evitar match parcial que deixe sufixos no nome extraído.
const ACK_PREFIX_RE_SOURCE = '(?:okay|okey|beleza|perfeito|entendido|entendi|claro|certo|valeu|vale|blz|yeah|yep|yes|si claro|sim|s[íi]|si|ok|oui|d[’\']accord|dale|hai)'
const GREETING_RE_SOURCE = '(?:ol[áa]|hola|hello|hi|hey|bonjour|salut)'
const NAME_INTRO_PREFIX_RE = new RegExp(
  `^\\s*(?:${ACK_PREFIX_RE_SOURCE}|${GREETING_RE_SOURCE})?[\\s,!.\\-:]*(?:${ACK_PREFIX_RE_SOURCE}|${GREETING_RE_SOURCE})?[\\s,!.\\-:]*(?:eu\\s+)?(?:me\\s+chamo|meu\\s+nome\\s+(?:completo\\s+)?(?:é|e)|sou\\s+(?:o|a)\\s+|aqui\\s+(?:é|e)\\s+(?:o|a)\\s+|me\\s+llamo|mi\\s+nombre\\s+(?:completo\\s+)?es|soy\\s+|mi\\s+nombre[:]\\s*|my\\s+(?:full\\s+)?name\\s+is|i\\s*[’\']?\\s*am\\s+|i\\s*[’\']?m\\s+|this\\s+is\\s+|name[:]\\s*|nome[:]\\s*|nombre[:]\\s*|je\\s+m[’\']appelle|mon\\s+nom\\s+(?:complet\\s+)?est|je\\s+suis\\s+)?[\\s,:\\-]*`,
  'i',
)

/**
 * Remove introduções como "Me llamo", "Meu nome é", "My name is",
 * "Je m'appelle" antes de salvar o nome. Preserva o texto original se
 * o resultado ficar muito curto (fallback seguro).
 */
export function stripNameIntroPrefix(text: string): string {
  const raw = String(text || '').trim()
  if (!raw) return raw
  const stripped = raw.replace(NAME_INTRO_PREFIX_RE, '').trim()
  const cleaned = stripped.replace(/[.,!?;:"'\s]+$/g, '').trim()
  return cleaned.length >= 2 ? cleaned : raw
}

export function isLikelyFullNameAnswer(text: string): boolean {
  const original = String(text || '').trim()
  if (!original) return false
  // Se o texto é INTEIRAMENTE consumido por um prefixo de introdução
  // ("Me llamo", "Meu nome é", "My name is") sem qualquer nome depois,
  // NÃO é um nome válido — evita que "Me llamo" (2 palavras) passe
  // no cheque de "≥2 palavras alfa".
  const strippedRaw = original.replace(NAME_INTRO_PREFIX_RE, '').replace(/[.,!?;:"'\s]+$/g, '').trim()
  if (strippedRaw.length === 0) return false
  // Avalia também a versão sem prefixo de introdução, p/ aceitar
  // "Me llamo Pedro Henrique Rodrigues" como nome válido sem cair no
  // bloqueio de FIRST_PERSON_VERB_RE (que pegaria "soy/sou/am").
  const stripped = stripNameIntroPrefix(original)
  const candidates = stripped && stripped !== original ? [stripped, original] : [original]
  for (const raw of candidates) {
    const normalized = normalizeForLanguageChecks(raw)
    if (!raw || raw.length > 90 || normalized.includes('?')) continue
    if (hasValidEmail(raw) || isPotentialEntryDateAnswer(raw)) continue
    if (/^(ok|okay|vale|valeu|sim|si|sí|s|yes|no|não|nao|claro|certo|perfeito|obrigad[oa]|gracias)$/i.test(normalized)) continue
    if (NAME_REFUSAL_PATTERNS.some((re) => re.test(raw) || re.test(normalized))) continue
    if (FIRST_PERSON_VERB_RE.test(raw) || FIRST_PERSON_VERB_RE.test(normalized)) continue
    if (FULL_NAME_DENYLIST_PATTERNS.some((re) => re.test(raw) || re.test(normalized))) continue
    const words = raw.split(/\s+/).filter(Boolean)
    const alphaWords = words.filter((word) => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(word))
    if (alphaWords.length >= 2) return true
  }
  return false
}

export function isNameRefusal(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false
  const normalized = normalizeForLanguageChecks(raw)
  return NAME_REFUSAL_PATTERNS.some((re) => re.test(raw) || re.test(normalized))
}

export function isEmailRefusal(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return false
  const normalized = normalizeForLanguageChecks(raw)
  // Reusa padrões de recusa (são genéricos: "não tenho", "no tengo", etc.).
  return NAME_REFUSAL_PATTERNS.some((re) => re.test(raw) || re.test(normalized))
}

export function findExplicitFullNameAnswer(
  conversationHistory: Array<{ role: string; content: string }>,
): string | null {
  for (let i = 0; i < conversationHistory.length - 1; i++) {
    const assistantMessage = conversationHistory[i]
    if (assistantMessage.role !== 'assistant' || !isQuestionAboutFullName(assistantMessage.content)) continue

    for (let j = i + 1; j < conversationHistory.length; j++) {
      const userMessage = conversationHistory[j]
      if (userMessage.role === 'assistant') break
      if (userMessage.role === 'user' && isLikelyFullNameAnswer(userMessage.content)) {
        return stripNameIntroPrefix(userMessage.content.trim())
      }
    }
  }

  return null
}
