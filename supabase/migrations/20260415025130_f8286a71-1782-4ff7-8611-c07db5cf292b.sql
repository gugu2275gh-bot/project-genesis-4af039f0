
CREATE TABLE public.contact_data_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  suggested_value text NOT NULL,
  current_value text,
  source text DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone
);

ALTER TABLE public.contact_data_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view suggestions"
  ON public.contact_data_suggestions
  FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role]));

CREATE POLICY "Staff can manage suggestions"
  ON public.contact_data_suggestions
  FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role]));

CREATE POLICY "System can insert suggestions"
  ON public.contact_data_suggestions
  FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_contact_data_suggestions_contact_status ON public.contact_data_suggestions(contact_id, status);
