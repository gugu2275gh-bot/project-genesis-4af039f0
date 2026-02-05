-- Limpeza completa de dados

-- Nível 4: Tabelas dependentes
DELETE FROM mensagens_cliente;
DELETE FROM interactions;
DELETE FROM case_notes;
DELETE FROM contract_notes;
DELETE FROM contract_costs;
DELETE FROM notifications;
DELETE FROM portal_messages;
DELETE FROM nps_surveys;
DELETE FROM generated_documents;
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM requirement_reminders;
DELETE FROM requirements_from_authority;
DELETE FROM contract_reminders;
DELETE FROM payment_reminders;
DELETE FROM contract_beneficiaries;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM cash_flow;

-- Nível 3
DELETE FROM payments;
DELETE FROM tasks;
DELETE FROM service_cases;

-- Nível 2
DELETE FROM contracts;

-- Nível 1
DELETE FROM opportunities;

-- Nível 0: Base
DELETE FROM leads;
DELETE FROM contacts;

-- Staging
DELETE FROM lead_intake;