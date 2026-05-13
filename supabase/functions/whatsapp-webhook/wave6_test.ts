// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { isQuestionAboutInterest, isPotentialInterestAnswer } from './lib/questions.ts'
import { computeDeterministicFunnelPatch } from './lib/overrides.ts'

const ES_Q = 'Cuéntame con calma: ¿qué buscas hoy? Puede ser nacionalidad, residencia, estudios, arraigo o algún documento específico.'

Deno.test('isQuestionAboutInterest matches ES "qué buscas hoy"', () => {
  assertEquals(isQuestionAboutInterest(ES_Q), true)
})

Deno.test('isQuestionAboutInterest matches PT/EN/FR variants', () => {
  assertEquals(isQuestionAboutInterest('O que você busca hoje?'), true)
  assertEquals(isQuestionAboutInterest('What are you looking for today?'), true)
  assertEquals(isQuestionAboutInterest("Que recherchez-vous aujourd'hui ?"), true)
})

Deno.test('isPotentialInterestAnswer tolerates typos and PT spelling', () => {
  assertEquals(isPotentialInterestAnswer('cuurso'), true)
  assertEquals(isPotentialInterestAnswer('autorizacion de regresso'), true)
  assertEquals(isPotentialInterestAnswer('curso'), true)
  assertEquals(isPotentialInterestAnswer('nacionalidade'), true)
})

Deno.test('computeDeterministicFunnelPatch grava interesse no contexto ES', () => {
  const patch = computeDeterministicFunnelPatch(ES_Q, 'cuurso')
  assertEquals(patch.interest_confirmed, 'cuurso')
})

Deno.test('computeDeterministicFunnelPatch grava interesse para "autorizacion de regresso"', () => {
  const patch = computeDeterministicFunnelPatch(ES_Q, 'autorizacion de regresso')
  assertEquals(patch.interest_confirmed, 'autorizacion de regresso')
})
