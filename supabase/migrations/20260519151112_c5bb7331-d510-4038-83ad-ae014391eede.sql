
REVOKE EXECUTE ON FUNCTION public.auto_create_referral_commission() FROM anon, authenticated, PUBLIC;

DROP POLICY IF EXISTS "Authenticated users can view document types" ON public.service_document_types;

CREATE POLICY "Staff can view document types"
ON public.service_document_types
FOR SELECT
TO authenticated
USING (
  public.has_any_role(
    auth.uid(),
    ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA','JURIDICO','FINANCEIRO','TECNICO','EXPEDIENTE','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::public.app_role[]
  )
);
