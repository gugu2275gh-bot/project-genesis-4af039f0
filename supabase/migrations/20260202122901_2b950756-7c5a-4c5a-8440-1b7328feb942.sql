-- Create table for tracking TIE pickup reminders
CREATE TABLE IF NOT EXISTS tie_pickup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id uuid NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tie_pickup_reminders_case ON tie_pickup_reminders(service_case_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tie_pickup_reminders_unique ON tie_pickup_reminders(service_case_id, reminder_type);

-- Enable RLS
ALTER TABLE tie_pickup_reminders ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view reminders
CREATE POLICY "Authenticated users can view tie_pickup_reminders"
ON tie_pickup_reminders FOR SELECT
TO authenticated
USING (true);

-- Policy for service role to manage reminders (for edge functions)
CREATE POLICY "Service role can manage tie_pickup_reminders"
ON tie_pickup_reminders FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add default templates to system_config if not exist
INSERT INTO system_config (key, value, description)
VALUES 
  ('template_tie_available_direct', 'Ola {nome}! Otimas noticias! Seu TIE esta disponivel para retirada. Local: Comisaria de Policia Nacional. Documentos necessarios: Passaporte, Resguardo de Huellas e Comprovante Taxa 790. Voce pode retirar a qualquer momento no horario de atendimento.', 'Template para notificar cliente sobre TIE disponível (sem cita)'),
  ('template_tie_reminder_direct', 'Ola {nome}! Lembramos que seu TIE esta disponivel para retirada na Comisaria. Por favor, retire o documento o mais breve possivel. Documentos: Passaporte, Resguardo e Taxa 790.', 'Template para lembrete de retirada de TIE'),
  ('sla_tie_pickup_tech_alert_days', '12', 'Dias até alertar técnico sobre TIE não retirado'),
  ('sla_tie_pickup_coord_alert_days', '15', 'Dias até alertar coordenador sobre TIE não retirado')
ON CONFLICT (key) DO NOTHING;