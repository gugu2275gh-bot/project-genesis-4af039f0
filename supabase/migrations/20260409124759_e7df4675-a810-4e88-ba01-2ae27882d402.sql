-- Limpeza de dados de clientes para testes
-- Ordem respeitando foreign keys

DELETE FROM payments;
DELETE FROM contract_beneficiaries;
DELETE FROM contract_costs;
DELETE FROM contract_notes;
DELETE FROM contract_reminders;
DELETE FROM contract_leads;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM cash_flow;
DELETE FROM contracts;
DELETE FROM tasks;
DELETE FROM interactions;
DELETE FROM mensagens_cliente;
DELETE FROM customer_sector_pending_items;
DELETE FROM lead_intake;
DELETE FROM log_webhooks_falhados;
DELETE FROM chat_routing_logs;
DELETE FROM customer_chat_context;
DELETE FROM reactivation_resolutions;
DELETE FROM service_documents;
DELETE FROM case_notes;
DELETE FROM document_reminders;
DELETE FROM generated_documents;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM nps_surveys;
DELETE FROM portal_messages;
DELETE FROM requirements_from_authority;
DELETE FROM tie_pickup_reminders;
DELETE FROM service_cases;
DELETE FROM opportunities;
DELETE FROM leads;
DELETE FROM notifications;
DELETE FROM contacts;