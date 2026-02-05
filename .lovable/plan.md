

# Plano: Executar Limpeza de Dados via Migração

## Situação Atual

Confirmei que os dados existem no banco:

| Tabela | Registros a Deletar |
|--------|---------------------|
| tasks | 2 |
| payments | 1 |
| contracts | 1 |
| opportunities | 1 |
| leads | 1 |
| contacts | 1 |
| interactions | 0 |

---

## Solução

Vou criar uma **migração SQL** que será executada automaticamente pelo sistema. Isso vai:

1. Deletar todas as tasks relacionadas
2. Deletar pagamentos
3. Deletar dependências do contrato (beneficiários, custos, notas, lembretes, comissões)
4. Deletar o contrato
5. Deletar service cases e dependências (se existirem)
6. Deletar a oportunidade
7. Deletar interações
8. Deletar o lead
9. Deletar o contato
10. Limpar notificações do usuário

---

## Dados Preservados

| Item | Motivo |
|------|--------|
| **profiles** (gustavohb16@outlook.com) | Necessário para login |
| **user_roles** | Permissões mantidas |
| **superusers** | Status de superusuário mantido |

---

## Implementação Técnica

Será criada uma migração SQL no diretório `supabase/migrations/` com os comandos DELETE na ordem correta, respeitando as foreign keys.

```sql
-- A migração irá conter:
DELETE FROM tasks WHERE related_lead_id = '52e69bab-...' OR related_opportunity_id = '7aefb888-...' OR related_contract_id = 'cb9acb80-...';
DELETE FROM payments WHERE opportunity_id = '7aefb888-...';
DELETE FROM contract_beneficiaries WHERE contract_id = 'cb9acb80-...';
-- ... demais deletes em cascata
DELETE FROM contacts WHERE id = 'e9a800c4-...';
DELETE FROM notifications WHERE user_id = '427e54e9-...';
```

---

## Resultado

Após a migração:
- Todos os dados de teste do cliente Gustavo serão removidos
- O usuário poderá fazer login normalmente
- Um novo fluxo de teste pode ser iniciado do zero

