## Problema

A tela `/finance/commissions` está vazia. Verificação no banco:
- 0 comissões cadastradas
- 2 contratos com `referral_name` (indicação) preenchido
- 0 pagamentos `CONFIRMADO`

Hoje, comissões só são criadas manualmente pelo botão "Registrar Comissão". O hook `useCommissions` ainda aplica dois filtros de exibição (exige pagamento confirmado E indicação), o que esconderia mesmo as criadas manualmente.

## Solução

**Gerar comissões automaticamente** sempre que um contrato tiver indicação (`contacts.referral_name`), independente do status de pagamento.

### 1. Trigger de criação automática (SQL)

Função `auto_create_referral_commission()` + trigger `AFTER INSERT OR UPDATE` em `contracts`:

- Dispara quando `total_fee` ou `opportunity_id` mudam, ou em insert.
- Lê `referral_name` via `opportunities → leads → contacts`.
- Se houver indicação e ainda não existir comissão para o `contract_id`, insere:
  - `collaborator_name` = `referral_name`
  - `collaborator_type` = `'CAPTADOR'`
  - `base_amount` = `total_fee`
  - `commission_rate` = valor de `system_config.default_commission_rate` (÷100), fallback 0.10
  - `commission_amount` = `base_amount * rate`
  - `status` = `'PENDENTE_APROVACAO'`
- Se a comissão já existir e ainda estiver `PENDENTE_APROVACAO`, atualiza `base_amount`/`commission_amount` quando `total_fee` mudar (mantém edições posteriores intactas em outros status).

### 2. Backfill imediato

Mesma migração roda um `INSERT ... SELECT` para criar comissões dos contratos atuais com indicação que ainda não as têm (hoje: os 2 contratos identificados).

### 3. Ajuste no frontend (`src/hooks/useCommissions.ts`)

Remover o filtro `hasPaidPayment && hasReferral` do `commissionsQuery`. Motivo:
- Indicação já é garantida pelo trigger (toda comissão criada já tem referral).
- Exigir pagamento confirmado escondia comissões pendentes de aprovação — exatamente o caso atual do usuário.

Manter o resto do hook (status, badges, tabs) igual.

### Arquivos

- Migração SQL nova (trigger + função + backfill)
- `src/hooks/useCommissions.ts` — remover filtro de exibição

Sem mudanças visuais na página `Commissions.tsx`.
