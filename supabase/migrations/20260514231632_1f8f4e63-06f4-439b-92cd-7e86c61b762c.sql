DROP POLICY IF EXISTS "Authenticated users can view links" ON public.beneficiary_titular_links;

CREATE POLICY "Staff can view beneficiary links"
ON public.beneficiary_titular_links
FOR SELECT
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY[
    'ADMIN'::app_role, 'MANAGER'::app_role, 'SUPERVISOR'::app_role,
    'DIRETORIA'::app_role, 'JURIDICO'::app_role, 'FINANCEIRO'::app_role,
    'TECNICO'::app_role, 'EXPEDIENTE'::app_role, 'ATENCAO_CLIENTE'::app_role,
    'ATENDENTE_WHATSAPP'::app_role
  ])
);