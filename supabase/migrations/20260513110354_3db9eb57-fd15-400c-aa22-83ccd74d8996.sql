
ALTER TABLE public.lead_funnel_state
  ADD COLUMN IF NOT EXISTS pre_handoff_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_sent boolean NOT NULL DEFAULT false;
