-- Limpeza completa de dados de clientes (mantém usuários, configurações, templates, KB, tipos de serviço)
DO $$
BEGIN
  -- Pagamentos / financeiro relacionado
  DELETE FROM public.cash_flow;
  DELETE FROM public.invoices;
  DELETE FROM public.commissions;
  DELETE FROM public.payments;

  -- Beneficiários / contratos
  DELETE FROM public.contract_beneficiaries;
  DELETE FROM public.contract_costs;
  DELETE FROM public.contract_notes;
  DELETE FROM public.contract_reminders;
  DELETE FROM public.contract_leads;
  DELETE FROM public.contracts;

  -- Casos de serviço e dependências
  DELETE FROM public.case_notes;
  DELETE FROM public.document_reminders;
  DELETE FROM public.generated_documents;
  DELETE FROM public.huellas_reminders;
  DELETE FROM public.initial_contact_reminders;
  DELETE FROM public.nps_surveys;
  DELETE FROM public.portal_messages;
  DELETE FROM public.requirements_from_authority;
  DELETE FROM public.service_documents;
  DELETE FROM public.tie_pickup_reminders;
  DELETE FROM public.service_cases;

  -- Tarefas
  DELETE FROM public.tasks;

  -- Interações / mensagens / chat
  DELETE FROM public.interactions;
  DELETE FROM public.mensagens_cliente;
  DELETE FROM public.message_dedup;
  DELETE FROM public.chat_routing_logs;
  DELETE FROM public.customer_chat_context;
  DELETE FROM public.customer_sector_pending_items;

  -- Documentos do cliente
  DELETE FROM public.contact_documents;

  -- Sugestões / reativações / vínculos
  DELETE FROM public.contact_data_suggestions;
  DELETE FROM public.reactivation_resolutions;
  DELETE FROM public.beneficiary_titular_links;

  -- Oportunidades / leads / intake
  DELETE FROM public.opportunities;
  DELETE FROM public.lead_intake;
  DELETE FROM public.log_webhooks_falhados;
  DELETE FROM public.leads;

  -- Contatos
  DELETE FROM public.contacts;

  -- Audit logs de operações de cliente
  DELETE FROM public.audit_logs WHERE table_name IN ('contacts','leads','opportunities','contracts','payments','service_cases');
EXCEPTION WHEN undefined_table THEN
  -- Ignora tabelas inexistentes
  NULL;
END $$;