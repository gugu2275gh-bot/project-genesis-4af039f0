// @ts-nocheck
// Regressões identificadas no chat de Pedro Oliveira (03/07/2026)
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseEntryDateFromText, isPotentialEntryDateAnswer } from './lib/questions.ts'
import { sanitizeOutgoingText } from './lib/twilio.ts'
import { extractOutsideProgressPatch } from './lib/overrides.ts'

Deno.test('extractOutsideProgressPatch: extrai idade quando pergunta é "¿Cuál es tu edad?" (ES)', () => {
  const p = extractOutsideProgressPatch('¿Cuál es tu edad?', 'Tengo 60 años')
  assertEquals(p.a2_age, '60')
})

Deno.test('extractOutsideProgressPatch: extrai idade em PT ("Qual sua idade?")', () => {
  const p = extractOutsideProgressPatch('Qual sua idade?', '42')
  assertEquals(p.a2_age, '42')
})

Deno.test('extractOutsideProgressPatch: extrai idade em EN ("How old are you?")', () => {
  const p = extractOutsideProgressPatch('How old are you?', 'I am 35 years old')
  assertEquals(p.a2_age, '35')
})

Deno.test('extractOutsideProgressPatch: extrai idade após preâmbulo A1 (ES completo)', () => {
  const q = 'Entendido. Entonces seguimos por tu escenario fuera de España.\n\n¿Cuál es tu edad?'
  const p = extractOutsideProgressPatch(q, '60 años')
  assertEquals(p.a2_age, '60')
})

Deno.test('parseEntryDateFromText: mês por extenso + ano (PT)', () => {
  const r = parseEntryDateFromText('Setembro 2024', new Date('2026-07-03'))
  assertEquals(r?.iso, '2024-09-01')
  assertEquals(r?.isPast, true)
})

Deno.test('parseEntryDateFromText: mês por extenso + ano (ES)', () => {
  const r = parseEntryDateFromText('septiembre de 2024', new Date('2026-07-03'))
  assertEquals(r?.iso, '2024-09-01')
})

Deno.test('parseEntryDateFromText: mês + ano (EN)', () => {
  const r = parseEntryDateFromText('September 2024', new Date('2026-07-03'))
  assertEquals(r?.iso, '2024-09-01')
})

Deno.test('parseEntryDateFromText: ano + mês invertido', () => {
  const r = parseEntryDateFromText('2024 setembro', new Date('2026-07-03'))
  assertEquals(r?.iso, '2024-09-01')
})

Deno.test('parseEntryDateFromText: mantém DD/MM/YYYY funcionando', () => {
  const r = parseEntryDateFromText('22/05/2025', new Date('2026-07-03'))
  assertEquals(r?.iso, '2025-05-22')
})

Deno.test('isPotentialEntryDateAnswer aceita mês+ano', () => {
  assertEquals(isPotentialEntryDateAnswer('Setembro 2024'), true)
  assertEquals(isPotentialEntryDateAnswer('septiembre de 2024'), true)
  assertEquals(isPotentialEntryDateAnswer('September 2024'), true)
})

Deno.test('sanitizeOutgoingText remove ).?" e .?', () => {
  assertEquals(
    sanitizeOutgoingText('exemplo: 22/05/2025).?'),
    'exemplo: 22/05/2025)?'
  )
  assertEquals(
    sanitizeOutgoingText('data completa.?'),
    'data completa?'
  )
  assertEquals(
    sanitizeOutgoingText('está na Espanha ?'),
    'está na Espanha?'
  )
  assertEquals(
    sanitizeOutgoingText('está na Espanha??'),
    'está na Espanha?'
  )
})

Deno.test('sanitizeOutgoingText preserva pontuação normal', () => {
  const s = 'Perfeito. Você já está na Espanha?'
  assertEquals(sanitizeOutgoingText(s), s)
})
