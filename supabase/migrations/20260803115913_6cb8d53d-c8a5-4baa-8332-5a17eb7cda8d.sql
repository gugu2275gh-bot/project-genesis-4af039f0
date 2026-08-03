ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS handoff_released boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_hold_message jsonb NOT NULL DEFAULT '{}'::jsonb;