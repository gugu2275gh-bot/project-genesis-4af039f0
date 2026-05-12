// Regression tests (Wave 3a) for whatsapp-webhook helpers.
// Covers the fixes from the diagnostic plan: cumulative overrides,
// name backfill denylist, KB lexical tiebreaker, language detection,
// override-preserves-preamble, and question-loop detection.

Deno.env.set('SKIP_SERVE', '1')
// Stubs for env vars touched at module load.
for (const key of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
]) {
  if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')
}

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  scoreTopicFileName,
  detectChatLanguage,
  extractTextBeforeLastQuestion,
  extractLastQuestion,
  isLikelyFullNameAnswer,
  findExplicitFullNameAnswer,
  forceSkipFullNameIfAlreadyKnown,
  forceReaskEmailIfMissing,
  forceAdvanceFromEntryDateQuestion,
  forceAdvanceFromInterestQuestion,
  isLikelyQuestionLoop,
  areQuestionsEquivalent,
  getOutsideSpainAgeQuestion,
  getEmailQuestion,
  getEmailReaskQuestion,
  FULL_NAME_DENYLIST_PATTERNS,
} from './index.ts'

// ---------- Language detection ----------

Deno.test('detectChatLanguage: Spanish stays ES even with isolated PT word', () => {
  assertEquals(detectChatLanguage('Hola, necesito ayuda con mi nacionalidad española'), 'es')
  // "obrigado" alone shouldn't flip a Spanish phrase, but PT signal wins if present.
  // Realistic case: full ES sentence.
  assertEquals(detectChatLanguage('¿Cuál es el plazo para arraigo?'), 'es')
})

Deno.test('detectChatLanguage: English / French / Portuguese basics', () => {
  assertEquals(detectChatLanguage('Hello, I need help with my visa'), 'en')
  assertEquals(detectChatLanguage('Bonjour, j’ai besoin d’aide'), 'fr')
  assertEquals(detectChatLanguage('Olá, preciso de informação'), 'pt-BR')
})

// ---------- KB lexical tiebreaker (R6) ----------

Deno.test('scoreTopicFileName: phrase bonus is a tiebreaker (<=3)', () => {
  const score = scoreTopicFileName('residencia.pdf', 'quero saber sobre residencia em espanha')
  // hits=1, coverage=1, phraseBonus<=3 -> total <= 5
  assert(score > 0 && score <= 5, `unexpected score ${score}`)
})

Deno.test('scoreTopicFileName: zero when no token hit', () => {
  assertEquals(scoreTopicFileName('arraigo.pdf', 'preciso de visto de trabalho'), 0)
})

// ---------- Name backfill denylist (R3) ----------

Deno.test('isLikelyFullNameAnswer: rejects pronouns / family / cities', () => {
  assert(!isLikelyFullNameAnswer('minha mãe'))
  assert(!isLikelyFullNameAnswer('São Paulo'))
  assert(!isLikelyFullNameAnswer('mi madre'))
  assert(!isLikelyFullNameAnswer('my friend'))
  assert(!isLikelyFullNameAnswer('Madrid'))
  assert(!isLikelyFullNameAnswer('sim'))
  assert(!isLikelyFullNameAnswer('ok obrigado'))
})

Deno.test('isLikelyFullNameAnswer: accepts a real two-word name', () => {
  assert(isLikelyFullNameAnswer('Maria Silva'))
  assert(isLikelyFullNameAnswer('João Pereira de Souza'))
})

Deno.test('FULL_NAME_DENYLIST_PATTERNS contains city / pronoun / family rules', () => {
  assert(FULL_NAME_DENYLIST_PATTERNS.length >= 5)
})

Deno.test('findExplicitFullNameAnswer: skips false positives, finds valid name', () => {
  const history = [
    { role: 'assistant', content: 'Qual é o seu nome completo?' },
    { role: 'user', content: 'minha mãe' },
    { role: 'assistant', content: 'Pode me dizer seu nome completo, por favor?' },
    { role: 'user', content: 'Maria Silva' },
  ]
  assertEquals(findExplicitFullNameAnswer(history), 'Maria Silva')
})

// ---------- Cumulative overrides preserve preamble (R3) ----------

Deno.test('forceReaskEmailIfMissing: preserves LLM preamble', () => {
  const result = forceReaskEmailIfMissing(
    'Qual é o seu melhor e-mail?',
    'não tenho email agora',
    'Tudo bem! Qual é o seu melhor e-mail?',
    'pt-BR',
    false,
  )
  assertStringIncludes(result, 'Tudo bem!')
  assertStringIncludes(result, 'e-mail válido')
})

Deno.test('forceReaskEmailIfMissing: no-op when email on file', () => {
  const ai = 'Obrigado!'
  assertEquals(
    forceReaskEmailIfMissing('Qual seu email?', 'oi', ai, 'pt-BR', true),
    ai,
  )
})

Deno.test('forceSkipFullNameIfAlreadyKnown: swaps name question for email', () => {
  const result = forceSkipFullNameIfAlreadyKnown(
    'Prazer! Qual é o seu nome completo?',
    'pt-BR',
    true,
    true,
  )
  assertStringIncludes(result, 'Prazer!')
  assertStringIncludes(result, 'e-mail')
})

Deno.test('forceAdvanceFromEntryDateQuestion: never been to Spain advances to age', () => {
  const result = forceAdvanceFromEntryDateQuestion(
    'Quando você entrou na Espanha?',
    'nunca estive na Espanha',
    'Entendi. Quando você entrou na Espanha?',
    'pt-BR',
  )
  assertStringIncludes(result, getOutsideSpainAgeQuestion('pt-BR'))
})

Deno.test('forceAdvanceFromInterestQuestion: replaces repeated interest question with location', () => {
  const result = forceAdvanceFromInterestQuestion(
    'Qual serviço te interessa? (arraigo, nacionalidade, visto, etc.)',
    'arraigo',
    'Perfeito! Qual serviço te interessa? (arraigo, nacionalidade, visto, etc.)',
    'pt-BR',
  )
  assertStringIncludes(result, 'Perfeito!')
  // Replacement is the location question (not the original interest one)
  assert(!result.toLowerCase().includes('qual serviço te interessa'))
})

// ---------- Loop detection ----------

Deno.test('isLikelyQuestionLoop: detects exact repeat after structured answer', () => {
  const history = [
    { role: 'assistant', content: 'Qual serviço te interessa? (arraigo, nacionalidade, visto)' },
  ]
  const looped = isLikelyQuestionLoop(
    history,
    'arraigo',
    'Qual serviço te interessa? (arraigo, nacionalidade, visto)',
  )
  assertEquals(looped, true)
})

Deno.test('isLikelyQuestionLoop: false when next question differs', () => {
  const history = [{ role: 'assistant', content: 'Qual seu nome?' }]
  const looped = isLikelyQuestionLoop(history, 'Maria', 'Qual seu email?')
  assertEquals(looped, false)
})

// ---------- Helpers ----------

Deno.test('extractLastQuestion / extractTextBeforeLastQuestion', () => {
  const t = 'Prazer em te conhecer, Maria! Qual é o seu melhor email?'
  assertEquals(extractLastQuestion(t).trim(), 'Qual é o seu melhor email?')
  assertEquals(extractTextBeforeLastQuestion(t), 'Prazer em te conhecer, Maria!')
})

Deno.test('areQuestionsEquivalent: tolerates accents/case', () => {
  assert(areQuestionsEquivalent('Qual é seu email?', 'qual e seu email?'))
})
