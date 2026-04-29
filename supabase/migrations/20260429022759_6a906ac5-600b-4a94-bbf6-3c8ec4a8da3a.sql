-- Limpeza completa de dados operacionais de clientes (preserva configurações e estrutura)

-- 1. Lembretes e notificações (tabelas folha)
TRUNCATE TABLE
  contract_reminders,
  payment_reminders,
  document_reminders,
  huellas_reminders,
  initial_contact_reminders,
  requirement_reminders,
  tie_pickup_reminders,
  notifications,
  nps_surveys,
  portal_messages,
  contact_data_suggestions,
  reactivation_resolutions
RESTART IDENTITY CASCADE;

-- 2. Logs e auditoria
TRUNCATE TABLE
  audit_logs,
  log_webhooks_falhados,
  webhook_logs,
  chat_routing_logs,
  whatsapp_template_logs,
  n8n_chat_histories,
  message_dedup
RESTART IDENTITY CASCADE;

-- 3. Mensagens e chat
TRUNCATE TABLE
  mensagens_cliente,
  customer_chat_context,
  customer_sector_pending_items
RESTART IDENTITY CASCADE;

-- 4. Financeiro / contratos
TRUNCATE TABLE
  cash_flow,
  invoices,
  commissions,
  payments,
  contract_costs,
  contract_notes,
  contract_beneficiaries,
  contract_leads,
  generated_documents,
  service_documents,
  service_cases,
  case_notes,
  requirements_from_authority,
  contracts
RESTART IDENTITY CASCADE;

-- 5. Pipeline / leads / contatos
TRUNCATE TABLE
  tasks,
  interactions,
  opportunities,
  lead_intake,
  beneficiary_titular_links,
  leads,
  contacts
RESTART IDENTITY CASCADE;

-- 6. Reset da sequência de número de contrato
ALTER SEQUENCE IF EXISTS contract_number_seq RESTART WITH 1;