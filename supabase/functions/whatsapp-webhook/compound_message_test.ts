// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { computeDeterministicFunnelPatch } from './lib/overrides.ts'

const CATALOG_Q_ES = 'En CB trabajamos con: residencia (NIE/TIE), nacionalidad española, arraigo, reagrupación familiar, homologación de títulos y autorización de regreso.'
const LOCATION_Q_ES = '¿Estás en España?'
const LOCATION_Q_PT = 'Você está na Espanha?'
const COMPOUND_ES = 'Sí, ya tengo 2 años en España y quiero solicitar mi residencia'

Deno.test('compound: extrai RESIDENCIA do compound ES e NÃO seta location_known sem pergunta canônica', () => {
  const patch = computeDeterministicFunnelPatch(CATALOG_Q_ES, COMPOUND_ES)
  assertEquals(patch.interest_confirmed, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(patch.location_known, undefined, 'location_known deve ficar undefined até askLocationSpain')
})

Deno.test('compound: após askLocationSpain, mesma msg consolida location_known=spain', () => {
  const patch = computeDeterministicFunnelPatch(LOCATION_Q_ES, COMPOUND_ES)
  assertEquals(patch.interest_confirmed, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(patch.location_known, 'spain')
})

Deno.test('compound PT: "quero solicitar minha residência" → RESIDENCIA', () => {
  const patch = computeDeterministicFunnelPatch(LOCATION_Q_PT, 'Sim, faz 2 anos em Espanha e quero solicitar minha residência')
  assertEquals(patch.interest_confirmed, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(patch.location_known, 'spain')
})

Deno.test('compound EN: "I want residency" → RESIDENCIA', () => {
  const patch = computeDeterministicFunnelPatch('Are you in Spain?', "Yes, I have 2 years in Spain and I want residency")
  assertEquals(patch.interest_confirmed, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(patch.location_known, 'spain')
})

Deno.test('compound FR: "résidence" → RESIDENCIA', () => {
  const patch = computeDeterministicFunnelPatch('Êtes-vous en Espagne ?', "Oui, j'ai 2 ans en Espagne et je veux ma résidence")
  assertEquals(patch.interest_confirmed, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(patch.location_known, 'spain')
})

Deno.test('catalog follow-up: "nacionalidad" isolado → NACIONALIDADE_RESIDENCIA', () => {
  const patch = computeDeterministicFunnelPatch(CATALOG_Q_ES, 'nacionalidad')
  assertEquals(patch.interest_confirmed, 'NACIONALIDADE_RESIDENCIA')
})

Deno.test('sem keyword + sem pergunta de interesse → não grava interest', () => {
  const patch = computeDeterministicFunnelPatch('Qual seu nome completo?', 'João da Silva')
  assertEquals(patch.interest_confirmed, undefined)
})
