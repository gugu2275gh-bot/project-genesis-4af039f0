// @ts-nocheck
import { assert, assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { classifyOffTopic, getOffTopicAckPhrase } from './lib/offtopic.ts'
import { normalizeQueue, pushPending, getReplayPreamble } from './lib/parking.ts'

const Q_NAME = 'Qual seu nome completo?'
const Q_EMAIL = 'Qual seu melhor e-mail?'
const Q_LOC = 'Hoje você já está na Espanha?'
const Q_AGE = 'Qual sua idade?'
const Q_INT = 'Me conta com calma, o que você busca hoje?'

Deno.test('classify: gateInactive sempre retorna null', () => {
  assertEquals(classifyOffTopic('Quanto custa?', Q_LOC, { collectionGateActive: false }), null)
})

Deno.test('classify: resposta válida (sim/não) para localização → null', () => {
  assertEquals(classifyOffTopic('Sim', Q_LOC, { collectionGateActive: true }), null)
  assertEquals(classifyOffTopic('Não', Q_LOC, { collectionGateActive: true }), null)
})

Deno.test('classify: idade numérica curta → null', () => {
  assertEquals(classifyOffTopic('32', Q_AGE, { collectionGateActive: true }), null)
})

Deno.test('classify: nome válido em pergunta de nome → null', () => {
  assertEquals(classifyOffTopic('Gustavo Braga', Q_NAME, { collectionGateActive: true }), null)
})

Deno.test('classify: email válido em pergunta de email → null', () => {
  assertEquals(classifyOffTopic('foo@bar.com', Q_EMAIL, { collectionGateActive: true }), null)
})

Deno.test('classify: recusa de email → null (delegado ao guard)', () => {
  assertEquals(classifyOffTopic('Não tenho email', Q_EMAIL, { collectionGateActive: true }), null)
})

Deno.test('classify: pergunta factual durante cadastro → question', () => {
  const r = classifyOffTopic('Quanto custa o processo?', Q_LOC, { collectionGateActive: true })
  assertEquals(r?.kind, 'question')
})

Deno.test('classify: pedido "Quero fazer um curso" durante cadastro → request', () => {
  const r = classifyOffTopic('Quero fazer um curso de idiomas', Q_LOC, { collectionGateActive: true })
  assertEquals(r?.kind, 'request')
})

Deno.test('classify: "Necesito ayuda con visado" → request (es)', () => {
  const r = classifyOffTopic('Necesito ayuda con un visado de estudios', Q_LOC, { collectionGateActive: true })
  assertEquals(r?.kind, 'request')
})

Deno.test('classify: "I need help with my visa" → request (en)', () => {
  const r = classifyOffTopic('I need help with my student visa', Q_LOC, { collectionGateActive: true })
  assertEquals(r?.kind, 'request')
})

Deno.test('classify: interesse válido durante pergunta de interesse → null', () => {
  assertEquals(classifyOffTopic('Cidadania', Q_INT, { collectionGateActive: true }), null)
})

Deno.test('queue: push respeita cap e dedup', () => {
  let q: any[] = []
  for (let i = 0; i < 12; i++) q = pushPending(q, { text: `q${i}`, kind: 'question' })
  assertEquals(q.length, 10)
  // dedup do último
  const before = q.length
  q = pushPending(q, { text: 'q11', kind: 'question' })
  assertEquals(q.length, before)
})

Deno.test('queue: normalizeQueue rejeita lixo', () => {
  const q = normalizeQueue([{ text: 'ok', ts: 'x', kind: 'question' }, {}, null, { kind: 'request' }, { text: '   ', kind: 'request' }])
  assertEquals(q.length, 1)
  assertEquals(q[0].text, 'ok')
})

Deno.test('ack phrase localizado pt/es/en/fr', () => {
  assert(getOffTopicAckPhrase('pt-BR').includes('Anotado'))
  assert(getOffTopicAckPhrase('es').toLowerCase().includes('anotado'))
  assert(getOffTopicAckPhrase('en').toLowerCase().includes('noted'))
  assert(getOffTopicAckPhrase('fr').toLowerCase().includes('not'))
})

Deno.test('replay preamble localizado pt/es/en/fr', () => {
  assert(getReplayPreamble('pt-BR').toLowerCase().includes('como prometido'))
  assert(getReplayPreamble('es').toLowerCase().includes('como promet'))
  assert(getReplayPreamble('en').toLowerCase().includes('as promised'))
  assert(getReplayPreamble('fr').toLowerCase().includes('comme promis'))
})
