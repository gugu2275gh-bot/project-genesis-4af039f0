// Handoff regression tests: Gemini must NEVER be invoked when the last outbound
// message has origem='SISTEMA' (human agent has taken over).
// Covers Gustavo, Fred, Agência Liga, new-client immediate handoff, Spanish
// client and chained SISTEMA-after-AI scenarios.

Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY', 'OPENAI_API_KEY', 'WHATSAPP_VERIFY_TOKEN',
  'LOVABLE_API_KEY', 'TWILIO_API_KEY', 'CBAsesoria_Key',
]) {
  if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')
}

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handler } from './index.ts'
import { createMockSupabase } from './__mocks__/supabase.ts'
import { installFetchMock } from './__mocks__/fetch.ts'

function twilioForm(phone: string, body: string): Request {
  const params = new URLSearchParams()
  params.set('From', `whatsapp:+${phone}`)
  params.set('To', 'whatsapp:+14155238886')
  params.set('Body', body)
  params.set('MessageSid', `SM${Math.random().toString(36).slice(2, 12)}`)
  params.set('NumMedia', '0')
  return new Request('http://localhost/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

function twilioOk(): Response {
  return new Response(JSON.stringify({ sid: 'SMmocked', status: 'queued' }),
    { status: 201, headers: { 'Content-Type': 'application/json' } })
}

interface Scenario {
  name: string
  phone: string
  contactName: string
  language: string
  leadStatus: string
  inboundBody: string
  history: Array<{ kind: 'IA' | 'SISTEMA' | 'CLIENT'; text: string; minutesAgo: number }>
}

async function expectAIPaused(s: Scenario) {
  const fetchMock = installFetchMock()
  fetchMock.on(/connector-gateway\.lovable\.dev\/twilio/, () => twilioOk())
  fetchMock.on(/.*/, () => new Response('{}', { status: 200 }))

  try {
    const contactId = `c-${s.phone}`
    const leadId = `l-${s.phone}`
    const now = Date.now()
    const messages = s.history.map((h, i) => ({
      id: `m-${i}`,
      id_lead: leadId,
      phone_id: parseInt(s.phone),
      mensagem_cliente: h.kind === 'CLIENT' ? h.text : null,
      mensagem_IA: h.kind === 'IA' ? h.text : null,
      mensagem_atendente: h.kind === 'SISTEMA' ? h.text : null,
      origem: h.kind === 'CLIENT' ? 'WHATSAPP' : 'SISTEMA',
      created_at: new Date(now - h.minutesAgo * 60_000).toISOString(),
    }))

    const mock = createMockSupabase({
      contacts: [{ id: contactId, phone: s.phone, full_name: s.contactName, email: null, preferred_language: s.language }],
      leads: [{ id: leadId, contact_id: contactId, status: s.leadStatus, assigned_to_user_id: 'user-1' }],
      mensagens_cliente: messages,
      system_config: [
        { key: 'whatsapp_bot_enabled', value: 'true' },
        { key: 'whatsapp_bot_system_prompt', value: 'assistente' },
      ],
    })

    const res = await handler(twilioForm(s.phone, s.inboundBody), { supabase: mock.client })
    assertEquals(res.status, 200)
    await res.text()

    const geminiCalls = fetchMock.callsMatching(/generativelanguage\.googleapis\.com/)
    const openaiChat = fetchMock.callsMatching(/api\.openai\.com\/v1\/chat\/completions/)
    assertEquals(geminiCalls.length, 0, `[${s.name}] Gemini must not be called (got ${geminiCalls.length})`)
    assertEquals(openaiChat.length, 0, `[${s.name}] OpenAI fallback must not be called either (got ${openaiChat.length})`)
  } finally {
    fetchMock.restore()
  }
}

Deno.test({
  name: 'handoff: Gustavo (mid-funnel, name confirmed) — SISTEMA last → no AI',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'Gustavo',
    phone: '5511911112222',
    contactName: 'Gustavo Almeida',
    language: 'pt',
    leadStatus: 'EM_ATENDIMENTO',
    inboundBody: 'tenho 34 anos',
    history: [
      { kind: 'CLIENT', text: 'oi', minutesAgo: 30 },
      { kind: 'IA', text: 'Olá! Qual seu nome?', minutesAgo: 29 },
      { kind: 'CLIENT', text: 'Gustavo Almeida', minutesAgo: 25 },
      { kind: 'IA', text: 'Prazer Gustavo. Qual sua idade?', minutesAgo: 24 },
      { kind: 'SISTEMA', text: 'Oi Gustavo, sou a Ana da equipe. Vou te ajudar daqui.', minutesAgo: 5 },
    ],
  }),
})

Deno.test({
  name: 'handoff: Fred (NIE detectado) — SISTEMA last → no AI',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'Fred',
    phone: '5521933334444',
    contactName: 'Fred Souza',
    language: 'pt',
    leadStatus: 'EM_ATENDIMENTO',
    inboundBody: 'sim, é esse mesmo o NIE',
    history: [
      { kind: 'IA', text: 'Tem NIE espanhol?', minutesAgo: 60 },
      { kind: 'CLIENT', text: 'X1234567Z', minutesAgo: 58 },
      { kind: 'SISTEMA', text: 'Fred, identifiquei seu NIE. Vou te passar pro jurídico.', minutesAgo: 2 },
    ],
  }),
})

Deno.test({
  name: 'handoff: Agência Liga (corporate, múltiplos SISTEMA) — no AI',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'Agencia Liga',
    phone: '5511955556666',
    contactName: 'Agência Liga',
    language: 'pt',
    leadStatus: 'EM_ATENDIMENTO',
    inboundBody: 'podemos fechar 5 processos esta semana',
    history: [
      { kind: 'CLIENT', text: 'temos demanda corporativa', minutesAgo: 120 },
      { kind: 'SISTEMA', text: 'Olá, sou o gerente comercial.', minutesAgo: 100 },
      { kind: 'CLIENT', text: 'queremos volume', minutesAgo: 80 },
      { kind: 'SISTEMA', text: 'Vamos montar uma proposta.', minutesAgo: 10 },
    ],
  }),
})

Deno.test({
  name: 'handoff: novo cliente com SISTEMA imediato — no AI',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'novo cliente',
    phone: '5511977778888',
    contactName: 'Cliente Novo',
    language: 'pt',
    leadStatus: 'NOVO',
    inboundBody: 'preciso de orientação',
    history: [
      { kind: 'SISTEMA', text: 'Olá! Sou Bruno, vou te atender.', minutesAgo: 1 },
    ],
  }),
})

Deno.test({
  name: 'handoff: cliente espanhol com SISTEMA — no AI (sem leak ES)',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'cliente ES',
    phone: '34611222333',
    contactName: 'Carlos García',
    language: 'es',
    leadStatus: 'EM_ATENDIMENTO',
    inboundBody: '¿cuándo me podéis llamar?',
    history: [
      { kind: 'CLIENT', text: 'Hola', minutesAgo: 40 },
      { kind: 'IA', text: '¡Hola! ¿Cuál es tu nombre?', minutesAgo: 39 },
      { kind: 'CLIENT', text: 'Carlos García', minutesAgo: 35 },
      { kind: 'SISTEMA', text: 'Hola Carlos, soy María del equipo legal.', minutesAgo: 3 },
    ],
  }),
})

Deno.test({
  name: 'handoff: SISTEMA depois de IA (encadeado) — no AI',
  sanitizeOps: false, sanitizeResources: false,
  fn: () => expectAIPaused({
    name: 'encadeado',
    phone: '5511999990000',
    contactName: 'Renata Lima',
    language: 'pt',
    leadStatus: 'EM_ATENDIMENTO',
    inboundBody: 'ok aguardo',
    history: [
      { kind: 'CLIENT', text: 'oi', minutesAgo: 50 },
      { kind: 'IA', text: 'Olá! Qual seu nome?', minutesAgo: 49 },
      { kind: 'CLIENT', text: 'Renata', minutesAgo: 45 },
      { kind: 'IA', text: 'Prazer Renata. Pode me contar o caso?', minutesAgo: 44 },
      { kind: 'CLIENT', text: 'é sobre nacionalidade', minutesAgo: 40 },
      { kind: 'IA', text: 'Entendi, vou te encaminhar.', minutesAgo: 39 },
      { kind: 'SISTEMA', text: 'Renata, sou João do jurídico. Confirmo seu caso.', minutesAgo: 4 },
    ],
  }),
})
