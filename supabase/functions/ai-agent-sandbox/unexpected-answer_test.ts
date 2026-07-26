// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlow, isUnknownAnswer, parseApproxDate } from '../_shared/flow-engine.ts'

/** Fluxo mínimo: DATA_ENTRADA → PROXIMA (e uma etapa de fallback separada). */
function buildSteps(unknownAnswer: Record<string, unknown>) {
  return [
    {
      id: '1',
      step_code: 'DATA_ENTRADA',
      order_index: 1,
      answer_type: 'DATA',
      field_mapping: 'contacts.entry_date',
      validation: { step_kind: 'PERGUNTA', required: true, max_reasks: 2, fallback_step_code: 'ESPECIALISTA', unknown_answer: unknownAnswer },
      messages: {
        'pt-BR': 'Qual a data de entrada no país?',
        es: '¿Cuál es la fecha de entrada al país?',
        en: 'What is your date of entry into the country?',
        fr: 'Quelle est votre date d’entrée dans le pays ?',
      },
      next_step_code: 'PROXIMA',
    },
    {
      id: '2',
      step_code: 'PROXIMA',
      order_index: 2,
      answer_type: 'TEXTO_LIVRE',
      validation: { step_kind: 'PERGUNTA' },
      messages: { 'pt-BR': 'Qual seu e-mail?', es: '¿Cuál es tu correo?', en: 'What is your email?', fr: 'Quel est votre e-mail ?' },
      next_step_code: null,
    },
    {
      id: '3',
      step_code: 'ESPECIALISTA',
      order_index: 3,
      validation: { step_kind: 'FIM' },
      handoff: true,
      messages: { 'pt-BR': 'Vou te encaminhar para um especialista.' },
    },
  ]
}

const baseState = { current_step: 'DATA_ENTRADA', answers: {}, visited: ['DATA_ENTRADA'], attempts: 0 }

Deno.test('detecção de "não sei" nos 4 idiomas', () => {
  assertEquals(isUnknownAnswer('não lembro', undefined), true)
  assertEquals(isUnknownAnswer('No recuerdo la fecha', undefined), true)
  assertEquals(isUnknownAnswer("I don't remember", undefined), true)
  assertEquals(isUnknownAnswer('Je ne sais pas', undefined), true)
  assertEquals(isUnknownAnswer('24/01/2026', undefined), false)
})

Deno.test('frase personalizada da etapa também é reconhecida', () => {
  const cfg = { mode: 'PULAR', messages: {}, attempts: 1, fallback_value: '', phrases: ['perdi o passaporte'] }
  assertEquals(isUnknownAnswer('Perdi o passaporte', cfg), true)
})

Deno.test('primeira vez sempre acolhe pedindo aproximado, sem sair da etapa', () => {
  const steps = buildSteps({ mode: 'PULAR', attempts: 1, fallback_value: 'NÃO INFORMADO' })
  const r = advanceFlow(steps, baseState, 'não lembro', 'pt-BR')
  assertEquals(r.state.current_step, 'DATA_ENTRADA')
  assertEquals(r.reasked, true)
  assertEquals(r.state.unknown_attempts, 1)
  assertEquals(r.messages.length, 1)
})

Deno.test('modo PULAR grava valor de reserva e segue para a próxima etapa normal', () => {
  const steps = buildSteps({ mode: 'PULAR', attempts: 1, fallback_value: 'NÃO INFORMADO' })
  const s1 = advanceFlow(steps, baseState, 'não sei', 'pt-BR')
  const s2 = advanceFlow(steps, s1.state, 'não sei mesmo', 'pt-BR')
  assertEquals(s2.state.current_step, 'PROXIMA')
  assertEquals(s2.state.answers.DATA_ENTRADA, 'NÃO INFORMADO')
  assertEquals(s2.captured[0].value, 'NÃO INFORMADO')
  assertEquals(s2.state.unknown_attempts, 0)
})

Deno.test('modo INSISTIR insiste e, esgotado, escala em vez de repetir para sempre', () => {
  const steps = buildSteps({ mode: 'INSISTIR', attempts: 1 })
  const s1 = advanceFlow(steps, baseState, 'no sé', 'es')
  assertEquals(s1.state.current_step, 'DATA_ENTRADA')
  assertEquals(s1.reasked, true)
  const s2 = advanceFlow(steps, s1.state, 'no sé', 'es')
  // Sem etapa de fallback e sem data aproximada: encerra o bot e passa para humano.
  assertEquals(s2.handoff, true)
  assertEquals(s2.finished, true)
  assertEquals(s2.reasked, false)
})


Deno.test('modo ENCAMINHAR usa a etapa de fallback configurada', () => {
  const steps = buildSteps({ mode: 'ENCAMINHAR', attempts: 0 })
  const r = advanceFlow(steps, baseState, "I don't know", 'en')
  assertEquals(r.state.current_step, 'ESPECIALISTA')
  assertEquals(r.handoff, true)
})

Deno.test('modo ACEITAR_APROXIMADO aceita mês/ano e normaliza para DD/MM/AAAA', () => {
  const steps = buildSteps({ mode: 'ACEITAR_APROXIMADO', attempts: 1, fallback_value: 'APROXIMADO' })
  const r = advanceFlow(steps, baseState, 'foi por 03/2024', 'pt-BR')
  assertEquals(r.state.answers.DATA_ENTRADA, '01/03/2024')
  assertEquals(r.state.current_step, 'PROXIMA')
})

Deno.test('parseApproxDate entende ano isolado e mês por extenso', () => {
  assertEquals(parseApproxDate('cheguei em 2023'), '01/01/2023')
  assertEquals(parseApproxDate('março de 2024'), '01/03/2024')
  assertEquals(parseApproxDate('não faço ideia'), null)
})

Deno.test('resposta válida continua avançando normalmente (sem regressão)', () => {
  const steps = buildSteps({ mode: 'PULAR', attempts: 1, fallback_value: 'NÃO INFORMADO' })
  const r = advanceFlow(steps, baseState, '24/01/2026', 'pt-BR')
  assertEquals(r.state.answers.DATA_ENTRADA, '24/01/2026')
  assertEquals(r.state.current_step, 'PROXIMA')
})

/* ------- tratativas por situação (resposta diferente do esperado) --------- */

import { unexpectedAnswerOf, ruleFor } from '../_shared/flow-engine.ts'

function buildNew(unexpected: Record<string, unknown>) {
  const steps = buildSteps({})
  steps[0].validation = {
    step_kind: 'PERGUNTA', required: true, max_reasks: 2,
    fallback_step_code: 'ESPECIALISTA', unexpected_answer: unexpected,
  }
  return steps
}

Deno.test('retrocompatibilidade: unknown_answer antigo vira a regra "unknown"', () => {
  const steps = buildSteps({ mode: 'PULAR', attempts: 1, fallback_value: 'NÃO INFORMADO' })
  const cfg = unexpectedAnswerOf(steps[0] as any)
  assertEquals(cfg.unknown.mode, 'PULAR')
  assertEquals(cfg.unknown.fallback_value, 'NÃO INFORMADO')
  // situações não configuradas herdam a regra de "não sabe"
  assertEquals(ruleFor(cfg, 'invalid_format').mode, 'PULAR')
})

Deno.test('formato inválido usa tratativa própria quando ativada', () => {
  const steps = buildNew({
    unknown: { enabled: true, mode: 'INSISTIR', attempts: 1 },
    invalid_format: { enabled: true, mode: 'PULAR', attempts: 1, fallback_value: 'FORMATO INVALIDO', messages: { 'pt-BR': 'Formato estranho, pode repetir?' } },
  })
  const s1 = advanceFlow(steps, baseState, 'ontem', 'pt-BR')
  assertEquals(s1.state.current_step, 'DATA_ENTRADA')
  assertEquals(s1.messages[0], 'Formato estranho, pode repetir?')
  const s2 = advanceFlow(steps, s1.state, 'anteontem', 'pt-BR')
  assertEquals(s2.state.current_step, 'PROXIMA')
  assertEquals(s2.state.answers.DATA_ENTRADA, 'FORMATO INVALIDO')
})

Deno.test('formato inválido sem tratativa própria mantém comportamento antigo (repergunta)', () => {
  const steps = buildNew({ unknown: { enabled: true, mode: 'INSISTIR', attempts: 1 } })
  const r = advanceFlow(steps, baseState, 'ontem', 'pt-BR')
  assertEquals(r.reasked, true)
  assertEquals(r.state.current_step, 'DATA_ENTRADA')
  assertEquals(r.state.attempts, 1)
})

Deno.test('resposta vazia cai na situação off_topic quando configurada', () => {
  const steps = buildNew({
    unknown: { enabled: true, mode: 'INSISTIR', attempts: 1 },
    off_topic: { enabled: true, mode: 'ENCAMINHAR', attempts: 0 },
  })
  const r = advanceFlow(steps, baseState, '   ', 'pt-BR')
  assertEquals(r.state.current_step, 'ESPECIALISTA')
  assertEquals(r.handoff, true)
})

Deno.test('caso Roberto: após "não sei", mês/ano é aceito e o fluxo avança', () => {
  const steps = buildSteps({ mode: 'INSISTIR', attempts: 1 })
  const s1 = advanceFlow(steps, baseState, 'Nao sei', 'pt-BR')
  assertEquals(s1.state.current_step, 'DATA_ENTRADA')
  const s2 = advanceFlow(steps, s1.state, 'Maio de 2026', 'pt-BR')
  assertEquals(s2.state.answers.DATA_ENTRADA, '01/05/2026')
  assertEquals(s2.state.current_step, 'PROXIMA')
})
