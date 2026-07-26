// @ts-nocheck
/**
 * Garante que, havendo fluxo cadastrado, o atendimento segue o fluxo
 * até o fim — sem desvios, sem reinícios e sem perder o estado.
 */
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlow, findStartStep, mergeFlows, startFlow, stepKindOf } from '../_shared/flow-engine.ts'

const preSteps = [
  {
    id: '1',
    step_code: 'INICIO',
    order_index: 1,
    phase: 'PRE_HANDOFF',
    validation: { step_kind: 'INICIO' },
    messages: { 'pt-BR': 'Olá! Sou a assistente da CB Asesoria.' },
    next_step_code: 'CONFIRMA',
  },
  {
    id: '2',
    step_code: 'CONFIRMA',
    order_index: 2,
    phase: 'PRE_HANDOFF',
    answer_type: 'SIM_NAO',
    validation: { step_kind: 'PERGUNTA', required: true },
    messages: { 'pt-BR': 'Podemos continuar?' },
    reask_messages: { 'pt-BR': 'Responda sim ou não, por favor.' },
    branches: [
      { id: 'b1', value: 'sim', match_type: 'IGUAL', next_step_code: 'NOME' },
      { id: 'b2', value: 'nao', match_type: 'IGUAL', next_step_code: 'NOME' },
    ],
  },
  {
    id: '3',
    step_code: 'NOME',
    order_index: 3,
    phase: 'PRE_HANDOFF',
    answer_type: 'NOME',
    field_mapping: 'contact.full_name',
    validation: { step_kind: 'PERGUNTA', required: true },
    messages: { 'pt-BR': 'Qual é seu nome completo?' },
    reask_messages: { 'pt-BR': 'Preciso do nome e sobrenome.' },
    next_step_code: 'ENTREGA',
  },
]

const handoffSteps = [
  {
    id: '4',
    step_code: 'ENTREGA',
    order_index: 1,
    phase: 'HANDOFF',
    validation: { step_kind: 'FIM' },
    handoff: true,
    messages: { 'pt-BR': 'Vou te encaminhar para um especialista.' },
  },
]

const steps = mergeFlows(preSteps, handoffSteps)

Deno.test('mergeFlows encadeia pré-handoff e handoff mantendo o INÍCIO', () => {
  assertEquals(steps.length, 4)
  const start = findStartStep(steps)
  assertEquals(start?.step_code, 'INICIO')
  assertEquals(stepKindOf(start), 'INICIO')
})

Deno.test('resposta curta tipo "ok"/"obrigado" não quebra nem encerra o fluxo', () => {
  const start = startFlow(steps, 'pt-BR')
  assertEquals(start.state.current_step, 'CONFIRMA')
  const turn = advanceFlow(steps, start.state, 'obrigado', 'pt-BR')
  // Não é sim/não válido → repergunta, mas continua na mesma etapa e não finaliza.
  assertEquals(turn.finished, false)
  assertEquals(turn.state.current_step, 'CONFIRMA')
})

Deno.test('fluxo completo captura campo mapeado e termina em handoff', () => {
  let s = startFlow(steps, 'pt-BR').state
  const t1 = advanceFlow(steps, s, 'sim', 'pt-BR')
  assertEquals(t1.state.current_step, 'NOME')
  const t2 = advanceFlow(steps, t1.state, 'Pedro Oliveira', 'pt-BR')
  assertEquals(t2.finished, true)
  assertEquals(t2.handoff, true)
  const captured = t2.captured.find((c: any) => c.field === 'contact.full_name')
  assertEquals(captured?.value, 'Pedro Oliveira')
})

Deno.test('fluxo já finalizado não reinicia nem repete mensagens', () => {
  let s = startFlow(steps, 'pt-BR').state
  s = advanceFlow(steps, s, 'sim', 'pt-BR').state
  const done = advanceFlow(steps, s, 'Pedro Oliveira', 'pt-BR')
  assertEquals(done.finished, true)
  const after = advanceFlow(steps, done.state, 'oi de novo', 'pt-BR')
  assertEquals(after.finished, true)
  assertEquals(after.messages.length, 0)
})

Deno.test('estado preservado entre turnos (nenhuma etapa repetida)', () => {
  const start = startFlow(steps, 'pt-BR')
  const t1 = advanceFlow(steps, start.state, 'sim', 'pt-BR')
  const visited = t1.state.visited || []
  assertEquals(new Set(visited).size, visited.length)
})
