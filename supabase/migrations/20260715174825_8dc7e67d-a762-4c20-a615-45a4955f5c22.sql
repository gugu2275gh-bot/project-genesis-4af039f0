-- Revoke anon EXECUTE on trigger function (SECURITY DEFINER shouldn't be callable by public)
REVOKE EXECUTE ON FUNCTION public.enforce_client_service_document_update() FROM PUBLIC, anon, authenticated;

-- Add client scope policy to contract_leads so clients can read links for their own contracts
CREATE POLICY "Clients can view their contract leads"
ON public.contract_leads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.opportunities o ON o.id = c.opportunity_id
    JOIN public.service_cases sc ON sc.opportunity_id = o.id
    WHERE c.id = contract_leads.contract_id
      AND sc.client_user_id = auth.uid()
  )
);