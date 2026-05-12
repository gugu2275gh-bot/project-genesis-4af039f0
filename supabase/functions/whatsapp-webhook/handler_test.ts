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
