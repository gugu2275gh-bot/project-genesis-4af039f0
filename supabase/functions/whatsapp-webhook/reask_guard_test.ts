// Verifica o anti re-ask universal: bolhas que pedem campo já capturado
// são removidas; quando o campo não foi capturado, a bolha passa intacta.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { findReAskField, stripReAskOfCapturedFields, type CapturedSnapshot } from './lib/offtopic.ts'

const allCaptured: CapturedSnapshot = {
  fullName: true, email: true, phone: true, interest: true,
  locationSpain: true, entryDate: true, empadronamientoCity: true, age: true,
}

Deno.test('findReAskField detecta nome em 4 idiomas quando já capturado', () => {
  assertEquals(findReAskField('Qual é o seu nome completo?', allCaptured), 'fullName')
  assertEquals(findReAskField('¿Cuál es tu nombre?', allCaptured), 'fullName')
  assertEquals(findReAskField("What's your full name?", allCaptured), 'fullName')
  assertEquals(findReAskField('Quel est votre nom?', allCaptured), 'fullName')
})

Deno.test('findReAskField detecta e-mail em 4 idiomas', () => {
  assertEquals(findReAskField('Qual é o seu melhor e-mail?', allCaptured), 'email')
  assertEquals(findReAskField('¿Cuál es tu mejor correo?', allCaptured), 'email')
  assertEquals(findReAskField("What's your best email?", allCaptured), 'email')
  assertEquals(findReAskField('Quel est votre meilleur e-mail?', allCaptured), 'email')
})

Deno.test('findReAskField detecta localização Espanha, data, cidade, idade', () => {
  assertEquals(findReAskField('Você está na Espanha?', allCaptured), 'locationSpain')
  assertEquals(findReAskField('Quando você entrou na Espanha?', allCaptured), 'entryDate')
  assertEquals(findReAskField('Em que cidade você está empadronado?', allCaptured), 'empadronamientoCity')
  assertEquals(findReAskField('Qual é a sua idade?', allCaptured), 'age')
})

Deno.test('findReAskField NÃO marca quando o campo ainda não foi capturado', () => {
  const none: CapturedSnapshot = {}
  assertEquals(findReAskField('Qual é o seu nome?', none), null)
  assertEquals(findReAskField("What's your email?", none), null)
})

Deno.test('findReAskField não tem falso-positivo em frases neutras', () => {
  assertEquals(findReAskField('Obrigado pelo seu e-mail, vou anotar.', allCaptured), null)
  assertEquals(findReAskField('Recebi seu nome, perfeito.', allCaptured), null)
})

Deno.test('stripReAskOfCapturedFields remove bolha com |||', () => {
  const input = 'Obrigado pelas informações.|||Qual é o seu nome completo?|||Vamos seguir.'
  const out = stripReAskOfCapturedFields(input, allCaptured)
  assertEquals(out.removed, ['fullName'])
  assert(!/seu nome completo/i.test(out.text))
  assert(/Vamos seguir/.test(out.text))
})

Deno.test('stripReAskOfCapturedFields remove múltiplas bolhas', () => {
  const input = 'Qual é o seu nome?|||Qual é o seu melhor e-mail?|||Você está na Espanha?'
  const out = stripReAskOfCapturedFields(input, allCaptured)
  assertEquals(out.removed.length, 3)
})

Deno.test('stripReAskOfCapturedFields preserva texto quando nada foi capturado', () => {
  const input = 'Qual é o seu nome?|||Qual serviço busca?'
  const out = stripReAskOfCapturedFields(input, {})
  assertEquals(out.removed.length, 0)
  assertEquals(out.text, input)
})
