
# Plano: Limpeza Completa dos Dados de Teste

## Resumo dos Dados Atuais

| Tabela | Registros | Ação |
|--------|-----------|------|
| `contacts` | 35 | Limpar |
| `leads` | 34 | Limpar |
| `opportunities` | 11 | Limpar |
| `contracts` | 7 | Limpar |
| `payments` | 10 | Limpar |
| `service_cases` | 4 | Limpar |
| `tasks` | 15 | Limpar |
| `interactions` | 35 | Limpar |
| `documents` | 1 | Limpar |
| `mensagens_cliente` | 450 | Limpar |
| `case_notes` | 1 | Limpar |
| `profiles` | 8 | **Manter** |

---

## O Que Será Preservado

- **Perfis de usuário** (`profiles`) - Todos os 8 usuários do sistema
- **Roles e permissões** (`user_roles`, `superusers`)
- **Configurações do sistema** (`sla_configurations`, `service_sectors`, `service_types`, `document_types`, `user_profile_definitions`)
- **Estrutura do banco de dados**

---

## Ordem de Limpeza (respeita foreign keys)

A limpeza será executada na seguinte ordem para evitar erros de dependência:

1. **Nível 4** (mais dependentes):
   - `mensagens_cliente` (mensagens do chat)
   - `interactions` (interações)
   - `case_notes` (notas de casos)
   - `contract_notes` (notas de contratos)
   - `contract_costs` (custos de contratos)
   - `documents` (documentos)
   - `notifications` (notificações)

2. **Nível 3**:
   - `payments` (pagamentos)
   - `tasks` (tarefas)
   - `service_cases` (casos técnicos)

3. **Nível 2**:
   - `contracts` (contratos)

4. **Nível 1**:
   - `opportunities` (oportunidades)

5. **Nível 0** (base):
   - `leads` (leads)
   - `contacts` (contatos)

---

## Implementação

Executarei uma migração SQL com `TRUNCATE CASCADE` ou `DELETE` respeitando a ordem:

```sql
-- Limpar dados de teste mantendo estrutura e configurações

-- Nível 4: Dependentes diretos
DELETE FROM mensagens_cliente;
DELETE FROM interactions;
DELETE FROM case_notes;
DELETE FROM contract_notes;
DELETE FROM contract_costs;
DELETE FROM documents;
DELETE FROM notifications;

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
```

---

## Resultado Final

Após a limpeza:
- Sistema completamente limpo para novos testes
- Usuários e configurações mantidos
- Todas as funcionalidades operacionais
- Pronto para novo ciclo de testes

---

## Impacto no Sistema

| Aspecto | Impacto |
|---------|---------|
| Login/Auth | Nenhum - usuários mantidos |
| Configurações | Nenhum - preservadas |
| Dashboard | Mostrará zeros até novos dados |
| CRM | Pronto para novos leads |
| Portal cliente | Sem dados até novos contratos |
