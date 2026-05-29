UPDATE lead_funnel_state
SET interest_confirmed = 'RESIDENCIA_PARENTE_COMUNITARIO',
    location_known = 'spain',
    pending_questions = '[]',
    updated_at = now()
WHERE lead_id = '5f56496d-8b9b-438b-a59d-e6bc05b32f2f';

UPDATE leads
SET service_interest = 'RESIDENCIA_PARENTE_COMUNITARIO',
    interest_confirmed = true,
    updated_at = now()
WHERE id = '5f56496d-8b9b-438b-a59d-e6bc05b32f2f';