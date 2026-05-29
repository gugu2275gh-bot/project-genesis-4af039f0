// Centralized append-only logger for every webhook turn.
// Persists in `public.whatsapp_turn_log` so we can diagnose stalls
// even after the edge function logs (5-min retention) expire.

export type ExitReason =
  | 'REPLIED'
  | 'BUFFERED_NEWER'
  | 'ANTI_DUP'
  | 'DUPLICATE_MSG_ID'
  | 'NO_VALID_MESSAGE'
  | 'AI_FAILED'
  | 'AI_SKIPPED'
  | 'REACTIVATION_SENT'
  | 'BOT_DISABLED'
  | 'PAUSED_BY_HUMAN'
  | 'KB_STRICT_FALLBACK'
  | 'STALL_RECOVERED'
  | 'STALL_FAILED'
  | 'OTHER'

export interface TurnLogInput {
  // deno-lint-ignore no-explicit-any
  supabase: any
  exit_reason: ExitReason
  lead_id?: string | null
  contact_id?: string | null
  phone?: string | null
  message_id?: string | null
  inbound_text?: string | null
  ai_provider?: string | null
  ai_error?: string | null
  response_chars?: number | null
  funnel_step_before?: string | null
  funnel_step_after?: string | null
  recovered_from_message_id?: string | null
  // deno-lint-ignore no-explicit-any
  details?: Record<string, any> | null
}

export async function logTurn(input: TurnLogInput): Promise<void> {
  try {
    const { supabase, exit_reason, ...rest } = input
    await supabase.from('whatsapp_turn_log').insert({
      exit_reason,
      lead_id: rest.lead_id ?? null,
      contact_id: rest.contact_id ?? null,
      phone: rest.phone ?? null,
      message_id: rest.message_id ?? null,
      inbound_text: (rest.inbound_text ?? '').toString().slice(0, 2000) || null,
      ai_provider: rest.ai_provider ?? null,
      ai_error: rest.ai_error ? rest.ai_error.toString().slice(0, 1000) : null,
      response_chars: rest.response_chars ?? null,
      funnel_step_before: rest.funnel_step_before ?? null,
      funnel_step_after: rest.funnel_step_after ?? null,
      recovered_from_message_id: rest.recovered_from_message_id ?? null,
      details: rest.details ?? null,
    })
  } catch (err) {
    // Logging must never break the main flow.
    console.error('[turn-log] insert failed (non-blocking):', err instanceof Error ? err.message : err)
  }
}
