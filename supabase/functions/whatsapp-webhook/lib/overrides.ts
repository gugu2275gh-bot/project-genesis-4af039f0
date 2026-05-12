// @ts-nocheck
// Wave 3b step 6: response overrides (skip name, reask email, advance flow, loop)
import { type ChatLanguage } from './language.ts'
import { extractLastQuestion, extractTextBeforeLastQuestion, areQuestionsEquivalent } from './text-utils.ts'
import {
  isQuestionAboutFullName,
  isQuestionAboutEmail,
  isQuestionAboutSpainEntryDate,
  isQuestionAboutInterest,
  isNeverBeenToSpainAnswer,
  isPotentialEntryDateAnswer,
  isPotentialInterestAnswer,
  isStructuredQuestionAnswer,
  looksLikeIncompleteEntryDateWithoutYear,
  hasValidEmail,
  getEmailQuestion,
  getEmailReaskQuestion,
  getEntryDateNeedsYearQuestion,
  getOutsideSpainAgeQuestion,
  getEmpadronadoQuestion,
  getLocationQuestion,
} from './questions.ts'

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
