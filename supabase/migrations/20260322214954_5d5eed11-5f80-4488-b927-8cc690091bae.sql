
-- Add lock columns to customer_chat_context
ALTER TABLE customer_chat_context 
  ADD COLUMN IF NOT EXISTS setor_travado text,
  ADD COLUMN IF NOT EXISTS lock_expira_em timestamptz;

-- Create routing decision log table
CREATE TABLE chat_routing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  mensagem_cliente text,
  setores_candidatos jsonb,
  setor_escolhido text,
  metodo text, -- 'single_sector', 'generic_message', 'sector_lock', 'llm', 'ultimo_setor_fallback', 'disambiguation'
  score_confianca numeric,
  ultimo_setor_usado text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_routing_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view routing logs" ON chat_routing_logs
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR']::app_role[]));

CREATE POLICY "System can insert routing logs" ON chat_routing_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_chat_routing_logs_contact ON chat_routing_logs(contact_id);
CREATE INDEX idx_chat_routing_logs_created ON chat_routing_logs(created_at DESC);
