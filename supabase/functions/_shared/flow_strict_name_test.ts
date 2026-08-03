// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import {
  normalizeIntakeConfig,
  profileNameToFieldValues,
} from './flow-intake.ts'

Deno.test('perfil do WhatsApp preenche o nome quando o modo estrito está desligado', () => {
  const values = profileNameToFieldValues('Maria Silva', '+34600111222')
  assertEquals(values['contact.full_name'], 'Maria Silva')
})

Deno.test('modo estrito: nome de perfil nunca preenche contact.full_name', () => {
  const values = profileNameToFieldValues('Maria Silva', '+34600111222', { strictName: true })
  assertEquals(values, {})
})

Deno.test('normalizeIntakeConfig lê strict_name', () => {
  assertEquals(normalizeIntakeConfig({ strict_name: true }).strict_name, true)
  assertEquals(normalizeIntakeConfig({}).strict_name, false)
})
