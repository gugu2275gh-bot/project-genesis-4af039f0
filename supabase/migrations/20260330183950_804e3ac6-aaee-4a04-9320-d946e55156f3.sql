
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_type TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  body_text TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  content_sid TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage whatsapp templates"
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role]));

CREATE POLICY "Authenticated can read whatsapp templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (true);

-- Seed with all automation templates
INSERT INTO public.whatsapp_templates (automation_type, template_name, body_text, variables) VALUES
  ('welcome', 'cb_welcome', 'Olá {{1}}! Obrigado por entrar em contato com CB Asesoría. Em breve um de nossos especialistas irá atendê-lo.', '["nome"]'),
  ('reengagement', 'cb_reengagement', 'Olá {{1}}! Notamos que seu cadastro está incompleto. Podemos ajudá-lo a completar suas informações?', '["nome"]'),
  ('contract_reminder', 'cb_contract_reminder', 'Olá {{1}}! Seu contrato está aguardando assinatura. Acesse o portal para finalizar.', '["nome"]'),
  ('payment_pre_7d', 'cb_payment_pre_7d', 'Olá {{1}}! 📅 Sua parcela de €{{2}} vence em 7 dias ({{3}}). Lembre-se de efetuar o pagamento.', '["nome","valor","data"]'),
  ('payment_pre_48h', 'cb_payment_pre_48h', 'Olá {{1}}! ⏰ Sua parcela de €{{2}} vence em 2 dias ({{3}}). Por favor, efetue o pagamento.', '["nome","valor","data"]'),
  ('payment_due_today', 'cb_payment_due_today', 'Olá {{1}}! 🔔 Hoje vence sua parcela de €{{2}}. Efetue o pagamento até o final do dia.', '["nome","valor"]'),
  ('payment_post_d1', 'cb_payment_post_d1', 'Olá {{1}}! Você tem um pagamento de €{{2}} em atraso. Regularize para evitar cancelamento.', '["nome","valor"]'),
  ('payment_post_d3', 'cb_payment_post_d3', 'Olá {{1}}! ⚠️ Seu pagamento de €{{2}} está 3 dias em atraso. Regularize urgentemente.', '["nome","valor"]'),
  ('document_reminder', 'cb_document_reminder', 'Olá {{1}}! 📄 Estamos aguardando o documento: {{2}}. Por favor, envie pelo portal.', '["nome","documento"]'),
  ('onboarding_reminder', 'cb_onboarding_reminder', 'Olá {{1}}! 📝 Complete seu cadastro no portal para iniciarmos seu processo.', '["nome"]'),
  ('tie_pickup', 'cb_tie_pickup', 'Olá {{1}}! 🎊 Seu TIE está disponível para retirada. Prazo: {{2}}.', '["nome","data"]'),
  ('huellas_reminder', 'cb_huellas_reminder', 'Olá {{1}}! 🔔 Lembrete sobre sua cita de huellas: {{2}}.', '["nome","data"]');
