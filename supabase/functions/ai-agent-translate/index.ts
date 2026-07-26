// @ts-nocheck
// Tradução automática dos textos dos Agentes de IA.
// Usa a cascata de modelos configurada em Configurações → LLM.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LANG_NAMES: Record<string, string> = {
  'pt-BR': 'português do Brasil',
  pt: 'português do Brasil',
  es: 'espanhol da Espanha',
  en: 'inglês',
  fr: 'francês',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'missing auth', status: 401 }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // Chaves de assinatura assimétricas: valida via JWKS (getClaims) e só
  // recorre ao getUser quando o claims não estiver disponível.
  let userId: string | null = null
  try {
    const { data: claimsData } = await authClient.auth.getClaims(token)
    userId = (claimsData as any)?.claims?.sub ?? null
  } catch (_) {
    userId = null
  }
  if (!userId) {
    const { data: userData } = await authClient.auth.getUser(token)
    userId = userData?.user?.id ?? null
  }
  if (!userId) return { error: 'invalid token', status: 401 }

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: roles } = await service.from('user_roles').select('role').eq('user_id', userId)
  if (!(roles || []).some((r: any) => r.role === 'ADMIN')) return { error: 'forbidden', status: 403 }
  return { service }
}

async function callGemini(model: string, prompt: string) {
  const key = Deno.env.get('CBAsesoria_Key')
  if (!key) throw new Error('CBAsesoria_Key não configurada')
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    },
  )
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`)
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
}

async function callOpenAICompatible(provider: string, model: string, prompt: string) {
  const keyName = provider === 'lovable' ? 'LOVABLE_API_KEY' : 'OPENAI_API_KEY'
  const key = Deno.env.get(keyName)
  if (!key) throw new Error(`${keyName} não configurada`)
  const endpoint =
    provider === 'lovable'
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
  const payload: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  }
  if (provider === 'lovable' && model.startsWith('openai/gpt-5.6')) payload.reasoning_effort = 'none'
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`)
  return data?.choices?.[0]?.message?.content || ''
}

function parseJsonLoose(raw: string): Record<string, string> {
  const cleaned = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('resposta do modelo não é um JSON válido')
  return JSON.parse(cleaned.slice(start, end + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = await requireAdmin(req)
    if ('error' in auth) return json({ error: auth.error }, auth.status)

    const { text, source, targets } = await req.json()
    if (!text?.trim()) return json({ error: 'text é obrigatório' }, 400)
    const langs: string[] = Array.isArray(targets) && targets.length > 0 ? targets : ['es', 'en', 'fr']

    const { data: settings } = await auth.service.from('llm_settings').select('cascade').limit(1).single()
    const cascade = ((settings?.cascade || []) as any[]).filter((c) => c?.enabled && c?.model)
    if (cascade.length === 0) cascade.push({ provider: 'gemini', model: 'gemini-2.5-flash' })

    const prompt = `Traduza o texto abaixo, escrito em ${LANG_NAMES[source] || 'português do Brasil'}, para os idiomas solicitados.

REGRAS:
- Mantenha exatamente o mesmo tom, formatação, quebras de linha e emojis.
- NÃO traduza nem altere marcadores entre chaves duplas (ex.: {{NOME}}) nem nomes próprios como "CB Asesoria".
- Não adicione comentários nem explicações.
- Responda SOMENTE com um JSON no formato {"codigo_do_idioma": "tradução"} contendo exatamente estas chaves: ${langs.map((l) => `"${l}"`).join(', ')}.

Idiomas de destino: ${langs.map((l) => `${l} = ${LANG_NAMES[l] || l}`).join('; ')}

TEXTO:
"""
${text}
"""`

    let lastError = ''
    for (const item of cascade) {
      try {
        const raw =
          item.provider === 'gemini'
            ? await callGemini(item.model, prompt)
            : await callOpenAICompatible(item.provider, item.model, prompt)
        const parsed = parseJsonLoose(raw)
        const translations: Record<string, string> = {}
        for (const l of langs) if (typeof parsed[l] === 'string') translations[l] = parsed[l]
        if (Object.keys(translations).length === 0) throw new Error('nenhuma tradução retornada')
        return json({ translations, provider: item.provider, model: item.model })
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        console.warn('[AI_TRANSLATE] falha em', item.provider, item.model, lastError)
      }
    }
    return json({ error: `Não foi possível traduzir: ${lastError}` }, 502)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'erro inesperado' }, 500)
  }
})
