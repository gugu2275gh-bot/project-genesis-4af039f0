
-- Limpeza de dados de teste - preserva profiles, roles, configurações do sistema

-- Módulo Técnico / Casos
DELETE FROM nps_surveys;
DELETE FROM generated_documents;
DELETE FROM case_notes;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM document_reminders;
DELETE FROM service_cases;

-- Módulo Financeiro
DELETE FROM payment_reminders;
DELETE FROM invoices;
DELETE FROM cash_flow;
DELETE FROM commissions;
DELETE FROM payments;

-- Módulo Contratos
DELETE FROM contract_reminders;
DELETE FROM contract_notes;
DELETE FROM contract_costs;
DELETE FROM contract_beneficiaries;
DELETE FROM contract_leads;
DELETE FROM contracts;

-- Módulo CRM
DELETE FROM customer_sector_pending_items;
DELETE FROM customer_chat_context;
DELETE FROM chat_routing_logs;
DELETE FROM mensagens_cliente;
DELETE FROM interactions;
DELETE FROM opportunities;
DELETE FROM tasks;
DELETE FROM leads;
DELETE FROM lead_intake;
DELETE FROM contacts;

-- Logs
DELETE FROM audit_logs;
DELETE FROM log_webhooks_falhados;
DELETE FROM notifications;
DELETE FROM n8n_chat_histories;
