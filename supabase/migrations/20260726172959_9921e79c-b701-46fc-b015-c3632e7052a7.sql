ALTER TABLE public.ai_agent_flow_steps ADD COLUMN IF NOT EXISTS field_mapping text;
ALTER TABLE public.lead_funnel_state ADD COLUMN IF NOT EXISTS visual_flow_state jsonb NOT NULL DEFAULT '{}'::jsonb;