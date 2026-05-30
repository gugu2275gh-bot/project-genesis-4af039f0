import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { classifyOffTopic } from './lib/offtopic.ts'

const ctx = { collectionGateActive: true }

Deno.test('sem pergunta corrente: nome completo NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('Gustavo Braga', null, ctx), null)
  assertEquals(classifyOffTopic('Gustavo Braga', '', ctx), null)
})

Deno.test('sem pergunta corrente: e-mail NÃO é parqueado', () => {
  assertEquals(classifyOffTopic('gustavo@gmail.com', null, ctx), null)
})

Deno.test('sem pergunta corrente: data NÃO é parqueada', () => {
  assertEquals(classifyOffTopic('01/01/2016', null, ctx), null)
})

Deno.test('sem pergunta corrente: cidade espanhola NÃO é parqueada', () => {
  assertEquals(classifyOffTopic('Madrid', null, ctx), null)
})

Deno.test('sem pergunta corrente: pergunta explícita ainda é parqueada', () => {
  const r = classifyOffTopic('Como funciona o NIE?', null, ctx)
  assertEquals(r?.kind, 'question')
})

Deno.test('com pergunta corrente: nome em momento inesperado não é parqueado', () => {
  // Mesmo com bot tendo perguntado outra coisa, "Gustavo Braga" não vira off-topic.
  assertEquals(classifyOffTopic('Gustavo Braga', 'Você está na Espanha?', ctx), null)
})

Deno.test('com pergunta corrente: e-mail em momento inesperado não é parqueado', () => {
  assertEquals(classifyOffTopic('gustavo@gmail.com', 'Você está na Espanha?', ctx), null)
})
