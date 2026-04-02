

## Limpar Dados de Clientes para Testes

### Dados encontrados no banco
- 3 contatos, 3 leads, 54 interacoes, 3 tarefas, 118 mensagens, 2 notificacoes
- 0 oportunidades, contratos, pagamentos e service_cases

### Plano

Executar uma migracao SQL que deleta dados em ordem de dependencia (tabelas filhas primeiro):

```sql
-- 1. Tabelas sem dependentes / folhas
DELETE FROM mensagens_cliente;
DELETE FROM interactions;
DELETE FROM tasks;
DELETE FROM notifications;
DELETE FROM case_notes;
DELETE FROM portal_messages;
DELETE FROM nps_surveys;
DELETE FROM audit_logs;
DELETE FROM n8n_chat_histories;
DELETE FROM customer_chat_context;
DELETE FROM chat_routing_logs;
DELETE FROM whatsapp_template_logs;
DELETE FROM message_dedup;
DELETE FROM customer_sector_pending_items;
DELETE FROM reactivation_resolutions;

-- 2. Documentos e lembretes
DELETE FROM service_documents;
DELETE FROM generated_documents;
DELETE FROM document_reminders;
DELETE FROM huellas_reminders;
DELETE FROM initial_contact_reminders;
DELETE FROM tie_pickup_reminders;
DELETE FROM payment_reminders;
DELETE FROM requirement_reminders;
DELETE FROM contract_reminders;

-- 3. Contratos e pagamentos
DELETE FROM contract_beneficiaries;
DELETE FROM contract_costs;
DELETE FROM contract_notes;
DELETE FROM contract_leads;
DELETE FROM commissions;
DELETE FROM payments;
DELETE FROM contracts;

-- 4. Service cases e requirements
DELETE FROM requirements_from_authority;
DELETE FROM service_cases;

-- 5. Oportunidades
DELETE FROM opportunities;

-- 6. Leads
DELETE FROM lead_intake;
DELETE FROM leads;

-- 7. Contatos
DELETE FROM contacts;

-- 8. Invoices e cash flow
DELETE FROM invoices;
DELETE FROM cash_flow;
```

Isso remove **todos os dados de clientes** mantendo tabelas de configuracao intactas (service_types, service_sectors, profiles, user_roles, system_config, whatsapp_templates, etc.).

### Arquivos modificados
- Nova migracao SQL (apenas DELETE statements, sem alteracao de schema)

