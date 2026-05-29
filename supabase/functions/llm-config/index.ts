// @ts-nocheck
// Edge function: status das chaves de IA e teste de conexão de modelos
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return { error: 'missing auth', status: 401 }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) return { error: 'invalid token', status: 401 }

  const userId = userData.user.id
  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: roles } = await serviceClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
  const isAdmin = (roles || []).some((r: any) => r.role === 'ADMIN')
  if (!isAdmin) return { error: 'forbidden', status: 403 }

  return { userId }
}

async function testGemini(model: string): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const key = Deno.env.get('CBAsesoria_Key')
  if (!key) return { ok: false, latency_ms: 0, error: 'CBAsesoria_Key não configurada' }
  const start = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Responda apenas "ok".' }] }],
          generationConfig: { maxOutputTokens: 8, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: ctrl.signal,
      },
    )
    clearTimeout(t)
    const latency_ms = Date.now() - start
    if (!resp.ok) {
      const txt = await resp.text()
      return { ok: false, latency_ms, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` }
    }
    return { ok: true, latency_ms }
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e?.message || String(e) }
  }
}

async function testOpenAI(model: string): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return { ok: false, latency_ms: 0, error: 'OPENAI_API_KEY não configurada' }
  const start = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Responda apenas "ok".' }],
        max_tokens: 8,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    const latency_ms = Date.now() - start
    if (!resp.ok) {
      const txt = await resp.text()
      return { ok: false, latency_ms, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` }
    }
    return { ok: true, latency_ms }
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e?.message || String(e) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })



  const authCheck = await requireAdmin(req)
  if ('error' in authCheck) return json({ error: authCheck.error }, authCheck.status)

  try {
    // Roteamento simples: GET = status; POST com body { provider, model } = test
    if (req.method === 'GET') {
      return json({
        gemini_key_present: !!Deno.env.get('CBAsesoria_Key'),
        openai_key_present: !!Deno.env.get('OPENAI_API_KEY'),
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const action = body?.action || 'test'

      if (action === 'status') {
        return json({
          gemini_key_present: !!Deno.env.get('CBAsesoria_Key'),
          openai_key_present: !!Deno.env.get('OPENAI_API_KEY'),
        })
      }

      const provider = String(body?.provider || '')
      const model = String(body?.model || '')
      if (!provider || !model) return json({ error: 'provider e model são obrigatórios' }, 400)

      if (provider === 'gemini') return json(await testGemini(model))
      if (provider === 'openai') return json(await testOpenAI(model))
      return json({ error: 'provider inválido' }, 400)
    }

    return json({ error: 'método não suportado' }, 405)
  } catch (e: any) {
    console.error('llm-config error', e)
    return json({ error: e?.message || 'erro interno' }, 500)
  }
})
