ALTER TABLE public.lead_funnel_state
ADD COLUMN IF NOT EXISTS pending_questions jsonb NOT NULL DEFAULT '[]'::jsonb;