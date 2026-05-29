// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { stripNameIntroPrefix, isLikelyFullNameAnswer } from './lib/name-extraction.ts'

Deno.test('strip ES: "Me llamo Pedro Henrique Rodrigues"', () => {
  assertEquals(stripNameIntroPrefix('Me llamo Pedro Henrique Rodrigues'), 'Pedro Henrique Rodrigues')
  assert(isLikelyFullNameAnswer('Me llamo Pedro Henrique Rodrigues'))
})

Deno.test('strip PT: "Meu nome é Ana Maria Silva"', () => {
  assertEquals(stripNameIntroPrefix('Meu nome é Ana Maria Silva'), 'Ana Maria Silva')
  assert(isLikelyFullNameAnswer('Meu nome é Ana Maria Silva'))
})

Deno.test('strip PT: "Me chamo João Silva"', () => {
  assertEquals(stripNameIntroPrefix('Me chamo João Silva'), 'João Silva')
})

Deno.test('strip EN: "My name is John Doe"', () => {
  assertEquals(stripNameIntroPrefix('My name is John Doe'), 'John Doe')
  assert(isLikelyFullNameAnswer('My name is John Doe'))
})

Deno.test('strip EN: "I am John Doe"', () => {
  assertEquals(stripNameIntroPrefix('I am John Doe'), 'John Doe')
  assert(isLikelyFullNameAnswer('I am John Doe'))
})

Deno.test('strip FR: "Je m\'appelle Marie Dupont"', () => {
  assertEquals(stripNameIntroPrefix("Je m'appelle Marie Dupont"), 'Marie Dupont')
  assert(isLikelyFullNameAnswer("Je m'appelle Marie Dupont"))
})

Deno.test('strip ES: "Soy Pedro Silva"', () => {
  assertEquals(stripNameIntroPrefix('Soy Pedro Silva'), 'Pedro Silva')
  assert(isLikelyFullNameAnswer('Soy Pedro Silva'))
})

Deno.test('strip com saudação: "Hola, me llamo Pedro Silva"', () => {
  assertEquals(stripNameIntroPrefix('Hola, me llamo Pedro Silva'), 'Pedro Silva')
})

Deno.test('sem prefixo: "Pedro Henrique Rodrigues" inalterado', () => {
  assertEquals(stripNameIntroPrefix('Pedro Henrique Rodrigues'), 'Pedro Henrique Rodrigues')
})

Deno.test('fallback: "Me llamo" sozinho retorna texto original e não vira nome', () => {
  assertEquals(stripNameIntroPrefix('Me llamo'), 'Me llamo')
  assertEquals(isLikelyFullNameAnswer('Me llamo'), false)
})

Deno.test('remove pontuação final: "My name is John Doe."', () => {
  assertEquals(stripNameIntroPrefix('My name is John Doe.'), 'John Doe')
})
