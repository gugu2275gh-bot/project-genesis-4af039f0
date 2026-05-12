-- Wave 4 - Passo 1: estado persistente do funil + name_source

CREATE TABLE public.lead_funnel_state (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  step text NOT NULL DEFAULT 'abertura',
  name_confirmed boolean NOT NULL DEFAULT false,
  email_confirmed boolean NOT NULL DEFAULT false,
  interest_confirmed text,
  location_known text,
  entry_date_confirmed text,
  empadronado_confirmed boolean,
  outside_spain_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_step_change timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_funnel_state_step ON public.lead_funnel_state(step);

ALTER TABLE public.lead_funnel_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view funnel state"
ON public.lead_funnel_state FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP','JURIDICO','FINANCEIRO','TECNICO','EXPEDIENTE','DIRETORIA']::app_role[]));

CREATE POLICY "Staff can manage funnel state"
ON public.lead_funnel_state FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::app_role[]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::app_role[]));

CREATE POLICY "Service role can manage funnel state"
ON public.lead_funnel_state FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_lead_funnel_state_updated_at
BEFORE UPDATE ON public.lead_funnel_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coluna name_source em contacts
ALTER TABLE public.contacts
  ADD COLUMN name_source text NOT NULL DEFAULT 'AUTO';

-- Backfill: leads existentes vão para "livre" (não re-perguntam nada)
INSERT INTO public.lead_funnel_state (lead_id, step, name_confirmed, email_confirmed)
SELECT
  l.id,
  'livre',
  true,
  COALESCE((c.email IS NOT NULL AND c.email <> ''), false)
FROM public.leads l
LEFT JOIN public.contacts c ON c.id = l.contact_id
ON CONFLICT (lead_id) DO NOTHING;

-- Backfill: contatos com nome real (não auto-gerado) viram STAFF_EDITED
UPDATE public.contacts
SET name_source = 'STAFF_EDITED'
WHERE full_name IS NOT NULL
  AND full_name <> ''
  AND full_name NOT LIKE 'WhatsApp %';