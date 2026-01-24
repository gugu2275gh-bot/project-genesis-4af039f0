-- Fase 1: Adicionar payment_status ao contrato
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'NAO_INICIADO';
COMMENT ON COLUMN contracts.payment_status IS 'NAO_INICIADO, INICIADO, QUITADO';

-- Fase 5: Campos para prorrogação de pagamentos
ALTER TABLE payments ADD COLUMN IF NOT EXISTS original_due_date date;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS rescheduled_reason text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_available_in_portal boolean DEFAULT false;

-- Fase 6: Campos para tracking de SLAs específicos
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS documents_completed_at timestamptz;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS technical_approved_at timestamptz;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS sent_to_legal_at timestamptz;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS requirement_received_at timestamptz;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS requirement_deadline date;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_instructions_sent boolean DEFAULT false;

-- Configurações SLA adicionais
INSERT INTO system_config (key, value, description) VALUES 
  ('sla_technical_review_alert_days', '2,5,7', 'Dias para alertas de revisão técnica (técnico, coordenador, ADM)'),
  ('sla_send_to_legal_alert_days', '3,5,8', 'Dias para alertas de envio ao jurídico'),
  ('sla_requirement_legal_deadline_days', '10', 'Prazo legal para responder exigência'),
  ('sla_pre_protocol_reminder_days', '1', 'Dias antes do protocolo para lembrete'),
  ('sla_post_protocol_followup_days', '14,21,35', 'Dias para follow-up pós-protocolo')
ON CONFLICT (key) DO NOTHING;

-- Função para atualizar payment_status do contrato quando pagamento é confirmado
CREATE OR REPLACE FUNCTION update_contract_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMADO' AND OLD.status != 'CONFIRMADO' THEN
    -- Verificar se é a primeira parcela paga
    IF EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = NEW.contract_id
      AND c.payment_status = 'NAO_INICIADO'
    ) THEN
      UPDATE contracts SET payment_status = 'INICIADO' WHERE id = NEW.contract_id;
    END IF;
    
    -- Verificar se todas as parcelas foram pagas
    IF NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.contract_id = NEW.contract_id
      AND p.status != 'CONFIRMADO'
    ) THEN
      UPDATE contracts SET payment_status = 'QUITADO' WHERE id = NEW.contract_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para atualizar status do contrato
DROP TRIGGER IF EXISTS trigger_update_contract_payment_status ON payments;
CREATE TRIGGER trigger_update_contract_payment_status
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_payment_status();