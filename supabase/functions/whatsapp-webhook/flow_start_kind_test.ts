import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { findStartStep, startFlow, stepKindOf } from '../_shared/flow-engine.ts'

/**
 * Regressão: o fluxo "teste aberto" começa por uma etapa "Pergunta geral"
 * (sem etapa INICIO). Ele precisa ser considerado executável e o 1º turno
 * deve enviar a pergunta e AGUARDAR a resposta.
 */
const steps: any[] = [
  {
    step_code: 'abertura_geral',
    order_index: 1,
    answer_type: 'TEXTO_LIVRE',
    message: 'Olá! Me conte um pouco sobre você.',
    next_step_code: 'idade',
    validation: { step_kind: 'PERGUNTA_GERAL', required: true },
  },
  {
    step_code: 'idade',
    order_index: 2,
    answer_type: 'NUMERO',
    message: 'Qual a sua idade?',
    next_step_code: null,
    validation: { step_kind: 'PERGUNTA', required: true },
  },
]

Deno.test('etapa inicial "Pergunta geral" é tratada como pergunta executável', () => {
  const start = findStartStep(steps)
  assertEquals(start?.step_code, 'abertura_geral')
  assertEquals(stepKindOf(start as any), 'PERGUNTA')
  assertEquals(stepKindOf(start as any) !== 'FIM', true)
})

Deno.test('primeiro turno envia a pergunta geral e aguarda resposta', () => {
  const turn = startFlow(steps as any, 'pt-BR')
  assertEquals(turn.state.current_step, 'abertura_geral')
  assertEquals(turn.finished, false)
  assertEquals(turn.messages.join(' ').includes('Me conte um pouco sobre você'), true)
})
