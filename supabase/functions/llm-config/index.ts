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

function describeError(status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    const msg = parsed?.error?.message || parsed?.message || parsed?.error?.status
    if (msg) return `HTTP ${status}: ${String(msg)}`
  } catch (_) { /* corpo não-JSON */ }
  return `HTTP ${status}: ${raw.slice(0, 300)}`
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
      return { ok: false, latency_ms, error: describeError(resp.status, txt) }
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
      return { ok: false, latency_ms, error: describeError(resp.status, txt) }
    }
    return { ok: true, latency_ms }
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e?.message || String(e) }
  }
}

async function testLovable(model: string): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const key = Deno.env.get('LOVABLE_API_KEY')
  if (!key) return { ok: false, latency_ms: 0, error: 'LOVABLE_API_KEY não configurada' }
  const start = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: 'Responda apenas "ok".' }],
      max_tokens: 8,
    }
    if (model.startsWith('openai/gpt-5.6')) payload.reasoning_effort = 'none'
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Lovable-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    const latency_ms = Date.now() - start
    if (!resp.ok) {
      const txt = await resp.text()
      return { ok: false, latency_ms, error: describeError(resp.status, txt) }
    }
    await resp.json()
    return { ok: true, latency_ms }
  } catch (e: any) {
    return { ok: false, latency_ms: Date.now() - start, error: e?.message || String(e) }
  }
}

// Cache em memória para listagens de modelos (5 min)
type ModelInfo = { id: string; displayName: string; description?: string }
const _modelsCache: Record<string, { value: ModelInfo[]; expires: number }> = {}
const MODELS_TTL = 5 * 60 * 1000

const GEMINI_FALLBACK: ModelInfo[] = [
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
]
const OPENAI_FALLBACK: ModelInfo[] = [
  { id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' },
  { id: 'gpt-4o', displayName: 'gpt-4o' },
]

// Catálogo do Lovable AI Gateway (ids fixos suportados pelo gateway)
const LOVABLE_MODELS: ModelInfo[] = [
  { id: 'google/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash (Lovable AI)' },
  { id: 'google/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash (Lovable AI)' },
  { id: 'google/gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite (Lovable AI)' },
  { id: 'google/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview (Lovable AI)' },
  { id: 'google/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (Lovable AI)' },
  { id: 'openai/gpt-5.5', displayName: 'GPT-5.5 (Lovable AI)' },
  { id: 'openai/gpt-5.4-mini', displayName: 'GPT-5.4 Mini (Lovable AI)' },
  { id: 'openai/gpt-5.4-nano', displayName: 'GPT-5.4 Nano (Lovable AI)' },
]



async function listGeminiModels(force = false): Promise<{ models: ModelInfo[]; cached: boolean; error?: string }> {
  const cacheKey = 'gemini'
  const now = Date.now()
  if (!force && _modelsCache[cacheKey] && _modelsCache[cacheKey].expires > now) {
    return { models: _modelsCache[cacheKey].value, cached: true }
  }
  const key = Deno.env.get('CBAsesoria_Key')
  if (!key) return { models: GEMINI_FALLBACK, cached: false, error: 'CBAsesoria_Key não configurada' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
      { signal: ctrl.signal },
    )
    clearTimeout(t)
    if (!resp.ok) {
      const txt = await resp.text()
      return { models: GEMINI_FALLBACK, cached: false, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` }
    }
    const data = await resp.json()
    const list: ModelInfo[] = (data?.models || [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => {
        const id = String(m.name || '').replace(/^models\//, '')
        return { id, displayName: m.displayName || id, description: m.description }
      })
      .filter((m: ModelInfo) => {
        const id = m.id.toLowerCase()
        // remove embeddings, tts, image-only e aqa
        if (id.includes('embedding')) return false
        if (id.includes('aqa')) return false
        if (id.includes('-tts')) return false
        if (id.includes('image-generation')) return false
        if (id.includes('imagen')) return false
        return true
      })
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    _modelsCache[cacheKey] = { value: list, expires: now + MODELS_TTL }
    return { models: list, cached: false }
  } catch (e: any) {
    return { models: GEMINI_FALLBACK, cached: false, error: e?.message || String(e) }
  }
}

async function listOpenAIModels(force = false): Promise<{ models: ModelInfo[]; cached: boolean; error?: string }> {
  const cacheKey = 'openai'
  const now = Date.now()
  if (!force && _modelsCache[cacheKey] && _modelsCache[cacheKey].expires > now) {
    return { models: _modelsCache[cacheKey].value, cached: true }
  }
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return { models: OPENAI_FALLBACK, cached: false, error: 'OPENAI_API_KEY não configurada' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!resp.ok) {
      const txt = await resp.text()
      return { models: OPENAI_FALLBACK, cached: false, error: `HTTP ${resp.status}: ${txt.slice(0, 200)}` }
    }
    const data = await resp.json()
    const EXCLUDE = ['embedding', 'tts', 'whisper', 'dall-e', 'image', 'audio', 'realtime', 'transcribe', 'moderation', 'davinci', 'babbage']
    const INCLUDE_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']
    const list: ModelInfo[] = (data?.data || [])
      .map((m: any) => ({ id: String(m.id), displayName: String(m.id) }))
      .filter((m: ModelInfo) => {
        const id = m.id.toLowerCase()
        if (EXCLUDE.some(x => id.includes(x))) return false
        return INCLUDE_PREFIXES.some(p => id.startsWith(p))
      })
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    _modelsCache[cacheKey] = { value: list, expires: now + MODELS_TTL }
    return { models: list, cached: false }
  } catch (e: any) {
    return { models: OPENAI_FALLBACK, cached: false, error: e?.message || String(e) }
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
        lovable_key_present: !!Deno.env.get('LOVABLE_API_KEY'),
      })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const action = body?.action || 'test'

      if (action === 'status') {
        return json({
          gemini_key_present: !!Deno.env.get('CBAsesoria_Key'),
          openai_key_present: !!Deno.env.get('OPENAI_API_KEY'),
          lovable_key_present: !!Deno.env.get('LOVABLE_API_KEY'),
        })
      }

      if (action === 'list_models') {
        const provider = String(body?.provider || '')
        const force = !!body?.force
        if (provider === 'gemini') return json(await listGeminiModels(force))
        if (provider === 'openai') return json(await listOpenAIModels(force))
        if (provider === 'lovable') return json({ models: LOVABLE_MODELS, cached: false })
        return json({ error: 'provider inválido' }, 400)
      }

      const provider = String(body?.provider || '')
      const model = String(body?.model || '')
      if (!provider || !model) return json({ error: 'provider e model são obrigatórios' }, 400)

      if (provider === 'gemini') return json(await testGemini(model))
      if (provider === 'openai') return json(await testOpenAI(model))
      if (provider === 'lovable') return json(await testLovable(model))
      return json({ error: 'provider inválido' }, 400)
    }

    return json({ error: 'método não suportado' }, 405)
  } catch (e: any) {
    console.error('llm-config error', e)
    return json({ error: e?.message || 'erro interno' }, 500)
  }
})
