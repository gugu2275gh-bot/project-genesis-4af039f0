UPDATE public.lead_funnel_state
SET location_known = 'outside',
    branch = 'OUTSIDE',
    current_flow = 'OUTSIDE_SPAIN',
    answers = jsonb_set(COALESCE(answers, '{}'::jsonb), '{LOCATION,value}', '"outside"'::jsonb, true),
    updated_at = now()
WHERE lead_id = '274d02e4-dbf4-43ce-b65d-ace19e259d03'
  AND location_known = 'spain';