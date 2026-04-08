
-- Clean all client-related data in correct order to respect foreign keys

-- Case-related
DELETE FROM case_notes;
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM generated_documents;
DELETE FROM nps_surveys;
DELETE FROM service_cases;

-- Contract-related
DELETE FROM contract_costs;
DELETE FROM contract_notes;
DELETE FROM contract_beneficiaries;
DELETE FROM contract_reminders;
DELETE FROM contract_leads;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM payments;
DELETE FROM contracts;

-- Opportunities
DELETE FROM opportunities;

-- Tasks, interactions, messages
DELETE FROM tasks;
DELETE FROM interactions;
DELETE FROM mensagens_cliente;

-- Customer context
DELETE FROM customer_sector_pending_items;
DELETE FROM customer_chat_context;
DELETE FROM chat_routing_logs;

-- Cash flow
DELETE FROM cash_flow;

-- Leads
DELETE FROM lead_intake;
DELETE FROM leads;

-- Contacts
DELETE FROM contacts;

-- Notifications
DELETE FROM notifications;
