// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  isLikelyFullNameAnswer,
  isNameRefusal,
  isEmailRefusal,
} from './lib/name-extraction.ts'
import {
  forceReaskFullNameIfSingleWord,
  forceReaskEmailIfMissing,
  stripLockedSentinel,
} from './lib/overrides.ts'

const NAME_Q_PT = 'Qual é o seu nome completo?'
const NAME_Q_ES = '¿Cuál es tu nombre completo?'
const NAME_Q_EN = 'What is your full name?'
const NAME_Q_FR = 'Quel est votre nom complet ?'
const EMAIL_Q_PT = 'Qual é o seu melhor e-mail?'
const EMAIL_Q_ES = '¿Cuál es tu mejor email?'
const EMAIL_Q_EN = 'What is your best email?'

Deno.test('refusal: "Não tenho nome" não é nome', () => {
  assertEquals(isLikelyFullNameAnswer('Não tenho nome'), false)
  assert(isNameRefusal('Não tenho nome'))
})

Deno.test('refusal multi-lang não é nome', () => {
  for (const t of ['No tengo nombre', "I don't have a name", "Je n'ai pas de nom", 'sin nombre', 'sem nome', 'prefiro não dizer']) {
    assertEquals(isLikelyFullNameAnswer(t), false, `should reject: ${t}`)
  }
})

Deno.test('frase com verbo 1ª pessoa não é nome', () => {
  assertEquals(isLikelyFullNameAnswer('quero falar com alguém'), false)
  assertEquals(isLikelyFullNameAnswer('preciso de ajuda urgente'), false)
})

Deno.test('nome legítimo continua aceito', () => {
  assert(isLikelyFullNameAnswer('Gustavo Braga'))
  assert(isLikelyFullNameAnswer('Maria da Silva Santos'))
  assert(isLikelyFullNameAnswer('João Tenório'))
})

Deno.test('reask FIRME quando recusa de nome (pt)', () => {
  const out = forceReaskFullNameIfSingleWord(NAME_Q_PT, 'Não tenho nome', 'Ok, vou seguir.', 'pt', false)
  const clean = stripLockedSentinel(out)
  assert(clean.includes('preciso do seu nome completo') || clean.includes('nome e sobrenome'), `got: ${clean}`)
})

Deno.test('reask FIRME quando recusa de nome (es/en/fr)', () => {
  const cases: Array<[string, string, string, string]> = [
    ['es', NAME_Q_ES, 'No tengo nombre', 'necesito tu nombre completo'],
    ['en', NAME_Q_EN, "I don't have a name", 'need your full name'],
    ['fr', NAME_Q_FR, "Je n'ai pas de nom", 'besoin de votre nom complet'],
  ]
  for (const [lang, q, ans, needle] of cases) {
    const out = stripLockedSentinel(forceReaskFullNameIfSingleWord(q, ans, 'qualquer coisa', lang as any, false))
    assert(out.toLowerCase().includes(needle.toLowerCase()), `${lang} got: ${out}`)
  }
})

Deno.test('reask FIRME quando frase sem ser nome', () => {
  const out = stripLockedSentinel(forceReaskFullNameIfSingleWord(NAME_Q_PT, 'quero atendimento agora', 'Ok!', 'pt', false))
  assert(out.includes('preciso do seu nome completo'), `got: ${out}`)
})

Deno.test('nome válido NÃO dispara reask', () => {
  const ai = 'Obrigado, Gustavo! Qual seu melhor e-mail?'
  const out = forceReaskFullNameIfSingleWord(NAME_Q_PT, 'Gustavo Braga', ai, 'pt', false)
  assertEquals(out, ai)
})

Deno.test('email refusal dispara reask FIRME', () => {
  const out = stripLockedSentinel(forceReaskEmailIfMissing(EMAIL_Q_PT, 'Não tenho email', 'Ok!', 'pt', false))
  assert(out.includes('Preciso de'), `got: ${out}`)
  assert(out.includes('e-mail válido'))
})

Deno.test('email válido NÃO dispara reask', () => {
  const ai = 'Perfeito, recebi.'
  const out = forceReaskEmailIfMissing(EMAIL_Q_PT, 'foo@bar.com', ai, 'pt', false)
  assertEquals(out, ai)
})

Deno.test('email reask FIRME multi-lang', () => {
  const cases: Array<[string, string, string, string]> = [
    ['es', EMAIL_Q_ES, 'No tengo email', 'correo electrónico válido'],
    ['en', EMAIL_Q_EN, "I don't have an email", 'valid email address'],
  ]
  for (const [lang, q, ans, needle] of cases) {
    const out = stripLockedSentinel(forceReaskEmailIfMissing(q, ans, 'x', lang as any, false))
    assert(out.toLowerCase().includes(needle.toLowerCase()), `${lang} got: ${out}`)
  }
})
