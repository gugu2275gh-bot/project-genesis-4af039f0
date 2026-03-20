-- Table: customer_sector_pending_items
CREATE TABLE public.customer_sector_pending_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  service_case_id UUID REFERENCES public.service_cases(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sector TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_customer','in_progress','resolved','cancelled')),
  pending_subject_title TEXT,
  pending_reason TEXT,
  pending_context_summary TEXT,
  last_question_to_customer TEXT,
  awaiting_customer_reply BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  last_company_message_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  closed_by_user_id UUID,
  metadata_json JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.customer_sector_pending_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view pending items" ON public.customer_sector_pending_items
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

CREATE POLICY "Staff can manage pending items" ON public.customer_sector_pending_items
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

-- Table: reactivation_resolutions
CREATE TABLE public.reactivation_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  incoming_message_text TEXT,
  session_expired BOOLEAN DEFAULT true,
  open_pending_count INTEGER DEFAULT 0,
  llm_input_snapshot JSONB,
  llm_output_snapshot JSONB,
  selected_sector TEXT,
  selected_pending_id UUID REFERENCES public.customer_sector_pending_items(id) ON DELETE SET NULL,
  confidence_score DECIMAL(3,2),
  action_taken TEXT CHECK (action_taken IN ('direct_route','ask_confirmation','ask_disambiguation','new_subject','fallback_manual','insufficient_context')),
  user_confirmation_status TEXT DEFAULT 'pending' CHECK (user_confirmation_status IN ('pending','confirmed','denied','no_response')),
  confirmation_attempt_count INTEGER DEFAULT 0,
  secondary_pending_id UUID,
  ranked_candidates_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reactivation_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reactivation logs" ON public.reactivation_resolutions
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

CREATE POLICY "Staff can manage reactivation logs" ON public.reactivation_resolutions
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

-- Indexes
CREATE INDEX idx_pending_items_contact ON public.customer_sector_pending_items(contact_id);
CREATE INDEX idx_pending_items_status ON public.customer_sector_pending_items(status);
CREATE INDEX idx_reactivation_contact ON public.reactivation_resolutions(contact_id);
CREATE INDEX idx_reactivation_status ON public.reactivation_resolutions(user_confirmation_status);