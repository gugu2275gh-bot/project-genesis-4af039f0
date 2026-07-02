// @ts-nocheck
// Regressões identificadas no chat de Pedro Oliveira (03/07/2026)
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseEntryDateFromText, isPotentialEntryDateAnswer } from './lib/questions.ts'
import { sanitizeOutgoingText } from './lib/twilio.ts'

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
