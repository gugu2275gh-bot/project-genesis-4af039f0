-- 1. Create document_reminders table for tracking sent reminders
CREATE TABLE IF NOT EXISTS document_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'CLIENT',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_document_reminders_case_type 
  ON document_reminders(service_case_id, reminder_type);

-- 2. Add new SLA configurations for document tracking
INSERT INTO system_config (key, value, description) VALUES
  ('sla_document_tech_alert_hours', '48', 'Horas para alertar técnico sobre documentos pendentes'),
  ('sla_document_coord_alert_days', '5', 'Dias para alertar coordenador sobre documentos pendentes'),
  ('sla_document_admin_alert_hours', '48', 'Horas para alertar admin sobre documentos pendentes'),
  ('sla_document_waiting_first_reminder_days', '30', 'Dias antes da data prevista para primeiro lembrete (casos em espera)'),
  ('template_document_waiting', 'Olá {nome}! 📅 Faltam {dias} dias para a data prevista do seu protocolo. Por favor, comece a reunir os documentos pendentes e envie pelo portal.', 'Lembrete para casos em espera'),
  ('template_document_confirmation', 'Olá {nome}! ✅ Recebemos toda a sua documentação, que agora está em fase de revisão pelo técnico responsável. O processo de análise pode levar até 5 dias úteis.', 'Confirmação de documentação completa')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- 3. Enable RLS
ALTER TABLE document_reminders ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy - Staff can manage document reminders
CREATE POLICY "Staff can manage document reminders" 
  ON document_reminders 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('ADMIN', 'MANAGER', 'TECNICO', 'ATENCAO_CLIENTE')
    )
  );