UPDATE public.lead_funnel_state
SET location_known='spain',
    interest_confirmed='RESIDENCIA_PARENTE_COMUNITARIO',
    step='aprofundamento',
    pending_questions='[]'::jsonb,
    last_step_change=now(),
    updated_at=now()
WHERE lead_id='c7c5d054-d001-42a6-9df8-2fe3d38df5d9';

UPDATE public.contacts
SET is_in_spain=true,
    updated_at=now()
WHERE id='665e2b85-9d00-4c3d-852b-23656114343c';