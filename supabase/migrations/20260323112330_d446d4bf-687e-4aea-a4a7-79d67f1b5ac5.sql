-- Update contacts SELECT policy to include EXPEDIENTE
DROP POLICY IF EXISTS "Staff can view all contacts" ON public.contacts;
CREATE POLICY "Staff can view all contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role, 'ATENCAO_CLIENTE'::app_role, 'ATENDENTE_WHATSAPP'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role, 'TECNICO'::app_role, 'EXPEDIENTE'::app_role])
);

-- Update leads: add a new SELECT policy for EXPEDIENTE
CREATE POLICY "Expediente can view all leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'EXPEDIENTE'::app_role)
);