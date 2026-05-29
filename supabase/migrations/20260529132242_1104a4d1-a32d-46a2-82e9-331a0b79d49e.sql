UPDATE lead_funnel_state
SET interest_confirmed = 'RESIDENCIA_PARENTE_COMUNITARIO',
    pending_questions = '[]'::jsonb,
    updated_at = now()
WHERE lead_id IN ('70a9963f-4c4b-4821-9282-59655275e2ca','486eb20c-8ae8-4899-962b-dc01dce7386d');

UPDATE leads SET service_interest = 'RESIDENCIA_PARENTE_COMUNITARIO'
WHERE id IN ('70a9963f-4c4b-4821-9282-59655275e2ca','486eb20c-8ae8-4899-962b-dc01dce7386d');