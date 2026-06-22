// Quick check: faz uma chamada mínima na OpenAI para verificar se há crédito/saldo na chave.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY ausente' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const start = Date.now()
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    })
    const latency = Date.now() - start
    const text = await r.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}
    const hasCredit = r.ok
    const errType = parsed?.error?.type || parsed?.error?.code || null
    const errMsg = parsed?.error?.message || null
    return new Response(JSON.stringify({
      ok: hasCredit,
      status: r.status,
      latency_ms: latency,
      has_credit: hasCredit && !/quota|insufficient|billing/i.test(errMsg || ''),
      error_type: errType,
      error_message: errMsg,
      usage: parsed?.usage || null,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
