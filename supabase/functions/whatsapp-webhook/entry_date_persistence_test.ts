import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { computeDeterministicFunnelPatch } from './lib/overrides.ts'
import { extractLastQuestion } from './lib/text-utils.ts'

const ES_QUESTION = 'Perfecto.\n\nPerfecto. Perfecto. Ahora necesito entender cómo está tu situación aquí.\n\n¿Cuál fue la fecha exacta de tu entrada en España? Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025).?'
const PT_QUESTION = 'Perfeito.\n\nAgora preciso entender sua situação aqui.\n\nQual foi a data exata da sua entrada na Espanha? Por favor, envie no formato DD/MM/AAAA (exemplo: 22/05/2025).?'

Deno.test('extractLastQuestion: prefere segmento com ¿ sobre fragmento ".?"', () => {
  const q = extractLastQuestion(ES_QUESTION)
  // Deve retornar a pergunta de verdade, não o trecho auxiliar.
  if (!/España/.test(q)) {
    throw new Error(`Esperava trecho com "España", recebi: ${q}`)
  }
})

Deno.test('computeDeterministicFunnelPatch: grava entry_date_confirmed mesmo com ".?" no final (ES)', () => {
  const patch = computeDeterministicFunnelPatch(ES_QUESTION, '01/01/2026')
  assertEquals(patch.entry_date_confirmed, '2026-01-01')
})

Deno.test('computeDeterministicFunnelPatch: grava entry_date_confirmed mesmo com ".?" no final (PT)', () => {
  const patch = computeDeterministicFunnelPatch(PT_QUESTION, '15/03/2025')
  assertEquals(patch.entry_date_confirmed, '2025-03-15')
})

Deno.test('computeDeterministicFunnelPatch: ignora data futura', () => {
  const patch = computeDeterministicFunnelPatch(ES_QUESTION, '01/01/2099')
  assertEquals(patch.entry_date_confirmed, undefined)
})
