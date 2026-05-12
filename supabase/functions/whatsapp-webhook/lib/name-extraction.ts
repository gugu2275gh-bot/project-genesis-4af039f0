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
  /^\d/,
]

export function isLikelyFullNameAnswer(text: string): boolean {
  const raw = text.trim()
  const normalized = normalizeForLanguageChecks(raw)
  if (!raw || raw.length > 90 || normalized.includes('?')) return false
  if (hasValidEmail(raw) || isPotentialEntryDateAnswer(raw)) return false
  if (/^(ok|okay|vale|valeu|sim|si|sí|s|yes|no|não|nao|claro|certo|perfeito|obrigad[oa]|gracias)$/i.test(normalized)) return false
  if (FULL_NAME_DENYLIST_PATTERNS.some((re) => re.test(raw) || re.test(normalized))) return false
  const words = raw.split(/\s+/).filter(Boolean)
  const alphaWords = words.filter((word) => /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(word))
  return alphaWords.length >= 2
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
        return userMessage.content.trim()
      }
    }
  }

  return null
}
