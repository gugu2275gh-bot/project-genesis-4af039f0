-- Add APROVADO_INTERNAMENTE to technical_status enum
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'APROVADO_INTERNAMENTE';

-- Add approval-related fields to service_cases
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS approval_date DATE,
ADD COLUMN IF NOT EXISTS residencia_validity_date DATE,
ADD COLUMN IF NOT EXISTS approval_notified_client BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_whatsapp_sent_at TIMESTAMPTZ;