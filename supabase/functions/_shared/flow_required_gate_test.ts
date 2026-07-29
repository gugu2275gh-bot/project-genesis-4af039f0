import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { startFlow, startFlowWithPrefill } from './flow-engine.ts'
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

Deno.test('"oi": a pergunta geral é enviada mesmo com o nome vindo do WhatsApp', () => {
  const turn = startFlow(steps as any, 'pt-BR')
  const gated = applyRequiredGate(steps as any, turn, 'pt-BR', { 'contact.full_name': 'Rose Carla' })
  assertEquals(gated.state.current_step, 'dados_pessoais')
  assertEquals(gated.messages.join(' ').includes('Me comente um pouco sobre você'), true)
  assertEquals(gated.state.required_field || '', '')
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

