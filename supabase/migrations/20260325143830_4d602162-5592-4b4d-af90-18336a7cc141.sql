
-- Limpeza completa de dados de teste (preserva configurações do sistema)
-- Ordem respeita dependências de chaves estrangeiras

-- 1. Remover documentos gerados
DELETE FROM public.generated_documents;

-- 2. Remover lembretes
DELETE FROM public.document_reminders;
DELETE FROM public.huellas_reminders;
DELETE FROM public.initial_contact_reminders;
DELETE FROM public.contract_reminders;

-- 3. Remover notas de casos e contratos
DELETE FROM public.case_notes;
DELETE FROM public.contract_notes;

-- 4. Remover custos de contratos
DELETE FROM public.contract_costs;

-- 5. Remover beneficiários de contratos
DELETE FROM public.contract_beneficiaries;

-- 6. Remover comissões
DELETE FROM public.commissions;

-- 7. Remover faturas
DELETE FROM public.invoices;

-- 8. Remover fluxo de caixa
DELETE FROM public.cash_flow;

-- 9. Remover pagamentos
DELETE FROM public.payments;

-- 10. Remover vínculos contract_leads
DELETE FROM public.contract_leads;

-- 11. Remover contratos
DELETE FROM public.contracts;

-- 12. Remover casos de serviço
DELETE FROM public.service_cases;

-- 13. Remover tarefas
DELETE FROM public.tasks;

-- 14. Remover itens pendentes por setor
DELETE FROM public.customer_sector_pending_items;

-- 15. Remover logs de roteamento de chat
DELETE FROM public.chat_routing_logs;

-- 16. Remover contexto de chat
DELETE FROM public.customer_chat_context;

-- 17. Remover interações/mensagens
DELETE FROM public.interactions;

-- 18. Remover oportunidades
DELETE FROM public.opportunities;

-- 19. Remover leads
DELETE FROM public.leads;

-- 20. Remover contatos
DELETE FROM public.contacts;

-- 21. Remover logs de auditoria
DELETE FROM public.audit_logs;

-- 22. Remover notificações
DELETE FROM public.notifications;
