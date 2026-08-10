// @ts-nocheck
import { assert, assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlowTurn } from './flow-turn.ts'
import { asideAnswerOf, looksLikeQuestion } from './flow-answer-reask.ts'

function buildSteps(aside?: Record<string, unknown>) {
  return [
    {
      id: '1',
      step_code: 'objetivo',
      order_index: 1,
      answer_type: 'TEXTO_LIVRE',
      messages: { 'pt-BR': 'Qual é o seu objetivo na Espanha?' },
      validation: { step_kind: 'PERGUNTA', ...(aside ? { aside_answer: aside } : {}) },
      next_step_code: 'fim',
    },
    {
      id: '2',
      step_code: 'fim',
      order_index: 2,
      messages: { 'pt-BR': 'Obrigada! Vou te encaminhar.' },
      validation: { step_kind: 'FIM' },
      handoff: true,
    },
  ]
}

const state = { current_step: 'objetivo', answers: {}, visited: ['objetivo'], lang: 'pt-BR' }
const kbSearch = () => Promise.resolve('[kb.pdf | 0]\nArraigo de Segunda Oportunidade é um mecanismo...')
const callLLM = () => Promise.resolve('O Arraigo de Segunda Oportunidade é um mecanismo de regularização.')

Deno.test('sem configuração, mantém o comportamento antigo (responde pela base)', async () => {
  const turn = await advanceFlowTurn(buildSteps(), state, 'o que é arraigo de segunda oportunidade?', 'pt-BR', { callLLM, kbSearch })
  assertEquals(turn.state.current_step, 'objetivo')
  assert(turn.messages[0].includes('Arraigo'))
  assert(turn.messages[0].includes('Voltando ao seu caso'))
})

Deno.test('mensagem curta como "?" nunca vira dúvida (min_chars)', () => {
  assertEquals(looksLikeQuestion('?', 12), false)
  assertEquals(looksLikeQuestion('o que é arraigo social?', 12), true)
})

Deno.test('modo SO_RETOMAR: "?" só repete a pergunta da etapa, sem base', async () => {
  const steps = buildSteps({ mode: 'SO_RETOMAR' })
  const turn = await advanceFlowTurn(steps, state, '?', 'pt-BR', { callLLM, kbSearch })
  assertEquals(turn.state.current_step, 'objetivo')
  assertEquals(turn.messages[0], 'Qual é o seu objetivo na Espanha?')
})

Deno.test('modo SO_RETOMAR: dúvida longa também só retoma a pergunta', async () => {
  const steps = buildSteps({ mode: 'SO_RETOMAR' })
  const turn = await advanceFlowTurn(steps, state, 'o que é arraigo de segunda oportunidade?', 'pt-BR', { callLLM, kbSearch })
  assertEquals(turn.messages[0], 'Qual é o seu objetivo na Espanha?')
})

Deno.test('modo MENSAGEM_FIXA: usa o texto cadastrado + a pergunta da etapa', async () => {
  const steps = buildSteps({ mode: 'MENSAGEM_FIXA', messages: { 'pt-BR': 'Um especialista vai te explicar isso em detalhe.' } })
  const turn = await advanceFlowTurn(steps, state, 'o que é arraigo de segunda oportunidade?', 'pt-BR', { callLLM, kbSearch })
  assert(turn.messages[0].startsWith('Um especialista'))
  assert(turn.messages[0].includes('Qual é o seu objetivo na Espanha?'))
})

Deno.test('limite de respostas por etapa: depois disso o fluxo segue normalmente', async () => {
  const steps = buildSteps({ mode: 'RESPONDER_BASE', attempts: 1 })
  const t1 = await advanceFlowTurn(steps, state, 'o que é arraigo social?', 'pt-BR', { callLLM, kbSearch })
  assertEquals(t1.state.aside_attempts, 1)
  const t2 = await advanceFlowTurn(steps, t1.state, 'e quanto custa isso?', 'pt-BR', { callLLM, kbSearch })
  assertEquals(t2.state.current_step, 'fim')
})

Deno.test('asideAnswerOf lê a configuração da etapa com padrões seguros', () => {
  assertEquals(asideAnswerOf({ validation: {} }).mode, 'RESPONDER_BASE')
  const cfg = asideAnswerOf({ validation: { aside_answer: { mode: 'SO_RETOMAR', min_chars: 30, attempts: 0 } } })
  assertEquals(cfg.mode, 'SO_RETOMAR')
  assertEquals(cfg.min_chars, 30)
  assertEquals(cfg.attempts, 0)
})
