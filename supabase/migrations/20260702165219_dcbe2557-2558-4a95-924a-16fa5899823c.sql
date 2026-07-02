UPDATE public.lead_funnel_state
SET outside_spain_progress = COALESCE(outside_spain_progress, '{}'::jsonb) || jsonb_build_object('a2_age', '60')
WHERE lead_id = 'e235caf5-f56c-49e7-92c0-0bcbeba159e0';