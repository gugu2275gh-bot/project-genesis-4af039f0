// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlow, startFlow } from '../_shared/flow-engine.ts'

const steps = [
  {
    id: '1',
    step_code: 'INICIO',
    order_index: 1,
    validation: { step_kind: 'INICIO' },
    messages: { 'pt-BR': ['Olá! 😊 Tudo bem?', 'Sou a assistente da CB Asesoria.'] },
    next_step_code: 'NOME',
  },
  {
    id: '2',
    step_code: 'NOME',
    order_index: 2,
    answer_type: 'NOME',
    validation: { step_kind: 'PERGUNTA', required: true },
    messages: { 'pt-BR': 'Como é seu nome completo?' },
    reask_messages: { 'pt-BR': 'Preciso do nome e sobrenome, por favor.' },
    next_step_code: 'LOCAL',
  },
  {
    id: '3',
    step_code: 'LOCAL',
    order_index: 3,
    answer_type: 'SIM_NAO',
    validation: { step_kind: 'PERGUNTA', required: true },
    messages: { 'pt-BR': 'Você já está na Espanha?' },
    branches: [
      { id: 'b1', value: 'sim', match_type: 'IGUAL', next_step_code: 'DENTRO' },
      { id: 'b2', value: 'nao', match_type: 'IGUAL', next_step_code: 'FORA' },
    ],
  },
  {
    id: '4',
    step_code: 'DENTRO',
    order_index: 4,
    validation: { step_kind: 'INFORMATIVA' },
    messages: { 'pt-BR': 'Perfeito, atendemos casos dentro da Espanha.' },
    next_step_code: 'FIM',
  },
  {
    id: '5',
    step_code: 'FORA',
    order_index: 5,
    validation: { step_kind: 'INFORMATIVA' },
    messages: { 'pt-BR': 'Sem problema, também atendemos quem está fora.' },
    next_step_code: 'FIM',
  },
  {
    id: '6',
    step_code: 'FIM',
    order_index: 6,
    validation: { step_kind: 'FIM' },
    handoff: true,
    messages: { 'pt-BR': 'Vou te transferir para um especialista.' },
  },
]

Deno.test('startFlow envia as mensagens de abertura e para na primeira pergunta', () => {
  const turn = startFlow(steps, 'pt-BR')
  assertEquals(turn.messages.length, 3)
  assertEquals(turn.state.current_step, 'NOME')
  assertEquals(turn.finished, false)
})

Deno.test('resposta inválida gera repergunta sem avançar', () => {
  const start = startFlow(steps, 'pt-BR')
  const turn = advanceFlow(steps, start.state, 'Pedro', 'pt-BR')
  assertEquals(turn.reasked, true)
  assertEquals(turn.state.current_step, 'NOME')
  assertEquals(turn.messages[0], 'Preciso do nome e sobrenome, por favor.')
})

Deno.test('ramificação SIM leva ao caminho DENTRO e termina em handoff', () => {
  let s = startFlow(steps, 'pt-BR').state
  s = advanceFlow(steps, s, 'Pedro Oliveira', 'pt-BR').state
  const t1 = advanceFlow(steps, s, 'Pedro Oliveira', 'pt-BR')
  assertEquals(t1.state.current_step, 'LOCAL')
  const t2 = advanceFlow(steps, t1.state, 'Sim, já estou', 'pt-BR')
  assertEquals(t2.path.includes('DENTRO'), true)
  assertEquals(t2.finished, true)
  assertEquals(t2.handoff, true)
})

Deno.test('ramificação NÃO leva ao caminho FORA', () => {
  let s = startFlow(steps, 'pt-BR').state
  s = advanceFlow(steps, s, 'Ana Maria Silva', 'pt-BR').state
  const t = advanceFlow(steps, s, 'não, ainda estou no Brasil', 'pt-BR')
  assertEquals(t.path.includes('FORA'), true)
  assertEquals(t.finished, true)
})

Deno.test('nao repete mensagens de etapas ja visitadas', () => {
  const first = startFlow(steps, 'pt-BR')
  const again = advanceFlow(steps, first.state, 'Maria Souza', 'pt-BR')
  assertEquals(again.messages.includes('Olá! 😊 Tudo bem?'), false)
})

Deno.test('desvia para a etapa de fallback ao esgotar as reperguntas', () => {
  const withFallback = steps.map((s: any) =>
    s.step_code === 'NOME'
      ? { ...s, validation: { ...(s.validation || {}), max_reasks: 1, fallback_step_code: 'FORA' } }
      : s,
  )
  const start = startFlow(withFallback, 'pt-BR')
  const t1 = advanceFlow(withFallback, start.state, 'Pedro', 'pt-BR')
  assertEquals(t1.reasked, true)
  const t2 = advanceFlow(withFallback, t1.state, 'Ana', 'pt-BR')
  assertEquals(t2.reasked, false)
  assertEquals(t2.path.includes('FORA'), true)
})
