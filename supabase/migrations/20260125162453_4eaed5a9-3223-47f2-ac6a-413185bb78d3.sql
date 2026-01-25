-- 1. Tabela de notas de contrato para histórico de acordos
CREATE TABLE public.contract_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  note text NOT NULL,
  note_type text DEFAULT 'ACORDO' CHECK (note_type IN ('ACORDO', 'OBSERVACAO', 'HISTORICO')),
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Índice para performance
CREATE INDEX idx_contract_notes_contract_id ON contract_notes(contract_id);

-- Habilitar RLS
ALTER TABLE contract_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Staff can view contract notes" ON contract_notes
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'FINANCEIRO', 'JURIDICO', 'ATENCAO_CLIENTE', 'TECNICO']::app_role[]));

CREATE POLICY "Finance and Legal can insert notes" ON contract_notes
  FOR INSERT WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN', 'FINANCEIRO', 'JURIDICO']::app_role[]));

CREATE POLICY "Finance and Legal can update notes" ON contract_notes
  FOR UPDATE USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'FINANCEIRO', 'JURIDICO']::app_role[]));

CREATE POLICY "Finance and Legal can delete notes" ON contract_notes
  FOR DELETE USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'FINANCEIRO', 'JURIDICO']::app_role[]));

-- 2. Campos de recibo na tabela payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_by uuid REFERENCES public.profiles(id);

-- 3. Campo para status de reparcelamento
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refinanced_status text 
  CHECK (refinanced_status IN ('ORIGINAL', 'CANCELLED_FOR_REFINANCE', 'REFINANCED'));