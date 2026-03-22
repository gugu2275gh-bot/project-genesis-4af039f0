-- Create customer_chat_context table for multichat sector routing
CREATE TABLE customer_chat_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  ultimo_setor text,
  setores_ativos jsonb DEFAULT '[]'::jsonb,
  ultima_interacao timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(contact_id)
);

ALTER TABLE customer_chat_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage chat context" ON customer_chat_context
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR',
    'ATENCAO_CLIENTE','ATENDENTE_WHATSAPP','JURIDICO','FINANCEIRO','TECNICO']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR',
    'ATENCAO_CLIENTE','ATENDENTE_WHATSAPP','JURIDICO','FINANCEIRO','TECNICO']::app_role[]));

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sector text;

INSERT INTO system_config (key, value, description)
VALUES ('chat_sector_timeout_minutes', '60', 'Tempo em minutos para expirar um setor ativo no chat multichat')
ON CONFLICT (key) DO NOTHING;