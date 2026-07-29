import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { ageFromIso, birthDateMessage, checkBirthDate } from '../_shared/flow-birthdate.ts'
import { extractionToFieldValues } from '../_shared/flow-intake.ts'

const NOW = new Date('2026-07-29T12:00:00Z')

Deno.test('aceita apenas DD/MM/AAAA', () => {
  assertEquals(checkBirthDate('05/03/1990', { now: NOW }).iso, '1990-03-05')
  assertEquals(checkBirthDate('5/3/1990', { now: NOW }).problem, 'format')
  assertEquals(checkBirthDate('1990-03-05', { now: NOW }).problem, 'format')
  assertEquals(checkBirthDate('março de 1990', { now: NOW }).problem, 'format')
})

Deno.test('rejeita data inexistente e data futura', () => {
  assertEquals(checkBirthDate('31/02/1990', { now: NOW }).problem, 'invalid')
  assertEquals(checkBirthDate('01/01/2030', { now: NOW }).problem, 'future')
})

Deno.test('idade divergente pede confirmação', () => {
  const check = checkBirthDate('05/03/1990', { declaredAge: 20, now: NOW })
  assertEquals(check.ok, false)
  assertEquals(check.problem, 'age_mismatch')
  assertEquals(birthDateMessage(check.problem, 'es', 20).includes('20'), true)
})

Deno.test('idade coerente é aceita e calculada', () => {
  const check = checkBirthDate('05/03/1990', { declaredAge: 36, now: NOW })
  assertEquals(check.ok, true)
  assertEquals(check.age, 36)
  assertEquals(ageFromIso('1990-03-05', NOW), 36)
})

Deno.test('intake não grava data de nascimento inválida', () => {
  const bad = extractionToFieldValues({ birth_date: '1990', confidence: { birth_date: 1 } } as any, 0.7, NOW)
  assertEquals(bad['contact.birth_date'], undefined)

  const good = extractionToFieldValues(
    { birth_date: '05/03/1990', confidence: { birth_date: 1 } } as any,
    0.7,
    NOW,
  )
  assertEquals(good['contact.birth_date'], '05/03/1990')
  assertEquals(good['outside.age'], '36')
})

Deno.test('idade sozinha nunca vira data de nascimento', () => {
  const out = extractionToFieldValues({ age: 42, confidence: { age: 1 } } as any, 0.7, NOW)
  assertEquals(out['outside.age'], '42')
  assertEquals(out['contact.birth_date'], undefined)
})
