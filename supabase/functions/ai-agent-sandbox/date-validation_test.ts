import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseFlowDate, validateAnswer, defaultDateReask } from '../_shared/flow-engine.ts'

const step: any = { step_code: 'd', answer_type: 'DATA', validation: {} }

Deno.test('aceita DD/MM/AAAA e normaliza', () => {
  assertEquals(parseFlowDate('24/01/2026'), '24/01/2026')
  assertEquals(parseFlowDate('1-2-2026'), '01/02/2026')
  assertEquals(parseFlowDate('cheguei em 9.3.2024'), '09/03/2024')
  assertEquals(parseFlowDate('29/02/2024'), '29/02/2024')
})

Deno.test('rejeita formato americano e datas impossíveis', () => {
  assertEquals(parseFlowDate('01/24/2026'), null)
  assertEquals(parseFlowDate('31/04/2025'), null)
  assertEquals(parseFlowDate('29/02/2025'), null)
  assertEquals(parseFlowDate('00/01/2026'), null)
})

Deno.test('ano de 4 dígitos é obrigatório', () => {
  assertEquals(parseFlowDate('24/01/26'), null)
  assertEquals(parseFlowDate('janeiro de 2026'), null)
  assertEquals(parseFlowDate('24/01'), null)
})

Deno.test('validateAnswer DATA usa a validação estrita', () => {
  assertEquals(validateAnswer(step, '24/01/2026'), { valid: true, value: '24/01/2026' })
  assertEquals(validateAnswer(step, '01/24/2026'), { valid: false, reason: 'invalid_date' })
})

Deno.test('repergunta padrão existe nos 4 idiomas', () => {
  for (const l of ['pt-BR', 'es', 'en', 'fr'] as const) {
    const msg = defaultDateReask(l as any)
    assertEquals(typeof msg === 'string' && msg.length > 10, true)
  }
})
