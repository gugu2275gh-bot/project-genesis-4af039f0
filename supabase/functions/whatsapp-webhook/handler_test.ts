// Wave 3b-pre: handler integration tests.
// Stage 1: entry-level paths (OPTIONS, GET verify, dedup, no-message).
// These exercise the real handler with an injected in-memory supabase mock.

Deno.env.set('SKIP_SERVE', '1')
for (const key of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'GEMINI_API_KEY', 'OPENAI_API_KEY', 'WHATSAPP_VERIFY_TOKEN',
]) {
  if (!Deno.env.get(key)) Deno.env.set(key, 'test-stub')
}
Deno.env.set('WHATSAPP_VERIFY_TOKEN', 'cb-asesoria-webhook')

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { handler } from './index.ts'
import { createMockSupabase } from './__mocks__/supabase.ts'
import { installFetchMock } from './__mocks__/fetch.ts'

function twilioForm(opts: {
  from?: string
  body?: string
  messageSid?: string
  numMedia?: number
  mediaUrl0?: string
  mediaContentType0?: string
}): Request {
  const params = new URLSearchParams()
  params.set('From', opts.from ?? 'whatsapp:+5511988887777')
  params.set('To', 'whatsapp:+14155238886')
  params.set('Body', opts.body ?? '')
  params.set('MessageSid', opts.messageSid ?? `SM${Math.random().toString(36).slice(2, 12)}`)
  params.set('NumMedia', String(opts.numMedia ?? 0))
  if (opts.mediaUrl0) params.set('MediaUrl0', opts.mediaUrl0)
  if (opts.mediaContentType0) params.set('MediaContentType0', opts.mediaContentType0)
  return new Request('http://localhost/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

// ---------- T1: OPTIONS preflight ----------

Deno.test('handler: OPTIONS returns CORS headers', async () => {
  const res = await handler(new Request('http://localhost/webhook', { method: 'OPTIONS' }))
  assertEquals(res.status, 200)
  assert(res.headers.get('access-control-allow-origin') !== null)
})

// ---------- T2: GET verify ----------

Deno.test('handler: GET with correct verify token returns challenge', async () => {
  const res = await handler(new Request(
    'http://localhost/webhook?hub.mode=subscribe&hub.verify_token=cb-asesoria-webhook&hub.challenge=42',
    { method: 'GET' },
  ))
  assertEquals(res.status, 200)
  assertEquals(await res.text(), '42')
})

Deno.test('handler: GET with wrong verify token returns 403', async () => {
  const res = await handler(new Request(
    'http://localhost/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42',
    { method: 'GET' },
  ))
  assertEquals(res.status, 403)
  await res.text()
})

// ---------- T3: Empty payload (no message) ----------

Deno.test('handler: payload with no Body and no media → no-op success', async () => {
  const mock = createMockSupabase()
  const req = twilioForm({ body: '' })
  const res = await handler(req, { supabase: mock.client })
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.message, 'No message to process')
  // webhook_logs row should still be inserted
  assertEquals(mock.tables.webhook_logs?.length, 1)
})

// ---------- T4: Duplicate messageId → skipped ----------

Deno.test('handler: duplicate MessageSid is skipped on second call', async () => {
  const fetchMock = installFetchMock()
  // Block any external fetches; we expect the dedup to short-circuit before AI/Twilio.
  try {
    const mock = createMockSupabase()
    const sid = 'SMdedup123'
    const first = await handler(twilioForm({ body: 'oi', messageSid: sid }), { supabase: mock.client })
    // First call may try Gemini/Twilio (returns 404 from fetchMock) but should still respond.
    await first.text()

    // Second call: dedup must intercept and return 'Duplicate message, skipped'
    const second = await handler(twilioForm({ body: 'oi de novo', messageSid: sid }), { supabase: mock.client })
    assertEquals(second.status, 200)
    const json = await second.json()
    assertEquals(json.message, 'Duplicate message, skipped')
  } finally {
    fetchMock.restore()
  }
})

// ---------- T5: New contact happy path → contact + lead created, AI replies, Twilio called ----------

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function twilioOk(): Response {
  return new Response(JSON.stringify({ sid: 'SMmocked', status: 'queued' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  })
}

Deno.test({
  name: 'handler: new contact (PT-BR) creates contact+lead and triggers Twilio outbound',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fetchMock = installFetchMock()
    fetchMock.on(/generativelanguage\.googleapis\.com/, () => geminiReply('Olá! Qual é o seu nome completo?'))
    fetchMock.on(/connector-gateway\.lovable\.dev\/twilio/, () => twilioOk())
    fetchMock.on(/api\.openai\.com/, () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Olá!' } }],
    }), { status: 200 }))
    // Stub anything else (transcribe, embeddings) with 200 empty
    fetchMock.on(/.*/, () => new Response(JSON.stringify({}), { status: 200 }))

    Deno.env.set('LOVABLE_API_KEY', 'test-stub')
    Deno.env.set('TWILIO_API_KEY', 'test-stub')
    Deno.env.set('CBAsesoria_Key', 'test-stub')

    try {
      const mock = createMockSupabase({
        system_config: [
          { key: 'whatsapp_bot_enabled', value: 'true' },
          { key: 'whatsapp_bot_system_prompt', value: 'Você é o assistente da Innovatia.' },
          { key: 'kb_strict_mode', value: 'false' },
        ],
      })
      const res = await handler(
        twilioForm({ from: 'whatsapp:+5511999998888', body: 'oi, preciso de ajuda' }),
        { supabase: mock.client },
      )
      assertEquals(res.status, 200)
      await res.text()

      // Contact + lead created
      assertEquals(mock.tables.contacts?.length, 1)
      assertEquals(mock.tables.contacts?.[0].phone, '5511999998888')
      assertEquals(mock.tables.leads?.length, 1)
      assertEquals(mock.tables.leads?.[0].status, 'NOVO')

      // Inbound message logged in mensagens_cliente
      assert((mock.tables.mensagens_cliente?.length ?? 0) >= 1)

      // Twilio was invoked at least once
      const twilioCalls = fetchMock.callsMatching(/connector-gateway\.lovable\.dev\/twilio/)
      assert(twilioCalls.length >= 1, `expected Twilio call, got ${twilioCalls.length}`)
    } finally {
      fetchMock.restore()
    }
  },
})

// ---------- T7: AI paused by human (last outgoing was SISTEMA) → no Gemini call ----------

Deno.test({
  name: 'handler: AI paused when last outgoing message origem=SISTEMA → no Gemini fetch',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fetchMock = installFetchMock()
    fetchMock.on(/connector-gateway\.lovable\.dev\/twilio/, () => twilioOk())
    fetchMock.on(/.*/, () => new Response('{}', { status: 200 }))

    Deno.env.set('LOVABLE_API_KEY', 'test-stub')
    Deno.env.set('TWILIO_API_KEY', 'test-stub')
    Deno.env.set('CBAsesoria_Key', 'test-stub')

    try {
      const phone = '5511777776666'
      const contactId = 'c-handoff-1'
      const leadId = 'l-handoff-1'
      const mock = createMockSupabase({
        contacts: [{ id: contactId, phone, full_name: 'Maria', email: null, preferred_language: 'pt' }],
        leads: [{ id: leadId, contact_id: contactId, status: 'EM_ATENDIMENTO', assigned_to_user_id: 'user-1' }],
        // Last outgoing was a human (SISTEMA) → triggers aiPausedByHuman
        mensagens_cliente: [
          { id: 'm1', id_lead: leadId, phone_id: parseInt(phone), mensagem_atendente: 'Olá Maria, sou da equipe.', origem: 'SISTEMA', created_at: new Date().toISOString() },
        ],
        system_config: [
          { key: 'whatsapp_bot_enabled', value: 'true' },
          { key: 'whatsapp_bot_system_prompt', value: 'assistente' },
        ],
      })

      const res = await handler(twilioForm({ from: `whatsapp:+${phone}`, body: 'oi de volta' }), { supabase: mock.client })
      assertEquals(res.status, 200)
      await res.text()

      const geminiCalls = fetchMock.callsMatching(/generativelanguage\.googleapis\.com/)
      assertEquals(geminiCalls.length, 0, 'AI must not be invoked while handoff is active')
    } finally {
      fetchMock.restore()
    }
  },
})

// ---------- T8: Spanish language detected → Gemini called with ES directive ----------

Deno.test({
  name: 'handler: Spanish inbound → Gemini receives ES forced language',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fetchMock = installFetchMock()
    let geminiBody: string | null = null
    fetchMock.on(/generativelanguage\.googleapis\.com/, async (req) => {
      geminiBody = await req.clone().text()
      return geminiReply('¡Hola! ¿Cuál es tu nombre completo?')
    })
    fetchMock.on(/connector-gateway\.lovable\.dev\/twilio/, () => twilioOk())
    fetchMock.on(/.*/, () => new Response('{}', { status: 200 }))

    Deno.env.set('LOVABLE_API_KEY', 'test-stub')
    Deno.env.set('TWILIO_API_KEY', 'test-stub')
    Deno.env.set('CBAsesoria_Key', 'test-stub')

    try {
      const mock = createMockSupabase({
        system_config: [
          { key: 'whatsapp_bot_enabled', value: 'true' },
          { key: 'whatsapp_bot_system_prompt', value: 'asistente' },
        ],
      })
      const res = await handler(
        twilioForm({ from: 'whatsapp:+34611222333', body: 'Hola, necesito ayuda con la nacionalidad española' }),
        { supabase: mock.client },
      )
      assertEquals(res.status, 200)
      await res.text()

      assert(geminiBody, 'Gemini was not called')
      // The forced language directive should mention Spanish in the system prompt
      assert(/espa[nñ]ol|spanish|es-ES|\bES\b/i.test(geminiBody!), 'Gemini prompt missing ES directive')

      // Twilio should have been called with the Spanish reply
      const twilioCalls = fetchMock.callsMatching(/connector-gateway\.lovable\.dev\/twilio/)
      assert(twilioCalls.length >= 1)
      // Pode ser saudação ES, Msg 3 (nombre) ou D1 Msg 6 (servicios) — tudo em espanhol.
      // O corpo Twilio é form-urlencoded, então "¿"/"á" viram %XX; casamos tokens ASCII.
      assert(
        /Hola|nombre|Antes\+de\+nada|Perfecto|arraigo|residencia|servicios/i.test(twilioCalls[0].body || ''),
        'Twilio body should contain ES reply',
      )
    } finally {
      fetchMock.restore()
    }
  },
})
