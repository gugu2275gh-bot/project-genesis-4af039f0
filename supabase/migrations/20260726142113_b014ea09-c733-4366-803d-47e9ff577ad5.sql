ALTER TABLE public.ai_agent_test_sessions
  ADD COLUMN IF NOT EXISTS flow_state jsonb NOT NULL DEFAULT '{}'::jsonb;