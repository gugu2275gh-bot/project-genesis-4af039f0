// @ts-nocheck
/**
 * Continuidade do fluxo pré-handoff com aproveitamento da 1ª mensagem.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { advanceFlow, startFlowWithPrefill, startFlow } from './flow-engine.ts'
import {
  DEFAULT_INTAKE_CONFIG,
  extractionToFieldValues,
  normalizeIntakeConfig,
  parseIntakeJson,
  prefillFromFieldValues,
  renderAckMessage,
  renderIntakeGreeting,
  runIntake,
} from './flow-intake.ts'

const STEPS = [
  { step_code: 'inicio', name: 'Início', step_kind: 'INICIO', message: { 'pt-BR': 'Olá!', en: 'Hello!' }, next_step_code: 'nome' },
  { step_code: 'nome', name: 'Nome completo', step_kind: 'PERGUNTA', answer_type: 'NOME', message: { 'pt-BR': 'Qual seu nome completo?', en: 'What is your full name?' }, next_step_code: 'local' },
  { step_code: 'local', name: 'Está na Espanha', step_kind: 'PERGUNTA', answer_type: 'SIM_NAO', message: { 'pt-BR': 'Você já está na Espanha?', en: 'Are you already in Spain?' }, branches: [{ value: 'sim', next_step_code: 'entrada' }, { value: 'nao', next_step_code: 'interesse' }] },
  { step_code: 'entrada', name: 'Data de entrada na Espanha', step_kind: 'PERGUNTA', answer_type: 'DATA', message: { 'pt-BR': 'Qual a data de entrada?', en: 'Entry date?' }, next_step_code: 'interesse' },
  { step_code: 'interesse', name: 'O que busca hoje', step_kind: 'PERGUNTA', answer_type: 'TEXTO_LIVRE', message: { 'pt-BR': 'O que você busca hoje?', en: 'What are you looking for?' }, next_step_code: 'email' },
  { step_code: 'email', name: 'E-mail', step_kind: 'PERGUNTA', answer_type: 'EMAIL', message: { 'pt-BR': 'Qual seu e-mail?', en: 'Your email?' }, next_step_code: 'fim' },
  { step_code: 'fim', name: 'Encaminhamento', step_kind: 'FIM', handoff: true, message: { 'pt-BR': 'Vou te encaminhar.', en: 'Transferring you.' } },
]

const CFG = normalizeIntakeConfig({ enabled: true, min_confidence: 0.7 })

const llmWith = (payload: unknown) => async () => JSON.stringify(payload)

const FRED = {
  full_name: 'Fred',
  in_spain: 'sim',
  intent: 'estudar',
  arrival_days_ago: 5,
  confidence: { full_name: 0.95, in_spain: 0.95, intent: 0.9, arrival_date: 0.9 },
}

const ROBERT = {
  full_name: 'Robert',
  in_spain: 'nao',
  intent: 'work',
  confidence: { full_name: 0.95, in_spain: 0.9, intent: 0.9 },
}

Deno.test('Fred: aproveita nome, localização, entrada e interesse; para no e-mail', async () => {
  const res = await runIntake({
    message: 'Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar',
    steps: STEPS,
    lang: 'pt-BR',
    config: CFG,
    callLLM: llmWith(FRED),
  })

  assertEquals(Object.keys(res.prefilled).sort(), ['entrada', 'interesse', 'local', 'nome'])
  assert(res.greeting.includes('Fred'))

  const turn = startFlowWithPrefill(STEPS, 'pt-BR', res.prefilled)
  assertEquals(turn.state.current_step, 'email')
  assertEquals(turn.messages, ['Olá!', 'Qual seu e-mail?'])
  // Nenhuma pergunta aproveitada é reenviada.
  for (const q of ['nome', 'Espanha', 'data de entrada', 'busca hoje']) {
    assert(!turn.messages.join(' ').toLowerCase().includes(q.toLowerCase()))
  }
  // Dados aproveitados vão para o CRM.
  const fields = turn.captured.map((c) => c.field).sort()
  assert(fields.includes('contact.full_name'))
  assert(fields.includes('funnel.location_known'))
  assert(fields.includes('funnel.interest_confirmed'))
})

Deno.test('Robert: fora da Espanha segue o ramo "nao" e responde em inglês', async () => {
  const res = await runIntake({
    message: 'My name is Robert. I live in US and want to go to Spain to work.',
    steps: STEPS,
    lang: 'en',
    config: CFG,
    callLLM: llmWith(ROBERT),
  })

  assertEquals(res.prefilled['local'], 'nao')
  const turn = startFlowWithPrefill(STEPS, 'en', res.prefilled)
  // Pulou a data de entrada (ramo "nao") e a pergunta de interesse (aproveitada).
  assertEquals(turn.state.current_step, 'email')
  assertEquals(turn.messages, ['Hello!', 'Your email?'])
  assert(res.greeting.includes('Robert'))
})

Deno.test('Continuidade: turno seguinte avança sem reabrir etapas aproveitadas', async () => {
  const res = await runIntake({
    message: 'Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar',
    steps: STEPS, lang: 'pt-BR', config: CFG, callLLM: llmWith(FRED),
  })
  const first = startFlowWithPrefill(STEPS, 'pt-BR', res.prefilled)
  const second = advanceFlow(STEPS, first.state, 'fred@mail.com', 'pt-BR')

  assert(second.finished)
  assert(second.handoff)
  assertEquals(second.messages, ['Vou te encaminhar.'])
  assertEquals(second.state.answers['nome'], 'Fred')
  assertEquals(second.state.answers['email'], 'fred@mail.com')
})

Deno.test('Confiança abaixo do mínimo é descartada', () => {
  const values = extractionToFieldValues({ full_name: 'Fred', confidence: { full_name: 0.3 } }, 0.7)
  assertEquals(values['contact.full_name'], undefined)
})

Deno.test('Campo desligado na configuração é ignorado', async () => {
  const cfg = normalizeIntakeConfig({ enabled: true, fields: ['contact.full_name'] })
  const res = await runIntake({
    message: 'Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar',
    steps: STEPS, lang: 'pt-BR', config: cfg, callLLM: llmWith(FRED),
  })
  assertEquals(Object.keys(res.prefilled), ['nome'])
  const turn = startFlowWithPrefill(STEPS, 'pt-BR', res.prefilled)
  assertEquals(turn.state.current_step, 'local')
})

Deno.test('Prefill inválido para a etapa é descartado sem quebrar o fluxo', () => {
  const prefilled = prefillFromFieldValues(
    STEPS,
    { 'funnel.location_known': 'talvez', 'contact.full_name': 'Fred' },
  )
  assertEquals(prefilled['local'], undefined)
  assertEquals(prefilled['nome'], 'Fred')
  const turn = startFlowWithPrefill(STEPS, 'pt-BR', prefilled)
  assertEquals(turn.state.current_step, 'local')
})

Deno.test('Todas as perguntas aproveitadas: fluxo conclui no 1º turno com handoff', () => {
  const prefilled = { nome: 'Fred', local: 'nao', interesse: 'estudar', email: 'f@x.com' }
  const turn = startFlowWithPrefill(STEPS, 'pt-BR', prefilled)
  assert(turn.finished)
  assert(turn.handoff)
  assertEquals(turn.messages, ['Olá!', 'Vou te encaminhar.'])
})

Deno.test('LLM indisponível ou JSON inválido: fluxo inicia normalmente', async () => {
  const boom = await runIntake({
    message: 'Oi, meu nome é Fred', steps: STEPS, lang: 'pt-BR', config: CFG,
    callLLM: async () => { throw new Error('offline') },
  })
  assertEquals(boom.prefilled, {})

  const junk = await runIntake({
    message: 'Oi, meu nome é Fred', steps: STEPS, lang: 'pt-BR', config: CFG,
    callLLM: async () => 'desculpe, não consegui',
  })
  assertEquals(junk.prefilled, {})
  assertEquals(parseIntakeJson('sem json'), null)

  const turn = startFlow(STEPS, 'pt-BR')
  assertEquals(turn.state.current_step, 'nome')
})

Deno.test('Saudação padrão é usada quando nada é aproveitado', () => {
  const cfg = normalizeIntakeConfig({ enabled: true, greeting_default: { 'pt-BR': 'Olá! Sou a assistente da CB.' } })
  assertEquals(renderIntakeGreeting(cfg, 'pt-BR', {}), 'Olá! Sou a assistente da CB.')
  assert(renderIntakeGreeting(cfg, 'pt-BR', { 'contact.full_name': 'Fred' }).includes('Fred'))
})

Deno.test('Reconhecimento humano: só em respostas abertas', () => {
  const ack = renderAckMessage(DEFAULT_INTAKE_CONFIG, 'pt-BR')
  assert(ack.length > 0)

  // Etapa aberta (interesse) → ack aparece antes da próxima pergunta.
  const state = { current_step: 'interesse', answers: { nome: 'Fred', local: 'nao' }, visited: ['inicio', 'nome', 'local'], lang: 'pt-BR' }
  const open = advanceFlow(STEPS, state, 'quero estudar', 'pt-BR', { ack })
  assertEquals(open.messages[0], ack)

  // Etapa Sim/Não → sem ack.
  const yesNoState = { current_step: 'local', answers: { nome: 'Fred' }, visited: ['inicio', 'nome'], lang: 'pt-BR' }
  const yesNo = advanceFlow(STEPS, yesNoState, 'não', 'pt-BR', { ack })
  assert(yesNo.messages[0] !== ack)

  // Sem ack configurado nada muda.
  const noAck = advanceFlow(STEPS, state, 'quero estudar', 'pt-BR')
  assertEquals(noAck.messages[0], 'Qual seu e-mail?')
})

Deno.test('ack_enabled por etapa sobrepõe o padrão', () => {
  const steps = STEPS.map((s) =>
    s.step_code === 'local' ? { ...s, validation: { ack_enabled: true } } : s
  )
  const ack = renderAckMessage(DEFAULT_INTAKE_CONFIG, 'pt-BR')
  const state = { current_step: 'local', answers: { nome: 'Fred' }, visited: ['inicio', 'nome'], lang: 'pt-BR' }
  const turn = advanceFlow(steps, state, 'não', 'pt-BR', { ack })
  assertEquals(turn.messages[0], ack)
})
