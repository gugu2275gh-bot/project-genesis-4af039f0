
-- Lock down what non-staff clients can modify on their own service_documents rows.
-- The existing UPDATE policy allowed clients to change any column (including
-- status, rejection_reason, uploaded_by_user_id). Enforce a WITH CHECK plus a
-- BEFORE UPDATE trigger that preserves staff-controlled columns for clients.

DROP POLICY IF EXISTS "Clients can upload their documents" ON public.service_documents;

CREATE POLICY "Clients can upload their documents"
ON public.service_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.service_cases sc
    WHERE sc.id = service_documents.service_case_id
      AND sc.client_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_cases sc
    WHERE sc.id = service_documents.service_case_id
      AND sc.client_user_id = auth.uid()
  )
  AND (
    -- Staff bypass (they also match the "Staff can manage documents" policy).
    public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'TECNICO'::app_role])
    OR uploaded_by_user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.enforce_client_service_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff can modify anything.
  IF public.has_any_role(auth.uid(), ARRAY['ADMIN'::app_role, 'MANAGER'::app_role, 'TECNICO'::app_role, 'JURIDICO'::app_role, 'ATENCAO_CLIENTE'::app_role, 'FINANCEIRO'::app_role]) THEN
    RETURN NEW;
  END IF;

  -- For everyone else (clients), preserve staff-controlled columns.
  NEW.status := OLD.status;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.service_case_id := OLD.service_case_id;
  NEW.document_type_id := OLD.document_type_id;
  NEW.is_post_protocol_pending := OLD.is_post_protocol_pending;
  NEW.post_protocol_pending_since := OLD.post_protocol_pending_since;
  -- uploaded_by_user_id must be the acting client.
  NEW.uploaded_by_user_id := auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_client_service_document_update_trg ON public.service_documents;
CREATE TRIGGER enforce_client_service_document_update_trg
BEFORE UPDATE ON public.service_documents
FOR EACH ROW
EXECUTE FUNCTION public.enforce_client_service_document_update();
