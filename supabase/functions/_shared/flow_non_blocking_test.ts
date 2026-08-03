// @ts-nocheck
import { assert, assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { generalCaptureSatisfied, missingRequired } from './flow-required.ts'
import { generalCaptureOf } from './flow-engine.ts'

const optionalStep = {
  step_code: 'dados_pessoais',
  validation: {
    step_kind: 'PERGUNTA_GERAL',
    general_capture: {
      enabled: true,
      non_blocking: true,
      min_fields: 5,
      fields: [
        { source: 'age', target_field: 'outside.age', required: false },
        { source: 'residence_country', target_field: 'contact.residence_country', required: false },
        { source: 'education_superior', target_field: 'contact.education_level', required: false },
        { source: 'eu_family', target_field: 'contact.has_eu_family_member', required: false },
        { source: 'europe_6m', target_field: 'contact.eu_entry_last_6_months', required: false },
      ],
    },
  },
}

Deno.test('generalCaptureOf lê a marca não bloqueante', () => {
  assertEquals(generalCaptureOf(optionalStep).non_blocking, true)
})

Deno.test('etapa não bloqueante avança sem nenhum dado ("prefiro não informar")', () => {
  assert(generalCaptureSatisfied(optionalStep, {}))
  assertEquals(missingRequired(optionalStep, {}).length, 0)
})

Deno.test('etapa não bloqueante avança com resposta parcial (só idade)', () => {
  assert(generalCaptureSatisfied(optionalStep, { 'outside.age': '35' }))
})

Deno.test('data de nascimento não é exigida no passo de dados pessoais', () => {
  const sources = generalCaptureOf(optionalStep).fields.map((f) => f.source)
  assertEquals(sources.includes('birth_date'), false)
})

Deno.test('campo obrigatório continua bloqueando mesmo em outra etapa', () => {
  const nameStep = {
    step_code: 'nome',
    validation: {
      step_kind: 'PERGUNTA_GERAL',
      general_capture: {
        enabled: true,
        min_fields: 1,
        fields: [{ source: 'full_name', target_field: 'contact.full_name', required: true }],
      },
    },
  }
  assertEquals(generalCaptureSatisfied(nameStep, {}), false)
  assert(generalCaptureSatisfied(nameStep, { 'contact.full_name': 'Maria' }))
})
