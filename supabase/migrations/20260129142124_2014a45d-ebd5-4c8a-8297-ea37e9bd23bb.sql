-- Adicionar campos para fluxo de protocolo
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS expediente_number TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_url TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved BOOLEAN DEFAULT false;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved_by UUID REFERENCES profiles(id);
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved_at TIMESTAMPTZ;

-- Comentários para documentação
COMMENT ON COLUMN service_cases.expediente_number IS 'Número de expediente da Extranjería (ID do processo no sistema do governo)';
COMMENT ON COLUMN service_cases.protocol_receipt_url IS 'URL do comprovante de protocolo (documento privado até aprovação)';
COMMENT ON COLUMN service_cases.protocol_receipt_approved IS 'Flag indicando se o técnico aprovou o comprovante de protocolo';
COMMENT ON COLUMN service_cases.protocol_receipt_approved_by IS 'UUID do usuário que aprovou o comprovante';
COMMENT ON COLUMN service_cases.protocol_receipt_approved_at IS 'Data/hora da aprovação do comprovante';