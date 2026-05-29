UPDATE public.lead_funnel_state
SET step = 'interesse',
    pre_handoff_sent = false,
    handoff_sent = false,
    updated_at = now()
WHERE lead_id = 'f87539f5-ee47-4aa7-8e5e-cfcf3a76d145';