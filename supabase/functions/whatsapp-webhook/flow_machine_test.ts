// @ts-nocheck
Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY','OPENAI_API_KEY',
]) if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  getStepDef,
  resolveCurrentStep,
  currentFlow,
  toLegacyStep,
} from './lib/flow-machine.ts'

const baseState: any = {
  lead_id: 'test',
  step: 'abertura',
  name_confirmed: false,
  email_confirmed: false,
  interest_confirmed: null,
  location_known: null,
  entry_date_confirmed: null,
  empadronado_confirmed: null,
  outside_spain_progress: {},
  last_step_change: '',
  updated_at: '',
}

Deno.test('resolveCurrentStep: state vazio → ABERTURA', () => {
  assertEquals(resolveCurrentStep(baseState), 'ABERTURA')
})

Deno.test('resolveCurrentStep: progressão NAME → LOCATION (EMAIL/INTEREST desativados)', () => {
  assertEquals(resolveCurrentStep({ ...baseState, step: 'nome' }), 'NAME')
  assertEquals(resolveCurrentStep({ ...baseState, step: 'nome', name_confirmed: true }), 'LOCATION')
  assertEquals(resolveCurrentStep({ ...baseState, name_confirmed: true, email_confirmed: true }), 'LOCATION')
  // trava a regra de produto: e-mail nunca volta a ser perguntado no onboarding
  for (const s of [
    { ...baseState, step: 'nome', name_confirmed: true },
    { ...baseState, name_confirmed: true, interest_confirmed: 'X' },
    { ...baseState, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X' },
  ]) {
    assert(resolveCurrentStep(s as any) !== 'EMAIL')
    assert(resolveCurrentStep(s as any) !== 'INTEREST')
  }
})


Deno.test('branch INSIDE: LOCATION=spain → INSIDE_ENTRY_DATE → INSIDE_EMPADRONADO → PRE_HANDOFF', () => {
  const s: any = { ...baseState, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X', location_known: 'spain' }
  assertEquals(resolveCurrentStep(s), 'INSIDE_ENTRY_DATE')
  assertEquals(resolveCurrentStep({ ...s, entry_date_confirmed: '2024-01-01' }), 'INSIDE_EMPADRONADO')
  assertEquals(resolveCurrentStep({ ...s, entry_date_confirmed: '2024-01-01', empadronado_confirmed: true }), 'PRE_HANDOFF')
})

Deno.test('branch OUTSIDE: LOCATION=outside → OUTSIDE_AGE', () => {
  const s: any = { ...baseState, name_confirmed: true, email_confirmed: true, interest_confirmed: 'X', location_known: 'outside' }
  assertEquals(resolveCurrentStep(s), 'OUTSIDE_AGE')
})

Deno.test('handoff_sent → FREE_KB (KB livre, sem regressão)', () => {
  assertEquals(resolveCurrentStep({ ...baseState, handoff_sent: true }), 'FREE_KB')
})

Deno.test('NAME.next: sempre LOCATION (etapa de e-mail removida do onboarding)', () => {
  const def = getStepDef('NAME')
  assertEquals(def.next({ ...baseState, email_confirmed: false } as any), 'LOCATION')
  assertEquals(def.next({ ...baseState, email_confirmed: true } as any), 'LOCATION')
})


Deno.test('EMAIL.validate: aceita email válido, rejeita inválido', () => {
  const def = getStepDef('EMAIL')
  assert(def.validate('joao@email.com', baseState).valid)
  assertEquals(def.validate('joao@email.com', baseState).value, 'joao@email.com')
  assert(!def.validate('isso não é email', baseState).valid)
})

Deno.test('INTEREST.validate: usa extractInterestFromMessage (reaproveita lib existente)', () => {
  const def = getStepDef('INTEREST')
  assertEquals(def.validate('arraigo social', baseState).value, 'RESIDENCIA_PARENTE_COMUNITARIO')
  assertEquals(def.validate('xpto blah', baseState).valid, false)
})

Deno.test('LOCATION.next: spain → INSIDE_ENTRY_DATE; outside → OUTSIDE_AGE', () => {
  const def = getStepDef('LOCATION')
  assertEquals(def.next(baseState, 'spain'), 'INSIDE_ENTRY_DATE')
  assertEquals(def.next(baseState, 'outside'), 'OUTSIDE_AGE')
})

Deno.test('currentFlow: deriva do location_known + handoff_sent', () => {
  assertEquals(currentFlow(baseState), 'ONBOARDING')
  assertEquals(currentFlow({ ...baseState, location_known: 'spain' } as any), 'INSIDE_SPAIN')
  assertEquals(currentFlow({ ...baseState, location_known: 'outside' } as any), 'OUTSIDE_SPAIN')
  assertEquals(currentFlow({ ...baseState, handoff_sent: true } as any), 'KB_FREE')
})

Deno.test('toLegacyStep: mantém compatibilidade com FunnelStep legado', () => {
  assertEquals(toLegacyStep('NAME'), 'nome')
  assertEquals(toLegacyStep('EMAIL'), 'email')
  assertEquals(toLegacyStep('INTEREST'), 'interesse')
  assertEquals(toLegacyStep('LOCATION'), 'localizacao')
  assertEquals(toLegacyStep('INSIDE_ENTRY_DATE'), 'levantamento')
  assertEquals(toLegacyStep('FREE_KB'), 'livre')
})
