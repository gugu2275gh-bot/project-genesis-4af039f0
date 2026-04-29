-- Enable RLS on tables that have policies defined but RLS disabled (critical security fix)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_cliente ENABLE ROW LEVEL SECURITY;

-- Enable RLS on internal/log tables that should not be publicly accessible
ALTER TABLE public.log_webhooks_falhados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;

-- Lock down internal log tables (no public access; only service role bypasses RLS)
DROP POLICY IF EXISTS "Admins can view webhook logs" ON public.log_webhooks_falhados;
CREATE POLICY "Admins can view webhook logs"
  ON public.log_webhooks_falhados FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role));

DROP POLICY IF EXISTS "Admins can view n8n chat histories" ON public.n8n_chat_histories;
CREATE POLICY "Admins can view n8n chat histories"
  ON public.n8n_chat_histories FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role));