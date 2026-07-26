-- FLOWS
CREATE TABLE public.ai_agent_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'RASCUNHO',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_flows TO authenticated;
GRANT ALL ON public.ai_agent_flows TO service_role;
ALTER TABLE public.ai_agent_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage flows" ON public.ai_agent_flows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Managers view flows" ON public.ai_agent_flows FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'MANAGER'));

-- AGENTS
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  provider text NOT NULL DEFAULT 'gemini',
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  status text NOT NULL DEFAULT 'RASCUNHO',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 1024,
  default_language text NOT NULL DEFAULT 'pt',
  prompt_base text NOT NULL DEFAULT '',
  prompt_behavior text NOT NULL DEFAULT '',
  fallback_message text NOT NULL DEFAULT '',
  handoff_message text NOT NULL DEFAULT '',
  flow_id uuid REFERENCES public.ai_agent_flows(id) ON DELETE SET NULL,
  capabilities jsonb NOT NULL DEFAULT '{"answer_questions":true,"use_knowledge_base":false,"use_rag":false,"ask_questions":true,"run_structured_flow":false,"handoff_to_human":true}'::jsonb,
  behavior jsonb NOT NULL DEFAULT '{"personality":"PROFISSIONAL","tone":"","allowed_languages":["pt"],"required_rules":[],"forbidden_rules":[],"forbidden_information":[],"on_unknown":"","on_off_topic":"","on_handoff":""}'::jsonb,
  current_version integer NOT NULL DEFAULT 1,
  parent_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT ai_agents_no_self_parent CHECK (parent_agent_id IS NULL OR parent_agent_id <> id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage agents" ON public.ai_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Managers view agents" ON public.ai_agents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'MANAGER'));

-- FLOW STEPS
CREATE TABLE public.ai_agent_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.ai_agent_flows(id) ON DELETE CASCADE,
  step_code text NOT NULL,
  name text NOT NULL,
  description text,
  message text NOT NULL DEFAULT '',
  answer_type text NOT NULL DEFAULT 'TEXTO_LIVRE',
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_step_code text,
  exit_condition text,
  allow_parallel_question boolean NOT NULL DEFAULT true,
  allow_free_answer boolean NOT NULL DEFAULT true,
  handoff boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (flow_id, step_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_flow_steps TO authenticated;
GRANT ALL ON public.ai_agent_flow_steps TO service_role;
ALTER TABLE public.ai_agent_flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage flow steps" ON public.ai_agent_flow_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Managers view flow steps" ON public.ai_agent_flow_steps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'MANAGER'));

-- VERSIONS
CREATE TABLE public.ai_agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ATIVA',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (agent_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_versions TO authenticated;
GRANT ALL ON public.ai_agent_versions TO service_role;
ALTER TABLE public.ai_agent_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage agent versions" ON public.ai_agent_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Managers view agent versions" ON public.ai_agent_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'MANAGER'));

-- TEST SESSIONS
CREATE TABLE public.ai_agent_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  agent_version_id uuid REFERENCES public.ai_agent_versions(id) ON DELETE SET NULL,
  title text,
  status text NOT NULL DEFAULT 'ABERTA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_test_sessions TO authenticated;
GRANT ALL ON public.ai_agent_test_sessions TO service_role;
ALTER TABLE public.ai_agent_test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage test sessions" ON public.ai_agent_test_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- TEST MESSAGES
CREATE TABLE public.ai_agent_test_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_agent_test_sessions(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  provider text,
  model text,
  latency_ms integer,
  tokens_used integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_test_messages TO authenticated;
GRANT ALL ON public.ai_agent_test_messages TO service_role;
ALTER TABLE public.ai_agent_test_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage test messages" ON public.ai_agent_test_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN')) WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

-- updated_at triggers
CREATE TRIGGER trg_ai_agent_flows_updated BEFORE UPDATE ON public.ai_agent_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_agent_flow_steps_updated BEFORE UPDATE ON public.ai_agent_flow_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_agent_versions_updated BEFORE UPDATE ON public.ai_agent_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_agent_test_sessions_updated BEFORE UPDATE ON public.ai_agent_test_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ai_agent_test_messages_updated BEFORE UPDATE ON public.ai_agent_test_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ai_agent_flow_steps_flow ON public.ai_agent_flow_steps(flow_id, order_index);
CREATE INDEX idx_ai_agent_versions_agent ON public.ai_agent_versions(agent_id, version_number DESC);
CREATE INDEX idx_ai_agent_test_messages_session ON public.ai_agent_test_messages(session_id, created_at);