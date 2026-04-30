// Backfill embeddings for existing knowledge base chunks
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'ADMIN').single()
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      const { data: cfg } = await supabaseAdmin
        .from('system_config').select('value').eq('key', 'openai_api_key').single()
      apiKey = cfg?.value || null
    }
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all chunks missing embeddings
    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from('knowledge_base')
      .select('id, content')
      .is('embedding', null)
      .eq('is_active', true)

    if (fetchErr) throw fetchErr
    if (!rows?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No chunks need embeddings', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    let failed = 0
    const BATCH_SIZE = 50

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: batch.map((r) => r.content),
          }),
        })
        if (!embRes.ok) {
          console.error('Batch failed:', embRes.status, await embRes.text())
          failed += batch.length
          continue
        }
        const data = await embRes.json()
        const embeddings = (data.data || [])
          .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
          .map((e: any) => e.embedding)

        for (let j = 0; j < batch.length; j++) {
          const emb = embeddings[j]
          if (!emb) { failed++; continue }
          const { error: upErr } = await supabaseAdmin
            .from('knowledge_base')
            .update({ embedding: JSON.stringify(emb) })
            .eq('id', batch[j].id)
          if (upErr) { console.error('Update err:', upErr); failed++ }
          else processed++
        }
      } catch (e) {
        console.error('Batch error:', e)
        failed += batch.length
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: rows.length,
      processed,
      failed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('backfill-kb-embeddings error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
