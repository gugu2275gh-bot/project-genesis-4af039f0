
-- Junction table: many-to-many between contracts and leads
CREATE TABLE public.contract_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(contract_id, lead_id)
);

ALTER TABLE public.contract_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view contract leads" ON public.contract_leads
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role]));

CREATE POLICY "Staff can manage contract leads" ON public.contract_leads
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'ATENCAO_CLIENTE'::app_role, 'JURIDICO'::app_role]));
