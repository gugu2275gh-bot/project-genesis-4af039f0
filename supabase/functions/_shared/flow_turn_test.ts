// @ts-nocheck
import { assertEquals, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlowTurn } from './flow-turn.ts'

const steps = [
  {
    id: '1',
    step_code: 'inicio',
    messages: { 'pt-BR': 'Olá!' },
    validation: { step_kind: 'INICIO' },
    next_step_code: 'interesse',
  },
  {
    id: '2',
    step_code: 'interesse',
    messages: { 'pt-BR': 'O que você busca hoje?' },
    answer_type: 'TEXTO_LIVRE',
    validation: {
      step_kind: 'PERGUNTA',
      ack_ai: true,
      ack_enabled: true,
      kb_check: { enabled: true, attempts: 1, on_invalid: 'REPERGUNTAR', normalize: true, messages: {} },
    },
    next_step_code: 'fim',
  },
  {
    id: '3',
    step_code: 'fim',
    messages: { 'pt-BR': 'Obrigada! Vou te encaminhar.' },
    validation: { step_kind: 'FIM' },
    handoff: true,
  },
]

const state = { current_step: 'interesse', answers: {}, visited: ['inicio'], lang: 'pt-BR' }
const kbSearch = () => Promise.resolve('[servicos.pdf | 0]\nArraigo Social, Nacionalidade, Reagrupamento.')

Deno.test('KB check válido: normaliza a resposta, gera ack e avança', async () => {
  const calls: string[] = []
  const callLLM = (prompt: string) => {
    calls.push(prompt)
    if (prompt.includes('Responda APENAS com JSON')) {
      return Promise.resolve('{"valid": true, "value": "Arraigo Social", "reply": ""}')
    }
    return Promise.resolve('Ótimo, entendi!')
  }
  const turn = await advanceFlowTurn(steps, state, 'quero arraigo', 'pt-BR', { callLLM, kbSearch })
  assertEquals(turn.state.answers.interesse, 'Arraigo Social')
  assertEquals(turn.messages[0], 'Ótimo, entendi!')
  assert(turn.finished)
  assertEquals(calls.length, 2)
})

Deno.test('KB check inválido: explica e repergunta a mesma etapa', async () => {
  const callLLM = () =>
    Promise.resolve('{"valid": false, "value": "", "reply": "Não trabalhamos com isso. Atendemos Arraigo e Nacionalidade. O que você busca?"}')
  const turn = await advanceFlowTurn(steps, state, 'quero comprar um carro', 'pt-BR', { callLLM, kbSearch })
  assertEquals(turn.state.current_step, 'interesse')
  assertEquals(turn.state.kb_attempts, 1)
  assert(turn.reasked)
  assert(turn.messages[0].includes('Arraigo'))
})

Deno.test('Sem LLM/base: fluxo segue normalmente (não trava)', async () => {
  const turn = await advanceFlowTurn(steps, state, 'quero arraigo', 'pt-BR', {})
  assertEquals(turn.state.answers.interesse, 'quero arraigo')
  assert(turn.finished)
})

Deno.test('Modo SEGUIR: após as tentativas, grava como veio e avança', async () => {
  const seguirSteps = JSON.parse(JSON.stringify(steps))
  seguirSteps[1].validation.kb_check.on_invalid = 'SEGUIR'
  const callLLM = () => Promise.resolve('{"valid": false, "value": "", "reply": "Não atendemos isso."}')
  const turn = await advanceFlowTurn(
    seguirSteps,
    { ...state, kb_attempts: 1 },
    'outra coisa',
    'pt-BR',
    { callLLM, kbSearch },
  )
  assertEquals(turn.state.answers.interesse, 'outra coisa')
  assert(turn.finished)
})
