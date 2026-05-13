// Persistência determinística de B4 ("desde quando empadronado")
// + gate enforceBlockCompletion lendo a flag persistida.

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractEmpadronadoSincePatch, enforceBlockCompletion, isLocked, stripLockedSentinel } from './lib/overrides.ts'
import { buildPreHandoffPayload, getEmpadronamientoSinceQuestion } from './lib/questions.ts'

const SINCE_Q = {
  'pt-BR': 'Desde quando você está empadronado?',
  'es': '¿Desde cuándo estás empadronado?',
  'en': 'Since when have you been registered (empadronado)?',
  'fr': 'Depuis quand êtes-vous empadronado ?',
} as const

Deno.test('B4: extrai data ISO quando resposta é parseável (DD/MM/YYYY)', () => {
  const patch = extractEmpadronadoSincePatch(SINCE_Q['pt-BR'], '15/03/2024')
  assertEquals(patch.b4_empadronado_since, '2024-03-15')
})

Deno.test('B4: salva texto cru quando não-parseável (≤60 chars)', () => {
  const patch = extractEmpadronadoSincePatch(SINCE_Q['pt-BR'], 'há muito tempo')
  assertEquals(patch.b4_empadronado_since, 'há muito tempo')
})

Deno.test('B4: descarta texto >60 chars não-parseável', () => {
  const long = 'sinceramente nao lembro mais a data exata foi faz tantos anos atras que nem sei'
  const patch = extractEmpadronadoSincePatch(SINCE_Q['pt-BR'], long)
  assertEquals(patch.b4_empadronado_since, undefined)
})

Deno.test('B4: no-op quando prevQ não é a pergunta de "desde quando"', () => {
  const patch = extractEmpadronadoSincePatch('Você está empadronado?', '15/03/2024')
  assertEquals(patch, {})
})

Deno.test('B4: funciona em es/en/fr', () => {
  for (const lang of ['es', 'en', 'fr'] as const) {
    const patch = extractEmpadronadoSincePatch(SINCE_Q[lang], '15/03/2024')
    assertEquals(patch.b4_empadronado_since, '2024-03-15', `falhou em ${lang}`)
  }
})

Deno.test('enforceBlockCompletion: flag b4_empadronado_since libera H1 mesmo com transcript vazio', () => {
  const h1 = buildPreHandoffPayload('pt-BR', { preHandoffSent: false, handoffSent: false, transcript: '' })
  const result = enforceBlockCompletion(h1, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: '2024-01-01',
    empadronadoConfirmed: true,
    empadronadoCity: 'Madrid',
    assistantTranscript: '', // truncado, sem "desde quando"
    outsideProgress: { b4_empadronado_since: '2024-03-15' },
  })
  assertEquals(result, h1, 'H1 deve passar intacto quando flag persistida está setada')
})

Deno.test('enforceBlockCompletion: sem flag b4 e sem transcript → bloqueia H1 e força B3', () => {
  const h1 = buildPreHandoffPayload('pt-BR', { preHandoffSent: false, handoffSent: false, transcript: '' })
  const result = enforceBlockCompletion(h1, 'pt-BR', {
    locationKnown: 'spain',
    entryDateConfirmed: '2024-01-01',
    empadronadoConfirmed: true,
    empadronadoCity: 'Madrid',
    assistantTranscript: '',
    outsideProgress: null,
  })
  assert(isLocked(result))
  assertStringIncludes(stripLockedSentinel(result), 'Desde quando')
})
