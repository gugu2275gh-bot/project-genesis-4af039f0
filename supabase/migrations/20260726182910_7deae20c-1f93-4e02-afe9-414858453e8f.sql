UPDATE public.contacts
SET preferred_language = 'en'
WHERE phone = '553195720909';

UPDATE public.lead_funnel_state lfs
SET visual_flow_state = jsonb_set(
  COALESCE(lfs.visual_flow_state, '{}'::jsonb),
  '{lang}',
  '"en"'::jsonb,
  true
),
updated_at = now()
FROM public.leads l
JOIN public.contacts c ON c.id = l.contact_id
WHERE l.id = lfs.lead_id
  AND c.phone = '553195720909';