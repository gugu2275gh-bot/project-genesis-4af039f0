import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { startFlow, advanceFlow, quickReplyOf } from '../_shared/flow-engine.ts'
import { isBinaryYesNoQuestion } from '../whatsapp-webhook/lib/quick-reply.ts'

const steps = [
  {
    id: '1',
    step_code: 'inicio',
    messages: { 'es': '¿Hoy ya estás en España?' },
    answer_type: 'SIM_NAO',
    validation: { step_kind: 'PERGUNTA' },
    next_step_code: 'fim',
    order_index: 1,
  },
  {
    id: '2',
    step_code: 'fim',
    messages: { 'es': 'Gracias.' },
    validation: { step_kind: 'FIM' },
    order_index: 2,
  },
] as any[]

Deno.test('etapa SIM_NAO sem quick_reply → sem botões mesmo casando com a regex legada', () => {
  const turn = startFlow(steps, 'es')
  assertEquals(turn.outbound.length, 1)
  assertEquals(turn.outbound[0].quick_reply, false)
  // A heurística legada casaria com este texto — não pode ser consultada no fluxo.
  assertEquals(isBinaryYesNoQuestion(turn.outbound[0].text), true)
})

Deno.test('etapa com quick_reply ligado → botões', () => {
  const withQr = [{ ...steps[0], validation: { step_kind: 'PERGUNTA', quick_reply: true } }, steps[1]]
  const turn = startFlow(withQr as any, 'es')
  assertEquals(turn.outbound[0].quick_reply, true)
})

Deno.test('quick_reply ignorado quando a resposta não é binária', () => {
  const notYesNo = { ...steps[0], answer_type: 'TEXTO', validation: { step_kind: 'PERGUNTA', quick_reply: true } }
  assertEquals(quickReplyOf(notYesNo as any), false)
})

Deno.test('texto enviado é idêntico ao configurado na etapa', () => {
  const turn = startFlow(steps, 'es')
  assertEquals(turn.outbound[0].text, '¿Hoy ya estás en España?')
})

Deno.test('repergunta herda a configuração de botões da etapa', () => {
  const withQr = [
    { ...steps[0], validation: { step_kind: 'PERGUNTA', quick_reply: true, required: true }, reask_messages: { es: '¿Sí o no?' } },
    steps[1],
  ]
  const first = startFlow(withQr as any, 'es')
  const turn = advanceFlow(withQr as any, first.state, '', 'es')
  assertEquals(turn.reasked, true)
  assertEquals(turn.outbound[0].quick_reply, true)
})
