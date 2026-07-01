UPDATE public.lead_funnel_state
SET outside_spain_progress = COALESCE(outside_spain_progress, '{}'::jsonb) || '{"a4_eu_family":"no"}'::jsonb,
    updated_at = now()
WHERE lead_id IN (SELECT id FROM public.leads WHERE contact_id = 'd4d40f65-46e2-4d28-bfc7-3979420e60d0')
  AND (outside_spain_progress->>'a4_eu_family') IS NULL;