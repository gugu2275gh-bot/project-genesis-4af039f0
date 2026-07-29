import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { startFlow } from './flow-engine.ts'
import { applyRequiredGate } from './flow-required.ts'

/** Fluxo "Conversa natural" reduzido: 2 perguntas gerais + transferência. */
const steps: any[] = [
  {
    step_code: 'dados_pessoais',
    order_index: 1,
    answer_type: 'TEXTO_LIVRE',
    message: 'Olá, {nome}! Me comente um pouco sobre você (idade, onde mora...)',
    next_step_code: 'objetivo',
    validation: {
      step_kind: 'PERGUNTA_GERAL',
      general_capture: {
        enabled: true,
        min_fields: 2,
        min_confidence: 0.7,
        fields: [
          { source: 'full_name', target_field: 'contact.full_name', required: true },
          { source: 'age', target_field: 'outside.age', required: true },
          { source: 'city', target_field: 'funnel.empadronado_city', required: true },
        ],
      },
    },
  },
  {
    step_code: 'objetivo',
    order_index: 2,
    answer_type: 'TEXTO_LIVRE',
    message: 'E qual o seu objetivo na Espanha?',
    next_step_code: null,
    validation: { step_kind: 'PERGUNTA_GERAL', general_capture: { enabled: true, fields: [] } },
  },
]

Deno.test('"oi": a pergunta geral é enviada e já marca o obrigatório que falta', () => {
  const turn = startFlow(steps as any, 'pt-BR')
  const gated = applyRequiredGate(steps as any, turn, 'pt-BR', { 'contact.full_name': 'Rose Carla' })
  assertEquals(gated.state.current_step, 'dados_pessoais')
  assertEquals(gated.messages.join(' ').includes('Me comente um pouco sobre você'), true)
  // "idade" já está no texto da etapa: não duplica a bolha, mas fica pendente
  assertEquals(gated.state.required_field, 'outside.age')
})

Deno.test('nome ausente é cobrado JUNTO com a pergunta geral', () => {
  const turn = startFlow(steps as any, 'pt-BR')
  const gated = applyRequiredGate(steps as any, turn, 'pt-BR', {})
  const text = gated.messages.join(' ')
  assertEquals(text.includes('Me comente um pouco sobre você'), true)
  assertEquals(text.toLowerCase().includes('nome'), true)
  assertEquals(gated.state.required_field, 'contact.full_name')
  assertEquals(gated.finished, false)
})

Deno.test('todos os obrigatórios conhecidos: nenhuma cobrança extra', () => {
  const turn = startFlow(steps as any, 'pt-BR')
  const gated = applyRequiredGate(steps as any, turn, 'pt-BR', {
    'contact.full_name': 'Rose Carla',
    'outside.age': '34',
    'funnel.empadronado_city': 'Madrid',
  })
  assertEquals(gated.state.required_field || '', '')
  assertEquals(gated.messages.length, turn.messages.length)
})

Deno.test('etapa já apresentada cobra o obrigatório que falta (abaixo do mínimo)', () => {
  const base = startFlow(steps as any, 'pt-BR')
  const already = { ...base, outbound: [], messages: [], reasked: true } as any
  const gated = applyRequiredGate(steps as any, already, 'pt-BR', {
    'contact.full_name': 'Rose Carla',
  })
  assertEquals(gated.state.required_field, 'outside.age')
})

Deno.test('mínimo atingido NÃO dispensa obrigatório: a cidade ainda é cobrada', () => {
  const base = startFlow(steps as any, 'pt-BR')
  const already = { ...base, outbound: [], messages: [], reasked: true } as any
  const gated = applyRequiredGate(steps as any, already, 'pt-BR', {
    'contact.full_name': 'Rose Carla',
    'outside.age': '34',
  })
  assertEquals(gated.state.required_field, 'funnel.empadronado_city')
})



Deno.test('handoff não acontece com obrigatório vazio', () => {
  const finished = {
    messages: ['Vou te transferir agora'],
    outbound: [{ text: 'Vou te transferir agora', step_code: 'objetivo', quick_reply: false }],
    state: { current_step: 'objetivo', answers: { dados_pessoais: 'age: 49' }, captured_fields: { 'outside.age': '49' } },
    reasked: false,
    finished: true,
    handoff: true,
    path: ['dados_pessoais', 'objetivo'],
    captured: [],
  } as any
  const gated = applyRequiredGate(steps as any, finished, 'pt-BR', {})
  assertEquals(gated.finished, false)
  assertEquals(gated.handoff, false)
  assertEquals(gated.state.current_step, 'dados_pessoais')
  assertEquals(gated.state.required_field, 'contact.full_name')
})



// --- "Dados suficientes para pular esta etapa" -------------------------------

import { generalCaptureSatisfied } from './flow-required.ts'

Deno.test('mínimo atingido e sem obrigatório pendente: etapa satisfeita', () => {
  const known = {
    'contact.full_name': 'Julio',
    'outside.age': '34',
    'funnel.empadronado_city': 'Recife',
  }
  assertEquals(generalCaptureSatisfied(steps[0] as any, known), true)
})

Deno.test('mínimo atingido libera o avanço mesmo com obrigatório vazio', () => {
  const known = { 'contact.full_name': 'Julio', 'outside.age': '34' }
  // min_fields = 2 atingido: a cidade fica em branco e o fluxo segue
  assertEquals(generalCaptureSatisfied(steps[0] as any, known), true)
})


Deno.test('obrigatório dispensado (skipped) libera o avanço', () => {
  const known = { 'contact.full_name': 'Julio', 'outside.age': '34' }
  assertEquals(
    generalCaptureSatisfied(steps[0] as any, known, ['funnel.empadronado_city']),
    true,
  )
})

// --- Nada de dado inventado ---------------------------------------------------

import { isNonAnswer } from './flow-required.ts'

Deno.test('respostas de escape não podem virar valor de campo', () => {
  for (const t of ['Falar com atendente', 'não sei', 'no sé', "I don't know", 'ok', 'atendente']) {
    assertEquals(isNonAnswer(t), true, t)
  }
  for (const t of ['Brasil', '49 anos', 'sim', 'não']) {
    assertEquals(isNonAnswer(t), false, t)
  }
})
