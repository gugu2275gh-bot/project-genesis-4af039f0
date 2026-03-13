
-- Limpeza de dados de teste/clientes (ordem corrigida)

-- Módulo Técnico / Documentos
DELETE FROM generated_documents;
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM case_notes;
DELETE FROM nps_surveys;

-- Módulo Financeiro
DELETE FROM cash_flow;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM payment_reminders;
DELETE FROM payments;

-- Contratos
DELETE FROM contract_reminders;
DELETE FROM contract_costs;
DELETE FROM contract_notes;
DELETE FROM contract_beneficiaries;
DELETE FROM contracts;

-- CRM (tasks ANTES de service_cases)
DELETE FROM interactions;
DELETE FROM tasks;
DELETE FROM mensagens_cliente;

-- Casos (após tasks)
DELETE FROM service_cases;

-- CRM continuação
DELETE FROM opportunities;
DELETE FROM leads;
DELETE FROM lead_intake;
DELETE FROM contacts;

-- Notificações e Audit
DELETE FROM notifications;
DELETE FROM audit_logs;
