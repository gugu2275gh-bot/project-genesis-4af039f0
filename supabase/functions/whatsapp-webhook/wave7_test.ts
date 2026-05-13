// Wave 7: Bizagi alignment (D1-D4)
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  getServicesOfferedMessage,
  isServicesOfferedMessage,
  getPreHandoffSummaryMessage,
  getHandoffTransferMessage,
  buildPreHandoffPayload,
  getOutsideSpainAgeQuestion,
  getOutsideSpainNextQuestion,
} from './lib/questions.ts'
import { forceServicesMessageAfterInterest, forceCorrectBlockForLocation } from './lib/overrides.ts'

// ---------- D1 ----------

Deno.test('D1: services message contains arraigo + reagrupamento + homologação (PT)', () => {
  const m = getServicesOfferedMessage('pt-BR')
  assertStringIncludes(m, 'arraigo')
  assertStringIncludes(m, 'reagrupamento')
  assertStringIncludes(m, 'homologação')
  assert(isServicesOfferedMessage(m))
})

Deno.test('D1: services message multi-language matchers (ES/EN/FR)', () => {
  for (const lang of ['es', 'en', 'fr'] as const) {
    const m = getServicesOfferedMessage(lang)
    assert(isServicesOfferedMessage(m), `should match ${lang}`)
  }
})

Deno.test('D1: forceServicesMessageAfterInterest injects Msg 6 when interest known and not yet sent', () => {
  const result = forceServicesMessageAfterInterest('Qual cidade você está hoje?', 'pt-BR', {
    interestKnown: true,
    locationKnown: false,
    assistantTranscript: 'Olá! Qual seu nome? Maria. Qual seu email? a@b.com. O que você busca? arraigo.',
  })
  assertStringIncludes(result, 'arraigo')
  assertStringIncludes(result, 'reagrupamento')
})

Deno.test('D1: forceServicesMessageAfterInterest is idempotent (no re-inject if already sent)', () => {
  const original = 'Hoje você já está na Espanha?'
  const result = forceServicesMessageAfterInterest(original, 'pt-BR', {
    interestKnown: true,
    locationKnown: false,
    assistantTranscript: getServicesOfferedMessage('pt-BR'),
  })
  assertEquals(result, original)
})

Deno.test('D1: forceServicesMessageAfterInterest no-op when location already known', () => {
  const original = 'Qual a data exata da sua entrada?'
  const result = forceServicesMessageAfterInterest(original, 'pt-BR', {
    interestKnown: true,
    locationKnown: true,
    assistantTranscript: '',
  })
  assertEquals(result, original)
})

// ---------- D2 ----------

Deno.test('D2: getOutsideSpainAgeQuestion separates A1 from A2 with blank line (PT)', () => {
  const q = getOutsideSpainAgeQuestion('pt-BR')
  assertStringIncludes(q, 'fora da Espanha')
  assertStringIncludes(q, 'Qual sua idade?')
  assert(q.includes('\n\n'), 'A1 and A2 should be separated by blank line')
})

Deno.test('D2: getOutsideSpainAgeQuestion separates blocks in all 4 languages', () => {
  for (const lang of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const q = getOutsideSpainAgeQuestion(lang)
    assert(q.includes('\n\n'), `lang ${lang} must include blank line separator`)
  }
})

Deno.test('D2: forceCorrectBlockForLocation B1+B2 fallback uses blank line (entry date branch)', () => {
  const result = forceCorrectBlockForLocation('Qual sua idade?', 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: null,
    empadronadoConfirmed: null,
    empadronadoCity: null,
    assistantTranscript: '',
  })
  assertStringIncludes(result, 'situação aqui')
  assertStringIncludes(result, 'data exata da sua entrada')
  assert(result.includes('\n\n'), 'B1 and B2 should be separated by blank line')
})

// ---------- D3 + D4 ----------

Deno.test('D3: buildPreHandoffPayload returns summary ||| transfer when nothing sent', () => {
  const payload = buildPreHandoffPayload('pt-BR', '')
  assert(payload.includes('|||'), 'should split into 2 messages via |||')
  assertStringIncludes(payload, 'visão inicial do seu caso')
  assertStringIncludes(payload, 'encaminhar suas informações')
})

Deno.test('D3: buildPreHandoffPayload returns only transfer when summary already sent', () => {
  const transcript = getPreHandoffSummaryMessage('pt-BR')
  const payload = buildPreHandoffPayload('pt-BR', transcript)
  assert(!/visão inicial do seu caso/i.test(payload))
  assertStringIncludes(payload, 'encaminhar suas informações')
})

Deno.test('D3: buildPreHandoffPayload returns empty when both already sent (idempotent)', () => {
  const transcript = `${getPreHandoffSummaryMessage('pt-BR')}\n${getHandoffTransferMessage('pt-BR')}`
  const payload = buildPreHandoffPayload('pt-BR', transcript)
  assertEquals(payload, '')
})

Deno.test('D3: getOutsideSpainNextQuestion at end emits 2-message payload', () => {
  // Transcript indicating all questions A1-A6 already asked
  const transcript = [
    'Qual sua idade?', 'Você esteve na Europa nos últimos 6 meses?',
    'Possui familiar europeu ou residente legal na Espanha?',
    'Você trabalha remoto?', 'Você possui formação superior?',
  ].join('\n')
  const result = getOutsideSpainNextQuestion('pt-BR', transcript, { entryDateConfirmed: null, locationKnown: 'outside' })
  assert(result.includes('|||'), 'final pre-handoff must be 2-message split')
  assertStringIncludes(result, 'visão inicial')
  assertStringIncludes(result, 'encaminhar')
})

Deno.test('D3: forceCorrectBlockForLocation final branch (Spain block complete) emits 2-message payload', () => {
  const result = forceCorrectBlockForLocation('Qual sua idade?', 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: '2024-02-15',
    empadronadoConfirmed: true,
    empadronadoCity: 'Madrid',
    assistantTranscript: '',
  })
  assert(result.includes('|||'), 'should emit summary ||| transfer')
  assertStringIncludes(result, 'visão inicial')
  assertStringIncludes(result, 'encaminhar')
})

Deno.test('D4 (BPMN v2): handoff is single bubble H3 only (no H4)', () => {
  const m = getHandoffTransferMessage('pt-BR')
  assert(!m.includes('|||'), 'H4 was removed in BPMN v2; H3 must be a single bubble')
  assertStringIncludes(m.toLowerCase(), 'encaminhar suas informações')
  assert(!/encaminhar para um atendente/i.test(m), 'H4 text must not appear')
})
