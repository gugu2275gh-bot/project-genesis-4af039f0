-- =====================================================
-- Adicionar novos status técnicos conforme fluxo operacional
-- =====================================================

-- Novos valores para technical_status enum
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'DOCUMENTACAO_PARCIAL_APROVADA';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'EM_ORGANIZACAO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'ENVIADO_JURIDICO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'PROTOCOLADO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'EM_RECURSO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'AGENDAR_HUELLAS';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'AGUARDANDO_CITA_HUELLAS';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'HUELLAS_REALIZADO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'DISPONIVEL_RETIRADA_TIE';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'AGUARDANDO_CITA_RETIRADA';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'TIE_RETIRADO';
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'DENEGADO';

-- =====================================================
-- Campos adicionais em service_cases para Huellas e TIE
-- =====================================================

-- Campos de Huellas (tomada de impressões digitais)
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_completed boolean DEFAULT false;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS huellas_resguardo_url text;

-- Campos de TIE (documento de identidade)
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS tie_resguardo_url text;

-- Campo para data prevista de apresentação
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS juridical_review_status text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS juridical_notes text;

-- Campos de recurso
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_status text;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_deadline date;
ALTER TABLE public.service_cases ADD COLUMN IF NOT EXISTS resource_notes text;

-- =====================================================
-- Tabela para armazenar documentos gerados (EX17, Taxa 790)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id uuid NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  document_type text NOT NULL, -- EX17, TAXA_790, RESOLUCION, COMPROVANTE_PROTOCOLO, etc.
  file_url text,
  generated_at timestamptz DEFAULT now(),
  generated_by_user_id uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Funcionários podem ver documentos gerados"
ON public.generated_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'JURIDICO', 'TECNICO', 'FINANCEIRO')
  )
);

CREATE POLICY "Técnico e Jurídico podem criar documentos"
ON public.generated_documents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'JURIDICO', 'TECNICO')
  )
);

CREATE POLICY "Técnico e Jurídico podem atualizar documentos"
ON public.generated_documents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('ADMIN', 'MANAGER', 'JURIDICO', 'TECNICO')
  )
);

-- =====================================================
-- Campos para confirmação de uso de indicação
-- =====================================================
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS referral_confirmed boolean;

-- =====================================================
-- Triggers para auto-calcular comissão
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_commission_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.has_invoice THEN
    NEW.commission_rate := 0.10;
  ELSE
    NEW.commission_rate := 0.08;
  END IF;
  NEW.commission_amount := NEW.base_amount * NEW.commission_rate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS calculate_commission_trigger ON public.commissions;
CREATE TRIGGER calculate_commission_trigger
BEFORE INSERT OR UPDATE ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.calculate_commission_amount();

-- =====================================================
-- Trigger para calcular totais de fatura
-- =====================================================
CREATE OR REPLACE FUNCTION public.calculate_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.vat_amount := NEW.amount_without_vat * COALESCE(NEW.vat_rate, 0.21);
  NEW.total_amount := NEW.amount_without_vat + NEW.vat_amount;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS calculate_invoice_totals_trigger ON public.invoices;
CREATE TRIGGER calculate_invoice_totals_trigger
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.calculate_invoice_totals();

-- =====================================================
-- RLS para tabelas existentes que faltam policies
-- =====================================================

-- generated_documents - política para clientes verem seus próprios
CREATE POLICY "Clientes podem ver seus documentos gerados"
ON public.generated_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM service_cases sc
    WHERE sc.id = generated_documents.service_case_id
    AND sc.client_user_id = auth.uid()
  )
);

-- =====================================================
-- Índices para performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_service_cases_technical_status ON public.service_cases(technical_status);
CREATE INDEX IF NOT EXISTS idx_service_cases_case_priority ON public.service_cases(case_priority);
CREATE INDEX IF NOT EXISTS idx_service_cases_huellas_date ON public.service_cases(huellas_date);
CREATE INDEX IF NOT EXISTS idx_service_cases_tie_lot ON public.service_cases(tie_lot_number);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.commissions(status);
CREATE INDEX IF NOT EXISTS idx_cash_flow_reference_date ON public.cash_flow(reference_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);