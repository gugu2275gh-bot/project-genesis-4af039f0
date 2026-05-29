// @ts-nocheck
// Detects conversations where the bot received a customer message but never replied,
// and re-invokes the WhatsApp webhook with the original payload to recover.
// Runs every minute via pg_cron (see migration).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STALL_THRESHOLD_SECONDS = 90
const MAX_STALL_ATTEMPTS = 2
const LOOKBACK_MINUTES = 30 // ignore very old conversations

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const cutoffOld = new Date(Date.now() - STALL_THRESHOLD_SECONDS * 1000).toISOString()
  const cutoffLookback = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()

  // Check bot enabled globally
  const { data: cfg } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'whatsapp_bot_enabled')
    .maybeSingle()
  const botEnabled = (cfg?.value ?? 'true') !== 'false'
  if (!botEnabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'bot disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Find candidate leads: latest mensagens_cliente row in window is inbound (WHATSAPP)
  // and older than threshold.
  const { data: candidates, error: candErr } = await supabase
    .from('mensagens_cliente')
    .select('id, id_lead, phone_id, mensagem_cliente, mensagem_IA, origem, created_at')
    .gte('created_at', cutoffLookback)
    .lte('created_at', cutoffOld)
    .eq('origem', 'WHATSAPP')
    .order('created_at', { ascending: false })
    .limit(200)

  if (candErr) {
    console.error('[watchdog] query error:', candErr.message)
    return new Response(JSON.stringify({ ok: false, error: candErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const seen = new Set<string>()
  const stalled: Array<typeof candidates[number]> = []
  for (const row of candidates ?? []) {
    if (!row.id_lead || seen.has(row.id_lead)) continue
    seen.add(row.id_lead)

    // Check this is still the latest message for the lead
    const { data: latest } = await supabase
      .from('mensagens_cliente')
      .select('id, origem, mensagem_IA, created_at')
      .eq('id_lead', row.id_lead)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest || latest.id !== row.id) continue
    if (latest.origem !== 'WHATSAPP') continue

    stalled.push(row)
  }

  const recovered: Array<{ lead_id: string; status: string }> = []

  for (const row of stalled) {
    // Skip if handoff already done (bot no longer in control)
    const { data: funnel } = await supabase
      .from('lead_funnel_state')
      .select('handoff_sent, step')
      .eq('lead_id', row.id_lead)
      .maybeSingle()
    if (funnel?.handoff_sent) {
      continue
    }

    // Count previous stall attempts for this exact message
    const { count: prevAttempts } = await supabase
      .from('whatsapp_turn_log')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', row.id_lead)
      .eq('recovered_from_message_id', String(row.id))

    const attempts = (prevAttempts ?? 0) + 1
    if (attempts > MAX_STALL_ATTEMPTS) {
      await supabase.from('whatsapp_turn_log').insert({
        lead_id: row.id_lead,
        exit_reason: 'STALL_FAILED',
        inbound_text: row.mensagem_cliente,
        recovered_from_message_id: String(row.id),
        stall_attempts: attempts,
        details: { reason: 'max_attempts_exceeded' },
      })

      // Notify ops: stuck conversation that needs human intervention
      const { data: attentionUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE'])
      for (const u of attentionUsers ?? []) {
        await supabase.from('notifications').insert({
          user_id: u.user_id,
          title: 'Conversa WhatsApp travada',
          message: `Lead ${row.id_lead} sem resposta há mais de ${STALL_THRESHOLD_SECONDS}s. Intervir manualmente.`,
          type: 'whatsapp_stall',
        })
      }
      recovered.push({ lead_id: row.id_lead, status: 'notified-failed' })
      continue
    }

    // Retrieve the original raw webhook payload (most recent for this phone)
    const { data: webhookLog } = await supabase
      .from('webhook_logs')
      .select('raw_payload, created_at')
      .eq('source', 'IA_WHATSAPP')
      .order('created_at', { ascending: false })
      .limit(50)

    const payload = (webhookLog ?? []).find((w: any) => {
      const body = w.raw_payload?.Body
      return body && row.mensagem_cliente && String(body).trim() === String(row.mensagem_cliente).trim()
    })?.raw_payload

    if (!payload) {
      await supabase.from('whatsapp_turn_log').insert({
        lead_id: row.id_lead,
        exit_reason: 'STALL_FAILED',
        inbound_text: row.mensagem_cliente,
        recovered_from_message_id: String(row.id),
        stall_attempts: attempts,
        details: { reason: 'no_matching_webhook_payload' },
      })
      continue
    }

    // Re-invoke the webhook with the original payload. The webhook is idempotent thanks to
    // message_dedup, but the watchdog uses a synthesized messageId to bypass that for recovery.
    const recoveryPayload = {
      ...payload,
      MessageSid: `${payload.MessageSid || payload.SmsMessageSid || 'recovery'}-r${attempts}`,
      SmsMessageSid: `${payload.SmsMessageSid || payload.MessageSid || 'recovery'}-r${attempts}`,
      _stall_recovery: true,
      _stall_attempt: attempts,
    }

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify(recoveryPayload),
      })
      const text = await resp.text()
      // Inspect body: webhook may return 200 but with aiResponseSent=false (empty parts).
      // Treat that as failure so the watchdog escalates instead of marking false recovery.
      let aiSent = true
      try {
        const parsed = JSON.parse(text)
        if (parsed && parsed.aiResponseSent === false) aiSent = false
      } catch { /* not JSON, ignore */ }
      const truly_recovered = resp.ok && aiSent
      await supabase.from('whatsapp_turn_log').insert({
        lead_id: row.id_lead,
        exit_reason: truly_recovered ? 'STALL_RECOVERED' : 'STALL_FAILED',
        inbound_text: row.mensagem_cliente,
        recovered_from_message_id: String(row.id),
        stall_attempts: attempts,
        ai_error: truly_recovered ? null : `webhook_replied_without_message httpStatus=${resp.status}`,
        details: { httpStatus: resp.status, response: text.slice(0, 500), aiSent },
      })
      recovered.push({ lead_id: row.id_lead, status: truly_recovered ? `replayed:${resp.status}` : `noop:${resp.status}` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('whatsapp_turn_log').insert({
        lead_id: row.id_lead,
        exit_reason: 'STALL_FAILED',
        inbound_text: row.mensagem_cliente,
        recovered_from_message_id: String(row.id),
        stall_attempts: attempts,
        ai_error: msg,
      })
      recovered.push({ lead_id: row.id_lead, status: `error:${msg}` })
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: stalled.length, recovered }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
