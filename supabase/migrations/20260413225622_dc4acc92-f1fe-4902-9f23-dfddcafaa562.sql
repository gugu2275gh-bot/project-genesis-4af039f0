
-- Limpeza completa de dados de clientes para testes
-- Ordem respeitando integridade referencial

-- 1. Payment reminders
DELETE FROM payment_reminders;

-- 2. Payments
DELETE FROM payments;

-- 3. Contract beneficiaries
DELETE FROM contract_beneficiaries;

-- 4. Contract leads
DELETE FROM contract_leads;

-- 5. Contract costs
DELETE FROM contract_costs;

-- 6. Contract notes
DELETE FROM contract_notes;

-- 7. Contract reminders
DELETE FROM contract_reminders;

-- 8. Commissions
DELETE FROM commissions;

-- 9. Invoices
DELETE FROM invoices;

-- 10. Cash flow
DELETE FROM cash_flow;

-- 11. Contracts
DELETE FROM contracts;

-- 12. Tasks (if exists)
DELETE FROM tasks;

-- 13. Interactions
DELETE FROM interactions;

-- 14. Mensagens cliente
DELETE FROM mensagens_cliente;

-- 15. Case notes
DELETE FROM case_notes;

-- 16. Generated documents
DELETE FROM generated_documents;

-- 17. Requirements reminders
DELETE FROM requirement_reminders;

-- 18. Requirements from authority
DELETE FROM requirements_from_authority;

-- 19. Document reminders
DELETE FROM document_reminders;

-- 20. Huellas reminders
DELETE FROM huellas_reminders;

-- 21. Initial contact reminders
DELETE FROM initial_contact_reminders;

-- 22. Portal messages
DELETE FROM portal_messages;

-- 23. NPS surveys
DELETE FROM nps_surveys;

-- 24. Service cases
DELETE FROM service_cases;

-- 25. Opportunities
DELETE FROM opportunities;

-- 26. Leads
DELETE FROM leads;

-- 27. Lead intake
DELETE FROM lead_intake;

-- 28. Notifications
DELETE FROM notifications;

-- 29. Beneficiary titular links
DELETE FROM beneficiary_titular_links;

-- 30. Customer sector pending items
DELETE FROM customer_sector_pending_items;

-- 31. Customer chat context
DELETE FROM customer_chat_context;

-- 32. Chat routing logs
DELETE FROM chat_routing_logs;

-- 33. Reactivation resolutions
DELETE FROM reactivation_resolutions;

-- 34. Audit logs
DELETE FROM audit_logs;

-- 35. Contacts (por último)
DELETE FROM contacts;
