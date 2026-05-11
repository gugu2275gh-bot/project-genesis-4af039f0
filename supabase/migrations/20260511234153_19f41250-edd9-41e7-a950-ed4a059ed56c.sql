CREATE OR REPLACE FUNCTION public.cleanup_test_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  results jsonb := '{}'::jsonb;
  tbl text;
  cnt bigint;
  tables_in_order text[] := ARRAY[
    'contract_reminders','document_reminders','huellas_reminders','initial_contact_reminders',
    'payment_reminders','requirement_reminders','tie_pickup_reminders',
    'reactivation_resolutions','chat_routing_logs','webhook_logs','log_webhooks_falhados',
    'whatsapp_template_logs','message_dedup','n8n_chat_histories','notifications','audit_logs',
    'commissions','invoices','cash_flow','payments',
    'contract_costs','contract_notes','contract_beneficiaries','contract_leads',
    'beneficiary_titular_links',
    'requirements_from_authority','service_documents','generated_documents','documents',
    'case_notes','service_cases',
    'tasks','interactions','portal_messages','mensagens_cliente',
    'customer_chat_context','customer_sector_pending_items',
    'nps_surveys','contact_data_suggestions',
    'contracts','opportunities','lead_intake','leads','contacts'
  ];
BEGIN
  -- Caller must be ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Apenas ADMIN pode executar limpeza';
  END IF;

  FOREACH tbl IN ARRAY tables_in_order LOOP
    EXECUTE format('DELETE FROM public.%I', tbl);
    GET DIAGNOSTICS cnt = ROW_COUNT;
    results := results || jsonb_build_object(tbl, cnt);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'results', results);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_test_data() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_test_data() TO authenticated;