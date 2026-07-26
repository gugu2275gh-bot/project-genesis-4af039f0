ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS is_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS runtime_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_cascade jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_single_production_idx
  ON public.ai_agents ((is_production)) WHERE is_production;

ALTER TABLE public.ai_agent_flow_steps
  ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reask_messages jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.ai_agent_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  text_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  description text,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (agent_id, text_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_texts TO authenticated;
GRANT ALL ON public.ai_agent_texts TO service_role;

ALTER TABLE public.ai_agent_texts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent texts"
  ON public.ai_agent_texts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "Managers view agent texts"
  ON public.ai_agent_texts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role) OR has_role(auth.uid(), 'MANAGER'::app_role));

CREATE TRIGGER update_ai_agent_texts_updated_at
  BEFORE UPDATE ON public.ai_agent_texts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();