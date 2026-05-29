
CREATE TABLE public.whatsapp_turn_log (
  id BIGSERIAL PRIMARY KEY,
  lead_id UUID,
  contact_id UUID,
  phone TEXT,
  message_id TEXT,
  inbound_text TEXT,
  exit_reason TEXT NOT NULL,
  ai_provider TEXT,
  ai_error TEXT,
  response_chars INTEGER,
  funnel_step_before TEXT,
  funnel_step_after TEXT,
  stall_attempts INTEGER NOT NULL DEFAULT 0,
  recovered_from_message_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wtl_lead_created ON public.whatsapp_turn_log (lead_id, created_at DESC);
CREATE INDEX idx_wtl_exit_reason ON public.whatsapp_turn_log (exit_reason, created_at DESC);
CREATE INDEX idx_wtl_message_id ON public.whatsapp_turn_log (message_id);

GRANT SELECT ON public.whatsapp_turn_log TO authenticated;
GRANT ALL ON public.whatsapp_turn_log TO service_role;

ALTER TABLE public.whatsapp_turn_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Manager can read turn logs"
ON public.whatsapp_turn_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'ADMIN'::app_role)
  OR public.has_role(auth.uid(), 'MANAGER'::app_role)
);
