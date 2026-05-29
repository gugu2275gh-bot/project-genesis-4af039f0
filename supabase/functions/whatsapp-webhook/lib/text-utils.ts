// Pure text utilities: search normalization, question splitting, equivalence.
// Extracted from index.ts (Wave 3b, step 2). No DB / network dependencies.

import { normalizeForLanguageChecks } from './language.ts'

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

export const SEARCH_STOPWORDS = new Set([
  'ok', 'pdf', 'para', 'por', 'com', 'sem', 'uma', 'das', 'dos', 'de', 'da', 'do', 'del', 'el', 'la',
  'desde', 'pais', 'origem', 'mais', 'menos', 'ano', 'anos', 'todas', 'todo', 'toda', 'sobre',
  'queria', 'quero', 'gostaria', 'saber', 'como', 'dar', 'entrada', 'informacao', 'informacoes',
])

export function meaningfulSearchTokens(text: string): string[] {
  return normalizeForSearch(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SEARCH_STOPWORDS.has(token))
}

export function compactSearchText(text: string): string {
  return meaningfulSearchTokens(text).join(' ')
}

export function extractLastQuestion(text: string): string {
  const matches = text.match(/[^?\n]*\?/g)
  const segments = matches?.map((item) => item.trim()).filter(Boolean) || []
  if (segments.length === 0) return ''
  // Prefer the last segment that looks like a real question:
  // contains "¿" OR ends with "?" without a "." immediately before (e.g. avoids "(ejemplo: 22/05/2025).?").
  const looksLikeRealQuestion = (s: string) => /¿/.test(s) || !/\.\s*\?$/.test(s)
  for (let i = segments.length - 1; i >= 0; i--) {
    if (looksLikeRealQuestion(segments[i])) return segments[i]
  }
  return segments.at(-1) || ''
}

export function extractTextBeforeLastQuestion(text: string): string {
  const lastQuestion = extractLastQuestion(text)
  if (!lastQuestion) return text.trim()

  const questionIndex = text.lastIndexOf(lastQuestion)
  if (questionIndex === -1) return text.trim()

  return text.slice(0, questionIndex).trim()
}

export function areQuestionsEquivalent(first: string, second: string): boolean {
  const normalizedFirst = normalizeForLanguageChecks(first)
  const normalizedSecond = normalizeForLanguageChecks(second)

  if (!normalizedFirst || !normalizedSecond) return false

  return normalizedFirst === normalizedSecond
    || normalizedFirst.includes(normalizedSecond)
    || normalizedSecond.includes(normalizedFirst)
}

export function removeRepeatedQuestionIntro(
  previousAssistantMessage: string,
  aiResponse: string,
): string {
  // Honra o sentinel anti-clobber definido em overrides.ts
  if (typeof aiResponse === 'string' && aiResponse.includes('\u200B[LOCKED]\u200B')) return aiResponse
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!previousQuestion || !nextQuestion || areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    return aiResponse
  }

  const previousIntro = extractTextBeforeLastQuestion(previousAssistantMessage)
  const nextIntro = extractTextBeforeLastQuestion(aiResponse)

  if (!previousIntro || !nextIntro) return aiResponse

  if (!areQuestionsEquivalent(previousIntro, nextIntro)) return aiResponse

  return aiResponse.slice(aiResponse.lastIndexOf(nextQuestion)).trim()
}
