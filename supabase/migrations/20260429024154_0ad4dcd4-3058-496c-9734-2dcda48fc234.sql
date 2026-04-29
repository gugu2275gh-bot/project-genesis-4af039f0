
TRUNCATE TABLE
  audit_logs,
  log_webhooks_falhados,
  n8n_chat_histories,
  chat_routing_logs,
  message_dedup,
  mensagens_cliente,
  customer_chat_context,
  interactions,
  notifications,
  payments,
  contract_beneficiaries,
  contract_leads,
  contract_costs,
  contract_notes,
  contracts,
  tasks,
  service_documents,
  service_cases,
  opportunities,
  commissions,
  invoices,
  beneficiary_titular_links,
  contact_data_suggestions,
  customer_sector_pending_items,
  reactivation_resolutions,
  leads,
  contacts
RESTART IDENTITY CASCADE;

ALTER SEQUENCE IF EXISTS contract_number_seq RESTART WITH 1;
