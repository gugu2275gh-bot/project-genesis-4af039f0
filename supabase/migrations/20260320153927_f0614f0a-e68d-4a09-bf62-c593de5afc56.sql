-- Limpeza de dados de teste/clientes
-- Preserva: profiles, user_roles, configurações do sistema

-- Tasks (referencia leads)
DELETE FROM tasks;

-- Módulo Técnico
DELETE FROM generated_documents;
DELETE FROM case_notes;
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM nps_surveys;
DELETE FROM service_cases;

-- Módulo Financeiro
DELETE FROM cash_flow;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM payment_reminders;
DELETE FROM payments;
DELETE FROM contract_costs;
DELETE FROM contract_notes;
DELETE FROM contract_reminders;
DELETE FROM contract_beneficiaries;
DELETE FROM contract_leads;
DELETE FROM contracts;

-- Módulo CRM
DELETE FROM interactions;
DELETE FROM opportunities;
DELETE FROM mensagens_cliente;
DELETE FROM lead_intake;
DELETE FROM leads;
DELETE FROM contacts;

-- Audit
DELETE FROM audit_logs;
DELETE FROM log_webhooks_falhados;
DELETE FROM n8n_chat_histories;