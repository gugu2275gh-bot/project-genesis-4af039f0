ALTER TABLE public.ai_agent_flows
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'GERAL';

ALTER TABLE public.ai_agent_flow_steps
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'PRE_HANDOFF',
  ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS pre_handoff_flow_id uuid REFERENCES public.ai_agent_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_flow_id uuid REFERENCES public.ai_agent_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prompt_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_agent_flows_phase ON public.ai_agent_flows(phase);
CREATE INDEX IF NOT EXISTS idx_ai_agent_flow_steps_phase ON public.ai_agent_flow_steps(flow_id, phase, order_index);