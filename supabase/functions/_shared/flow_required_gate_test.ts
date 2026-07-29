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
  assertEquals(text.toLowerCase().includes('nome completo'), true)
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

Deno.test('etapa já apresentada cobra o obrigatório que falta', () => {
  const base = startFlow(steps as any, 'pt-BR')
  const already = { ...base, outbound: [], messages: [], reasked: true } as any
  const gated = applyRequiredGate(steps as any, already, 'pt-BR', {
    'contact.full_name': 'Rose Carla',
    'outside.age': '34',
  })
  assertEquals(gated.state.required_field, 'funnel.empadronado_city')
  assertEquals(gated.messages.join(' ').toLowerCase().includes('cidade'), true)
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


