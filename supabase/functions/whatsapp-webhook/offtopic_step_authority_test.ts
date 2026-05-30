// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyOffTopic, isFactualQuestion, isValidAnswerForStep } from './lib/offtopic.ts'

const ctx = { collectionGateActive: true }
const Q_EMAIL = 'Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?'
const Q_NOME = 'Antes de tudo, como é seu nome completo?'

Deno.test('Roberto: "O quê é TIE" na etapa email → off-topic question', () => {
  assertEquals(isFactualQuestion('O quê é TIE'), true)
  assertEquals(isValidAnswerForStep('O quê é TIE', 'email', Q_EMAIL), false)
  const r = classifyOffTopic('O quê é TIE', Q_EMAIL, { ...ctx, currentStep: 'email' })
  assertEquals(r?.kind, 'question')
})

Deno.test('etapa email: "residencia" sem ser pergunta → off-topic (não é e-mail nem recusa)', () => {
  const r = classifyOffTopic('residencia', Q_EMAIL, { ...ctx, currentStep: 'email' })
  assertEquals(r?.kind, 'request')
})

Deno.test('etapa email: "Sim" → off-topic (não é e-mail)', () => {
  const r = classifyOffTopic('Sim', Q_EMAIL, { ...ctx, currentStep: 'email' })
  assertEquals(r?.kind, 'request')
})

Deno.test('etapa email: e-mail válido → não parqueia', () => {
  const r = classifyOffTopic('cliente@email.com', Q_EMAIL, { ...ctx, currentStep: 'email' })
  assertEquals(r, null)
})

Deno.test('etapa nome: "O que é TIE" → off-topic question (não vira nome)', () => {
  const r = classifyOffTopic('O que é TIE', Q_NOME, { ...ctx, currentStep: 'nome' })
  assertEquals(r?.kind, 'question')
})

Deno.test('etapa nome: "Roberto Barros" → válido', () => {
  const r = classifyOffTopic('Roberto Barros', Q_NOME, { ...ctx, currentStep: 'nome' })
  assertEquals(r, null)
})

Deno.test('etapa interesse: "Residencia" → válido', () => {
  const r = classifyOffTopic('Residencia', 'Me conta com calma: o que você busca hoje?', { ...ctx, currentStep: 'interesse' })
  assertEquals(r, null)
})

Deno.test('etapa interesse: "O que é TIE" → off-topic question', () => {
  const r = classifyOffTopic('O que é TIE', 'Me conta com calma: o que você busca hoje?', { ...ctx, currentStep: 'interesse' })
  assertEquals(r?.kind, 'question')
})

Deno.test('multi-idioma: "Que es tie", "What is TIE", "Qu\'est-ce que le TIE" detectados', () => {
  assertEquals(isFactualQuestion('Que es tie'), true)
  assertEquals(isFactualQuestion('Que és tie'), true)
  assertEquals(isFactualQuestion('What is TIE'), true)
  assertEquals(isFactualQuestion("Qu'est-ce que le TIE"), true)
})
