// @ts-nocheck
/**
 * Cobertura da "resposta e retomada" (turno com base de conhecimento).
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  composeAnswerAndReask,
  defaultAsideAck,
  looksLikeQuestion,
} from '../_shared/flow-answer-reask.ts'
import { advanceFlowTurn } from '../_shared/flow-turn.ts'
import { advanceFlow } from '../_shared/flow-engine.ts'

const steps = [
  {
    step_code: 'NOME',
    order_index: 1,
    messages: { 'pt-BR': ['Qual é o seu nome completo?'] },
    answer_type: 'TEXTO',
    validation: { step_kind: 'PERGUNTA', required: true, min: 5 },
    branches: [],
    next_step_code: 'DATA',
  },
  {
    step_code: 'DATA',
    order_index: 2,
    messages: { 'pt-BR': ['Quando você entrou na Espanha?'] },
    answer_type: 'DATA',
    validation: { step_kind: 'PERGUNTA', required: true, fallback_step_code: '' },
    branches: [],
    next_step_code: '',
  },
]

const stateNome = { current_step: 'NOME', answers: {}, attempts: 0, lang: 'pt-BR' }

Deno.test('looksLikeQuestion reconhece perguntas nos 4 idiomas', () => {
  assert(looksLikeQuestion('quanto custa o processo?'))
  assert(looksLikeQuestion('Cuánto cuesta el arraigo'))
  assert(looksLikeQuestion('How long does it take'))
  assert(looksLikeQuestion('Combien de temps ça prend'))
})

Deno.test('looksLikeQuestion não gera falso positivo em respostas normais', () => {
  assertEquals(looksLikeQuestion('sim'), false)
  assertEquals(looksLikeQuestion('Pedro Oliveira'), false)
  assertEquals(looksLikeQuestion('12/03/2024'), false)
  assertEquals(looksLikeQuestion(''), false)
})

Deno.test('composeAnswerAndReask junta resposta e pergunta em uma bolha', () => {
  const out = composeAnswerAndReask('O prazo médio é de 3 meses.', 'Qual é o seu nome completo?', 'pt-BR')
  assert(out.includes('O prazo médio é de 3 meses.'))
  assert(out.includes('Voltando ao seu caso:'))
  assert(out.includes('Qual é o seu nome completo?'))
  assertEquals(out.split('\n\n').length, 2)

  const es = composeAnswerAndReask('El plazo es de 3 meses.', '¿Cuál es tu nombre?', 'es')
  assert(es.includes('Volviendo a tu caso:'))
})

Deno.test('composeAnswerAndReask sem resposta devolve só a pergunta', () => {
  assertEquals(composeAnswerAndReask('', 'Qual é o seu nome?', 'pt-BR'), 'Qual é o seu nome?')
})

Deno.test('dúvida fora do tema: uma única mensagem com resposta + repergunta', async () => {
  const turn = await advanceFlowTurn(steps, stateNome, 'quanto custa o processo?', 'pt-BR', {
    callLLM: async () => 'O valor depende do serviço, a partir de 500 euros.',
    kbSearch: async () => '[precos.pdf | 1]\nServiços a partir de 500 euros.',
  })
  assertEquals(turn.state.current_step, 'NOME')
  assertEquals(turn.state.answers['NOME'], undefined)
  assertEquals(turn.outbound.length, 1)
  assert(turn.outbound[0].text.includes('500 euros'))
  assert(turn.outbound[0].text.includes('Qual é o seu nome completo?'))
})

Deno.test('sem base disponível usa o reconhecimento padrão e mantém a pergunta', async () => {
  const turn = await advanceFlowTurn(steps, stateNome, 'e o visto de nômade?', 'pt-BR', {
    callLLM: async () => 'SEM_RESPOSTA',
    kbSearch: async () => '',
  })
  assertEquals(turn.outbound.length, 1)
  assert(turn.outbound[0].text.includes(defaultAsideAck('pt-BR')))
  assert(turn.outbound[0].text.includes('Qual é o seu nome completo?'))
})

Deno.test('LLM travado não segura o turno (timeout aplica fallback)', async () => {
  const t0 = Date.now()
  const turn = await advanceFlowTurn(steps, stateNome, 'como funciona?', 'pt-BR', {
    callLLM: () => new Promise(() => {}),
    kbSearch: async () => '[faq.pdf | 1]\nconteúdo',
  })
  const elapsed = Date.now() - t0
  assert(elapsed < 9000, `turno demorou demais: ${elapsed}ms`)
  assertEquals(turn.state.current_step, 'NOME')
  assert(turn.outbound[0].text.includes('Qual é o seu nome completo?'))
})

Deno.test('resposta válida não dispara busca na base', async () => {
  let searched = 0
  const turn = await advanceFlowTurn(steps, stateNome, 'Pedro Oliveira', 'pt-BR', {
    callLLM: async () => '',
    kbSearch: async () => {
      searched++
      return ''
    },
  })
  assertEquals(searched, 0)
  assertEquals(turn.state.current_step, 'DATA')
})

Deno.test('data aproximada é aceita já na primeira falha', () => {
  const state = { current_step: 'DATA', answers: {}, attempts: 0, lang: 'pt-BR' }
  const r = advanceFlow(steps, state, 'Maio de 2026', 'pt-BR')
  assertEquals(r.reasked, false)
  assertEquals(r.state.answers['DATA'], '01/05/2026')
})
