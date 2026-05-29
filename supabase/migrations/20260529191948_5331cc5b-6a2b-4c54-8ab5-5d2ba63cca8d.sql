UPDATE public.lead_funnel_state
SET step = 'interesse',
    pre_handoff_sent = false,
    handoff_sent = false,
    interest_confirmed = NULL,
    location_known = NULL,
    outside_spain_progress = '{}'::jsonb,
    pending_questions = '[]'::jsonb,
    updated_at = now()
WHERE lead_id = '8cff3b45-f198-4677-a832-6a7809375ffb';