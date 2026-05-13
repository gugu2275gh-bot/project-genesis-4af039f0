// Wave 3a regression tests for whatsapp-webhook helpers.
// Skips serve() bootstrap so we can import pure functions without binding a port.

Deno.env.set('SKIP_SERVE', '1')
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

Deno.test('detectChatLanguage: Spanish stays ES', () => {
  assertEquals(detectChatLanguage('Hola, necesito ayuda con mi nacionalidad española'), 'es')
  assertEquals(detectChatLanguage('¿Cuál es el plazo para arraigo?'), 'es')
})

Deno.test('detectChatLanguage: EN / FR / PT-BR basics', () => {
  assertEquals(detectChatLanguage('Hello, I need help with my visa'), 'en')
  assertEquals(detectChatLanguage('Bonjour, j’ai besoin d’aide'), 'fr')
  assertEquals(detectChatLanguage('Olá, preciso de informação'), 'pt-BR')
})

// ---------- KB lexical tiebreaker (R6) ----------

Deno.test('scoreTopicFileName: phrase bonus is small (tiebreaker)', () => {
  const score = scoreTopicFileName('residencia.pdf', 'quero saber sobre residencia em espanha')
  assert(score > 0 && score <= 5, `unexpected score ${score}`)
})

Deno.test('scoreTopicFileName: zero when no token hit', () => {
  assertEquals(scoreTopicFileName('arraigo.pdf', 'preciso de visto de trabalho'), 0)
})

// ---------- Name backfill denylist (R3) ----------

Deno.test('isLikelyFullNameAnswer: rejects pronouns / family / cities', () => {
  assert(!isLikelyFullNameAnswer('minha mãe'), 'minha mãe')
  assert(!isLikelyFullNameAnswer('São Paulo'), 'São Paulo')
  assert(!isLikelyFullNameAnswer('mi madre'), 'mi madre')
  assert(!isLikelyFullNameAnswer('my friend'), 'my friend')
  assert(!isLikelyFullNameAnswer('Madrid'), 'Madrid')
  assert(!isLikelyFullNameAnswer('sim'), 'sim')
})

Deno.test('isLikelyFullNameAnswer: accepts a real two-word name', () => {
  assert(isLikelyFullNameAnswer('Maria Silva'))
  assert(isLikelyFullNameAnswer('João Pereira de Souza'))
})

Deno.test('FULL_NAME_DENYLIST_PATTERNS not empty', () => {
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

// ---------- Cumulative overrides (R3) preserve preamble ----------
// extractLastQuestion uses /[^?\n]*\?/g — preamble is only preserved when
// separated from the question by a newline (or another '?').

Deno.test('forceReaskEmailIfMissing: preserves preamble across newline', () => {
  const result = forceReaskEmailIfMissing(
    'Qual é o seu melhor e-mail?',
    'não tenho email agora',
    'Tudo bem!\nQual é o seu melhor e-mail?',
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

Deno.test('forceReaskEmailIfMissing: no-op when current message has valid email', () => {
  const ai = 'Recebi!'
  assertEquals(
    forceReaskEmailIfMissing('Qual seu melhor email?', 'maria@x.com', ai, 'pt-BR', false),
    ai,
  )
})

Deno.test('forceSkipFullNameIfAlreadyKnown: swaps name question for email when missing', () => {
  const result = forceSkipFullNameIfAlreadyKnown(
    'Prazer em te conhecer!\nQual é o seu nome completo?',
    'pt-BR',
    true,
    true,
  )
  assertStringIncludes(result, 'Prazer em te conhecer!')
  assertStringIncludes(result, getEmailQuestion('pt-BR'))
})

Deno.test('forceSkipFullNameIfAlreadyKnown: drops question entirely when email also known', () => {
  const result = forceSkipFullNameIfAlreadyKnown(
    'Prazer!\nQual é o seu nome completo?',
    'pt-BR',
    true,
    false,
  )
  assertEquals(result.trim(), 'Prazer!')
})

Deno.test('forceAdvanceFromEntryDateQuestion: never-been-to-Spain advances to age', () => {
  const result = forceAdvanceFromEntryDateQuestion(
    'Qual a data exata da sua entrada na Espanha?',
    'nunca estive na Espanha',
    'Entendi.\nQual a data exata da sua entrada na Espanha?',
    'pt-BR',
  )
  assertStringIncludes(result, getOutsideSpainAgeQuestion('pt-BR'))
  assertStringIncludes(result, 'Entendi.')
})

Deno.test('forceAdvanceFromInterestQuestion: D1 Bizagi — injects services list (Msg 6) before location', () => {
  const result = forceAdvanceFromInterestQuestion(
    'O que você busca hoje?',
    'arraigo',
    'Perfeito!\nO que você busca hoje?',
    'pt-BR',
    '', // transcript vazio → ainda não enviou Msg 6
  )
  assertStringIncludes(result, 'Perfeito!')
  // Msg 6: serviços atendidos antes de pedir localização
  assertStringIncludes(result, 'arraigo')
  assertStringIncludes(result, 'reagrupamento')
  assert(!/o que voc[eê] busca hoje/i.test(result), 'should not still ask about interest')
  assert(!/já está na Espanha/i.test(result), 'should NOT yet ask location — services first')
})

Deno.test('forceAdvanceFromInterestQuestion: D1 Bizagi — after services sent, advances to location', () => {
  const transcript = 'Na CB trabalhamos com: residência (NIE/TIE), nacionalidade espanhola, arraigo (social, laboral, familiar, formação), reagrupamento familiar, homologação de diploma e autorização de regresso.'
  const result = forceAdvanceFromInterestQuestion(
    'O que você busca hoje?',
    'arraigo',
    'Perfeito!\nO que você busca hoje?',
    'pt-BR',
    transcript,
  )
  assertStringIncludes(result, 'já está na Espanha')
})

// ---------- Loop detection ----------

Deno.test('isLikelyQuestionLoop: detects exact repeat after structured answer', () => {
  const history = [{ role: 'assistant', content: 'O que você busca hoje?' }]
  const looped = isLikelyQuestionLoop(history, 'arraigo', 'O que você busca hoje?')
  assertEquals(looped, true)
})

Deno.test('isLikelyQuestionLoop: false when next question differs', () => {
  const history = [{ role: 'assistant', content: 'Qual seu nome?' }]
  const looped = isLikelyQuestionLoop(history, 'Maria', 'Qual seu email?')
  assertEquals(looped, false)
})

// ---------- Helpers ----------

Deno.test('extractLastQuestion / extractTextBeforeLastQuestion (newline-separated)', () => {
  const t = 'Prazer em te conhecer, Maria!\nQual é o seu melhor email?'
  assertEquals(extractLastQuestion(t).trim(), 'Qual é o seu melhor email?')
  assertEquals(extractTextBeforeLastQuestion(t), 'Prazer em te conhecer, Maria!')
})

Deno.test('areQuestionsEquivalent: tolerates accents/case', () => {
  assert(areQuestionsEquivalent('Qual é seu email?', 'qual e seu email?'))
})
