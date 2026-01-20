-- Tabela para rastrear lembretes de contrato enviados
CREATE TABLE public.contract_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('D', 'D1', 'D3', 'ESCALATION', 'CANCEL_NOTICE', 'CANCELLED')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, reminder_type)
);

-- Index para busca rápida por contrato
CREATE INDEX idx_contract_reminders_contract_id ON public.contract_reminders(contract_id);

-- Enable RLS
ALTER TABLE public.contract_reminders ENABLE ROW LEVEL SECURITY;

-- Policy para leitura por usuários autenticados com roles apropriadas
CREATE POLICY "Staff can view contract reminders"
ON public.contract_reminders
FOR SELECT
USING (
  public.has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'FINANCEIRO', 'TECNICO', 'JURIDICO']::app_role[])
);

-- Policy para inserção pela edge function (service role)
CREATE POLICY "Service role can insert contract reminders"
ON public.contract_reminders
FOR INSERT
WITH CHECK (true);

-- Comentários
COMMENT ON TABLE public.contract_reminders IS 'Rastreamento de lembretes de contrato enviados para evitar duplicações';
COMMENT ON COLUMN public.contract_reminders.reminder_type IS 'Tipo do lembrete: D (24h), D1 (48h), D3 (72h), ESCALATION (5 dias), CANCEL_NOTICE (7 dias), CANCELLED (8 dias)';