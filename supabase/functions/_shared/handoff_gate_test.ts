// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { DEFAULT_HANDOFF_HOLD_MESSAGE, agentHandoffBlocked, handoffHoldMessage, hasHoldText, isHandoffBlocked } from './handoff-gate.ts'

Deno.test('handoff liberado por padrão (undefined) não bloqueia', () => {
  assertEquals(isHandoffBlocked(null), false)
  assertEquals(isHandoffBlocked({}), false)
  assertEquals(isHandoffBlocked({ handoffReleased: true }), false)
})

Deno.test('handoff desligado bloqueia o modo livre', () => {
  assertEquals(isHandoffBlocked({ handoffReleased: false }), true)
})

Deno.test('mensagem de espera usa o idioma, depois pt-BR, depois o padrão', () => {
  const runtime = { handoffReleased: false, handoffHoldMessage: { 'pt-BR': 'Aguarde', es: 'Espere' } }
  assertEquals(handoffHoldMessage(runtime, 'es'), 'Espere')
  assertEquals(handoffHoldMessage(runtime, 'en'), 'Aguarde')
  assertEquals(handoffHoldMessage({ handoffReleased: false }, 'fr'), DEFAULT_HANDOFF_HOLD_MESSAGE.fr)
})

Deno.test('mensagem cadastrada bloqueia a IA mesmo com handoff liberado', () => {
  assertEquals(agentHandoffBlocked({ handoff_released: true, handoff_hold_message: { 'pt-BR': 'Aguarde' } }), true)
  assertEquals(agentHandoffBlocked({ handoff_released: false, handoff_hold_message: {} }), true)
  assertEquals(agentHandoffBlocked({ handoff_released: true, handoff_hold_message: { 'pt-BR': '   ' } }), false)
  assertEquals(agentHandoffBlocked({ handoff_released: true }), false)
  assertEquals(agentHandoffBlocked(null), false)
})

Deno.test('hasHoldText ignora valores vazios', () => {
  assertEquals(hasHoldText({ es: '', en: '' }), false)
  assertEquals(hasHoldText({ es: 'Espere' }), true)
  assertEquals(hasHoldText(null), false)
})
