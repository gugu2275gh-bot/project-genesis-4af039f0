-- Limpar dados de teste preservando configurações do sistema

-- Tarefas (antes de leads/opportunities/cases por FK)
DELETE FROM tasks;

-- Módulo de Mensagens e Chat
DELETE FROM mensagens_cliente;
DELETE FROM chat_routing_logs;
DELETE FROM customer_chat_context;
DELETE FROM customer_sector_pending_items;

-- Módulo de Notificações
DELETE FROM notifications;

-- Módulo NPS
DELETE FROM nps_surveys;

-- Módulo Técnico
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM generated_documents;
DELETE FROM service_documents;
DELETE FROM requirements_from_authority;
DELETE FROM case_notes;
DELETE FROM service_cases;

-- Módulo Financeiro
DELETE FROM cash_flow;
DELETE FROM commissions;
DELETE FROM invoices;
DELETE FROM payments;

-- Módulo Contratos
DELETE FROM contract_reminders;
DELETE FROM contract_notes;
DELETE FROM contract_costs;
DELETE FROM contract_beneficiaries;
DELETE FROM contract_leads;
DELETE FROM contracts;

-- Módulo CRM
DELETE FROM interactions;
DELETE FROM lead_intake;
DELETE FROM opportunities;
DELETE FROM leads;
DELETE FROM contacts;

-- Audit logs
DELETE FROM audit_logs;