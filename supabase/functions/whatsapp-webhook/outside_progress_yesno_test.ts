// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractOutsideProgressPatch } from './lib/overrides.ts'

const Q_FAMILIAR = 'Possui familiar europeu ou residente legal na Espanha?'
const Q_EUROPA = 'Você esteve na Europa nos últimos 6 meses?'
const Q_REMOTO = 'Você trabalha remoto?'
const Q_FORMACAO = 'Você possui formação superior?'
const Q_IDADE = 'Qual sua idade?'

Deno.test('a4_family: "tambem nao" (sem acento, com prefixo) → no', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'tambem nao')
  assertEquals(p.a4_eu_family, 'no')
})

Deno.test('a4_family: "também não" (com acento) → no', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'também não')
  assertEquals(p.a4_eu_family, 'no')
})

Deno.test('a4_family: "acho que não" → no', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'acho que não')
  assertEquals(p.a4_eu_family, 'no')
})

Deno.test('a4_family: "nao tenho" → no', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'nao tenho')
  assertEquals(p.a4_eu_family, 'no')
})

Deno.test('a4_family: "sim, tenho um primo" → yes', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'sim, tenho um primo')
  assertEquals(p.a4_eu_family, 'yes')
})

Deno.test('a4_family: "eu tenho sim" → yes', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'eu tenho sim')
  assertEquals(p.a4_eu_family, 'yes')
})

Deno.test('a3_europe_6m: "também não" → no', () => {
  const p = extractOutsideProgressPatch(Q_EUROPA, 'também não')
  assertEquals(p.a3_europe_6m, 'no')
})

Deno.test('a5_remote: "sim claro" → yes', () => {
  const p = extractOutsideProgressPatch(Q_REMOTO, 'sim claro')
  assertEquals(p.a5_remote, 'yes')
})

Deno.test('a6_higher_ed: "tenho sim, sou formado" → yes', () => {
  const p = extractOutsideProgressPatch(Q_FORMACAO, 'tenho sim, sou formado')
  assertEquals(p.a6_higher_ed, 'yes')
})

Deno.test('a2_age: "tenho 25 anos" → 25', () => {
  const p = extractOutsideProgressPatch(Q_IDADE, 'tenho 25 anos')
  assertEquals(p.a2_age, '25')
})

Deno.test('sem pergunta anterior → patch vazio', () => {
  const p = extractOutsideProgressPatch('', 'não')
  assertEquals(Object.keys(p).length, 0)
})

Deno.test('pergunta não reconhecida → patch vazio', () => {
  const p = extractOutsideProgressPatch('Qual seu nome?', 'não')
  assertEquals(Object.keys(p).length, 0)
})

Deno.test('ambiguidade: "não sei se sim" prioriza no', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'não sei se sim')
  assertEquals(p.a4_eu_family, 'no')
})

Deno.test('espanhol: "tampoco" não casa (não é vocab suportado ainda) — apenas "no" casa', () => {
  const p = extractOutsideProgressPatch(Q_FAMILIAR, 'no tengo')
  assertEquals(p.a4_eu_family, 'no')
})
