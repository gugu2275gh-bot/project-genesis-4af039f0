

# Limpeza de dados de clientes para novos testes

## Dados atuais no banco
- 6 contatos
- 13 leads
- 9 oportunidades
- 3 contratos
- 10 pagamentos
- 0 service_cases

## Ordem de exclusão (respeitando foreign keys)

A limpeza precisa seguir a ordem correta para evitar erros de integridade referencial:

1. `payments` (10 registros) — depende de contracts/opportunities
2. `contract_beneficiaries` — depende de contracts
3. `contract_leads` — depende de contracts/leads
4. `contracts` (3 registros) — depende de opportunities
5. `tasks` — depende de leads/opportunities
6. `interactions` — depende de leads
7. `mensagens_cliente` — depende de leads
8. `service_documents` — depende de service_cases
9. `service_cases` (0 registros) — depende de opportunities
10. `opportunities` (9 registros) — depende de leads
11. `leads` (13 registros) — depende de contacts
12. `notifications` — pode referenciar diversos registros
13. `contacts` (6 registros) — tabela base

## Execução

Usarei a ferramenta de insert/delete do Supabase para executar DELETEs em cada tabela na ordem correta. Nenhuma alteração de schema é necessária.

