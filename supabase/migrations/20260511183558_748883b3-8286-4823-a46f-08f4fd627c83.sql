
-- 1. Fix search_path on functions missing it
ALTER FUNCTION public.cleanup_old_dedup_entries() SET search_path = public;
ALTER FUNCTION public.generate_contract_number() SET search_path = public;
ALTER FUNCTION public.hybrid_search(text, vector, integer, double precision, double precision, integer) SET search_path = public;

-- 2. Revoke EXECUTE from anon/authenticated on trigger-only and internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.auto_assign_first_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_commission_amount() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_invoice_totals() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_dedup_entries() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_contract_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_payment_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_lead_status_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_contract_payment_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_contract_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;

-- merge_contacts is called from authenticated app; only revoke from anon
REVOKE EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) FROM anon;
-- match_knowledge_base used server-side; revoke from anon
REVOKE EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) FROM anon;

-- 3. Tighten beneficiary_titular_links policies to staff only
DROP POLICY IF EXISTS "Authenticated users can insert links" ON public.beneficiary_titular_links;
DROP POLICY IF EXISTS "Authenticated users can delete links" ON public.beneficiary_titular_links;

CREATE POLICY "Staff can insert beneficiary links"
  ON public.beneficiary_titular_links
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA','JURIDICO','FINANCEIRO','TECNICO','EXPEDIENTE','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::app_role[]));

CREATE POLICY "Staff can delete beneficiary links"
  ON public.beneficiary_titular_links
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA','JURIDICO','FINANCEIRO','TECNICO','EXPEDIENTE','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::app_role[]));

-- 4. Add baseline policies to message_dedup (service-only access)
CREATE POLICY "Service role can manage message_dedup"
  ON public.message_dedup
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Storage: add DELETE policy on client-documents
CREATE POLICY "Staff can delete client documents"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','JURIDICO','FINANCEIRO','TECNICO','ATENCAO_CLIENTE']::app_role[])
  );

-- 6. Storage: tighten whatsapp-media INSERT to staff only (webhook uses service_role which bypasses RLS)
DROP POLICY IF EXISTS "Service role can insert whatsapp media" ON storage.objects;
CREATE POLICY "Staff can upload whatsapp media"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND public.has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR','DIRETORIA','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP']::app_role[])
  );
