
# Plano: Limpar Dados do Cliente Gustavo

## Dados Identificados

Encontrei os seguintes registros relacionados ao cliente Gustavo:

| Tabela | ID | Descrição |
|--------|-----|-----------|
| **contacts** | `e9a800c4-9401-4e49-9f3a-018013c68e09` | Contato "gustavo braga" |
| **leads** | `52e69bab-3182-4385-9c27-055a7eb4927c` | Lead do contato |
| **opportunities** | `7aefb888-6016-441a-bda6-cd92ef70c320` | Oportunidade FECHADA_GANHA |
| **contracts** | `cb9acb80-22fb-449c-93b9-0e78022d9206` | Contrato da oportunidade |
| **payments** | `3e844854-0a31-47d4-8c6e-9c57b020848b` | Pagamento da oportunidade |
| **tasks** | 2 registros | Tarefas relacionadas |
| **profiles** | `427e54e9-f759-4b07-8a55-467ef470cc31` | Perfil do usuário (NÃO DELETAR) |

---

## Script SQL de Limpeza

Execute o seguinte script no **Supabase SQL Editor** (Cloud View > Run SQL):

```sql
-- =====================================================
-- SCRIPT DE LIMPEZA: Cliente Gustavo
-- Execute no Supabase SQL Editor
-- =====================================================

-- 1. Deletar Tasks relacionadas
DELETE FROM tasks 
WHERE related_lead_id = '52e69bab-3182-4385-9c27-055a7eb4927c'
   OR related_opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320'
   OR related_contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';

-- 2. Deletar Pagamentos
DELETE FROM payments 
WHERE opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320';

-- 3. Deletar dependências do Contrato (caso existam)
DELETE FROM contract_beneficiaries WHERE contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';
DELETE FROM contract_costs WHERE contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';
DELETE FROM contract_notes WHERE contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';
DELETE FROM contract_reminders WHERE contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';
DELETE FROM commissions WHERE contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';

-- 4. Deletar Contrato
DELETE FROM contracts 
WHERE opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320';

-- 5. Deletar Service Cases (se existirem)
DELETE FROM case_notes WHERE service_case_id IN (
  SELECT id FROM service_cases WHERE opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320'
);
DELETE FROM case_requirements WHERE service_case_id IN (
  SELECT id FROM service_cases WHERE opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320'
);
DELETE FROM service_cases 
WHERE opportunity_id = '7aefb888-6016-441a-bda6-cd92ef70c320';

-- 6. Deletar Oportunidade
DELETE FROM opportunities 
WHERE lead_id = '52e69bab-3182-4385-9c27-055a7eb4927c';

-- 7. Deletar Interações do Lead
DELETE FROM interactions 
WHERE lead_id = '52e69bab-3182-4385-9c27-055a7eb4927c';

-- 8. Deletar Lead
DELETE FROM leads 
WHERE id = '52e69bab-3182-4385-9c27-055a7eb4927c';

-- 9. Deletar Contato
DELETE FROM contacts 
WHERE id = 'e9a800c4-9401-4e49-9f3a-018013c68e09';

-- 10. Limpar notificações do usuário (mantém o profile)
DELETE FROM notifications 
WHERE user_id = '427e54e9-f759-4b07-8a55-467ef470cc31';

-- =====================================================
-- FIM DO SCRIPT
-- O perfil (profile) do usuário será MANTIDO para login
-- =====================================================
```

---

## Dados que serão PRESERVADOS

| Item | Motivo |
|------|--------|
| **profiles** (gustavohb16@outlook.com) | Necessário para login no sistema |
| **superusers** | Status de superusuário mantido |
| **user_roles** | Permissões do usuário mantidas |

---

## Como Executar

1. Acesse o **Supabase Dashboard** do projeto
2. Vá em **SQL Editor**
3. Cole o script acima
4. Execute o script
5. O cliente Gustavo poderá iniciar um novo teste do zero

---

## Resultado Esperado

Após a execução:
- Todas as tabelas de negócio estarão limpas para o cliente Gustavo
- O usuário `gustavohb16@outlook.com` continuará podendo fazer login
- Um novo lead/contato pode ser criado para testes
