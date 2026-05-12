ALTER TABLE public.lead_funnel_state ADD COLUMN IF NOT EXISTS pending_question text;

UPDATE public.leads
SET service_interest = 'NACIONALIDADE_RESIDENCIA', interest_confirmed = true, updated_at = now()
WHERE id = '49a59bf3-d2a8-419c-8db4-6c94df9576eb';

UPDATE public.lead_funnel_state
SET interest_confirmed = 'NACIONALIDADE_RESIDENCIA', step = 'pre_handoff', updated_at = now(), last_step_change = now()
WHERE lead_id = '49a59bf3-d2a8-419c-8db4-6c94df9576eb';