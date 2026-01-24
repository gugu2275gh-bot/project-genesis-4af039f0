-- =====================================================
-- FASE 1: MIGRAÇÃO COMPLETA - FLUXO OPERACIONAL CB ASESORIA
-- =====================================================

-- 1.1 NOVOS CAMPOS NA TABELA CONTACTS (Onboarding)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS civil_status text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS father_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS mother_name text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS empadronamiento_address text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS eu_entry_last_6_months boolean;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS previous_official_relationship boolean;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS expulsion_history boolean;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS education_level text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS spain_arrival_date date;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS document_type text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS document_number text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS referral_confirmed boolean;

-- 1.2 TABELA CONTRACT_BENEFICIARIES (Contratos Familiares)
CREATE TABLE IF NOT EXISTS public.contract_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  document_type text,
  document_number text,
  relationship text,
  nationality text,
  birth_date date,
  is_primary boolean DEFAULT false,
  service_case_id uuid REFERENCES public.service_cases(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para contract_beneficiaries
ALTER TABLE public.contract_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage beneficiaries" ON public.contract_beneficiaries
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'JURIDICO'::app_role, 'ATENCAO_CLIENTE'::app_role]));

CREATE POLICY "Staff can view beneficiaries" ON public.contract_beneficiaries
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

-- 1.3 TABELA COMMISSIONS (Comissionamentos)
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id),
  collaborator_name text NOT NULL,
  collaborator_type text NOT NULL CHECK (collaborator_type IN ('CAPTADOR', 'FORNECEDOR')),
  base_amount numeric NOT NULL,
  commission_rate numeric DEFAULT 0.10,
  commission_amount numeric,
  has_invoice boolean DEFAULT false,
  status text DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'PAGA', 'CANCELADA')),
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para calcular comissão automaticamente
CREATE OR REPLACE FUNCTION calculate_commission_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- 10% se emite NF, 8% se não emite
  IF NEW.has_invoice THEN
    NEW.commission_rate := 0.10;
  ELSE
    NEW.commission_rate := 0.08;
  END IF;
  NEW.commission_amount := NEW.base_amount * NEW.commission_rate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_commission ON public.commissions;
CREATE TRIGGER trigger_calculate_commission
  BEFORE INSERT OR UPDATE ON public.commissions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_commission_amount();

-- RLS para commissions
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage commissions" ON public.commissions
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'FINANCEIRO'::app_role]));

CREATE POLICY "Staff can view commissions" ON public.commissions
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'FINANCEIRO'::app_role]));

-- 1.4 TABELA CASH_FLOW (Livro Caixa)
CREATE TABLE IF NOT EXISTS public.cash_flow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ENTRADA', 'SAIDA')),
  category text NOT NULL,
  subcategory text,
  description text,
  amount numeric NOT NULL,
  payment_account text,
  related_contract_id uuid REFERENCES public.contracts(id),
  related_payment_id uuid REFERENCES public.payments(id),
  related_commission_id uuid,
  is_invoiced boolean DEFAULT false,
  invoice_number text,
  reference_date date DEFAULT CURRENT_DATE,
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para cash_flow
ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage cash flow" ON public.cash_flow
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'FINANCEIRO'::app_role]));

CREATE POLICY "Managers can view cash flow" ON public.cash_flow
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'FINANCEIRO'::app_role]));

-- 1.5 TABELA INVOICES (Faturas/Notas Fiscais)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  contract_id uuid REFERENCES public.contracts(id),
  payment_id uuid REFERENCES public.payments(id),
  client_name text NOT NULL,
  client_document text,
  client_address text,
  service_description text NOT NULL,
  amount_without_vat numeric NOT NULL,
  vat_rate numeric DEFAULT 0.21,
  vat_amount numeric,
  total_amount numeric,
  additional_costs jsonb,
  status text DEFAULT 'EMITIDA' CHECK (status IN ('EMITIDA', 'ENVIADA', 'CANCELADA')),
  issued_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  file_url text,
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para calcular IVA automaticamente
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.vat_amount := NEW.amount_without_vat * COALESCE(NEW.vat_rate, 0.21);
  NEW.total_amount := NEW.amount_without_vat + NEW.vat_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_invoice ON public.invoices;
CREATE TRIGGER trigger_calculate_invoice
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION calculate_invoice_totals();

-- RLS para invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage invoices" ON public.invoices
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'FINANCEIRO'::app_role]));

CREATE POLICY "Staff can view invoices" ON public.invoices
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'FINANCEIRO'::app_role, 'JURIDICO'::app_role]));

-- 1.6 NOVOS STATUS TÉCNICOS (usando texto para evitar problemas com enum)
-- Adicionar campos em service_cases para fluxo pós-aprovação
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS expected_protocol_date date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_date date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_time text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_location text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_completed boolean DEFAULT false;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS tie_lot_number text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS tie_validity_date date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS tie_pickup_date date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS tie_picked_up boolean DEFAULT false;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS case_priority text DEFAULT 'NORMAL' CHECK (case_priority IN ('NORMAL', 'URGENTE', 'EM_ESPERA'));
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS juridical_review_status text CHECK (juridical_review_status IN ('PENDENTE', 'EM_REVISAO', 'APROVADO', 'REJEITADO'));
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS juridical_notes text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_status text CHECK (resource_status IN ('NAO_APLICAVEL', 'EM_ANALISE', 'SUBMETIDO', 'DEFERIDO', 'INDEFERIDO'));
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_deadline date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_notes text;

-- 1.7 TABELA PARA CATEGORIAS DE DESPESAS FIXAS
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('FIXA', 'VARIAVEL')),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage categories" ON public.expense_categories
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'FINANCEIRO'::app_role]));

CREATE POLICY "Staff can view categories" ON public.expense_categories
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'FINANCEIRO'::app_role]));

-- Inserir categorias padrão
INSERT INTO public.expense_categories (name, type, description) VALUES
  ('Aluguel', 'FIXA', 'Aluguel do escritório'),
  ('Adobe', 'FIXA', 'Assinatura Adobe'),
  ('Internet', 'FIXA', 'Serviço de internet'),
  ('Telefone', 'FIXA', 'Linhas telefônicas'),
  ('Contabilidade', 'FIXA', 'Serviços contábeis'),
  ('Tradutor', 'VARIAVEL', 'Serviços de tradução'),
  ('Taxas Oficiais', 'VARIAVEL', 'Taxas pagas a órgãos'),
  ('Material Escritório', 'VARIAVEL', 'Suprimentos'),
  ('Marketing', 'VARIAVEL', 'Publicidade e marketing'),
  ('Outros', 'VARIAVEL', 'Despesas diversas')
ON CONFLICT DO NOTHING;

-- 1.8 CONFIGURAÇÕES DE SISTEMA ADICIONAIS (Templates de mensagem)
INSERT INTO public.system_config (key, value, description) VALUES
  ('template_payment_pre_reminder_7d', 'Olá {nome}! 📅 Sua parcela de €{valor} vence em 7 dias ({data}). Lembre-se de efetuar o pagamento para manter seu processo em dia.', 'Template lembrete 7 dias antes do vencimento'),
  ('template_payment_pre_reminder_48h', 'Olá {nome}! ⏰ Sua parcela de €{valor} vence em 2 dias ({data}). Por favor, efetue o pagamento o quanto antes.', 'Template lembrete 48h antes do vencimento'),
  ('template_payment_due_today', 'Olá {nome}! 🔔 Hoje é o dia do vencimento da sua parcela de €{valor}. Efetue o pagamento até o final do dia para evitar atrasos.', 'Template lembrete no dia do vencimento'),
  ('template_document_reminder_normal', 'Olá {nome}! 📄 Ainda estamos aguardando alguns documentos para dar continuidade ao seu processo. Por favor, envie-os pelo portal.', 'Template lembrete documentos pendentes normal'),
  ('template_document_reminder_urgent', 'Olá {nome}! ⚠️ URGENTE: Precisamos dos documentos pendentes para seu processo. Por favor, envie hoje pelo portal.', 'Template lembrete documentos pendentes urgente'),
  ('template_huellas_scheduled', 'Olá {nome}! 🎉 Sua tomada de huellas está agendada para {data} às {hora} em {local}. Leve todos os documentos originais!', 'Template notificação huellas agendado'),
  ('template_tie_available', 'Olá {nome}! 🎊 Ótimas notícias! Seu TIE está disponível para retirada. Agende sua ida ao escritório o mais breve possível.', 'Template TIE disponível'),
  ('template_onboarding_reminder', 'Olá {nome}! 📝 Complete seu cadastro no portal para que possamos iniciar seu processo. Acesse: {link}', 'Template lembrete onboarding'),
  ('sla_payment_pre_reminder_7_days', '7', 'Dias antes do vencimento para primeiro lembrete'),
  ('sla_payment_pre_reminder_2_days', '2', 'Dias antes do vencimento para segundo lembrete'),
  ('sla_document_reminder_normal_days', '5', 'Dias entre lembretes de documentos (caso normal)'),
  ('sla_document_reminder_urgent_hours', '24', 'Horas entre lembretes de documentos (caso urgente)'),
  ('sla_tie_pickup_reminder_days', '3', 'Dias entre lembretes de retirada do TIE'),
  ('sla_onboarding_reminder_hours', '24', 'Horas entre lembretes de onboarding incompleto')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- 1.9 ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_commissions_contract_id ON public.commissions(contract_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.commissions(status);
CREATE INDEX IF NOT EXISTS idx_cash_flow_reference_date ON public.cash_flow(reference_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_type ON public.cash_flow(type);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON public.invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_contract_beneficiaries_contract_id ON public.contract_beneficiaries(contract_id);
CREATE INDEX IF NOT EXISTS idx_service_cases_priority ON public.service_cases(case_priority);
CREATE INDEX IF NOT EXISTS idx_contacts_onboarding ON public.contacts(onboarding_completed);