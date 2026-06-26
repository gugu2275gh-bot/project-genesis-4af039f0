ALTER TABLE public.lead_funnel_state
  ADD COLUMN IF NOT EXISTS current_flow text DEFAULT 'ONBOARDING',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS last_human_handoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lead_funnel_state.current_flow IS 'State machine flow code: ONBOARDING | INSIDE_SPAIN | OUTSIDE_SPAIN | KB_FREE';
COMMENT ON COLUMN public.lead_funnel_state.status IS 'Conversation status: ACTIVE | AWAITING_HUMAN | CLOSED';
COMMENT ON COLUMN public.lead_funnel_state.branch IS 'INSIDE | OUTSIDE — set once location_known is captured';
COMMENT ON COLUMN public.lead_funnel_state.answers IS 'Per-step answers: { step_code: { value, ts } } — append-only audit/replay log';