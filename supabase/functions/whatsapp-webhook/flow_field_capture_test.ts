import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { inferFieldMapping, advanceFlow, startFlow, type FlowStep } from '../_shared/flow-engine.ts'

const step = (over: Partial<FlowStep>): FlowStep => ({
  step_code: 'x',
  name: 'x',
  message: 'x',
  answer_type: 'TEXTO_LIVRE',
  ...(over as any),
}) as FlowStep

Deno.test('mapeamento explícito tem prioridade', () => {
  assertEquals(inferFieldMapping(step({ field_mapping: 'contact.email', answer_type: 'NOME' })), 'contact.email')
})

Deno.test('inferência por tipo de resposta', () => {
  assertEquals(inferFieldMapping(step({ answer_type: 'EMAIL' })), 'contact.email')
  assertEquals(inferFieldMapping(step({ answer_type: 'NOME' })), 'contact.full_name')
})

Deno.test('inferência por código da etapa', () => {
  assertEquals(inferFieldMapping(step({ step_code: 'msg_b3_esta_empadronado', answer_type: 'SIM_NAO' })), 'funnel.empadronado_confirmed')
  assertEquals(inferFieldMapping(step({ step_code: 'msg_b5_cidade_do_empadronamento' })), 'funnel.empadronado_city')
  assertEquals(inferFieldMapping(step({ step_code: 'msg_b2_data_de_entrada_na_espanha', answer_type: 'DATA' })), 'funnel.entry_date_confirmed')
  assertEquals(inferFieldMapping(step({ step_code: 'msg_a2_perguntar_idade', answer_type: 'NUMERO' })), 'outside.age')
  assertEquals(inferFieldMapping(step({ step_code: 'msg_a5_trabalha_remoto', answer_type: 'SIM_NAO' })), 'outside.remote_work')
  assertEquals(inferFieldMapping(step({ step_code: 'msg_7_perguntar_localizacao', answer_type: 'SIM_NAO' })), 'funnel.location_known')
})

Deno.test('etapa sem correspondência segura não grava nada', () => {
  assertEquals(inferFieldMapping(step({ step_code: 'msg_h3_encaminhar_para_especialista' })), null)
  assertEquals(inferFieldMapping(step({ step_code: 'fim_atendimento_humano' })), null)
})

Deno.test('resposta válida é capturada com o destino inferido', () => {
  const steps: FlowStep[] = [
    step({ step_code: 'inicio', answer_type: 'TEXTO_LIVRE', validation: { step_kind: 'INICIO' }, next_step_code: 'nome' }),
    step({ step_code: 'nome', name: 'Coletar nome completo', answer_type: 'NOME', next_step_code: 'email' }),
    step({ step_code: 'email', name: 'Coletar e-mail', answer_type: 'EMAIL', next_step_code: null }),
  ]
  const first = startFlow(steps, 'pt-BR')
  const turn = advanceFlow(steps, first.state, 'Maria Silva Santos', 'pt-BR')
  assertEquals(turn.captured.length, 1)
  assertEquals(turn.captured[0].field, 'contact.full_name')
  assertEquals(turn.captured[0].value, 'Maria Silva Santos')
})
