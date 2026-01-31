
# Plano: Automação de Confirmação de Pagamento

## Objetivo

Quando o Financeiro confirmar um pagamento:
1. **Notificar o técnico responsável** para iniciar o processo (se for a primeira ou única parcela do contrato)
2. **Registrar automaticamente no Livro Caixa** como uma entrada

---

## Análise da Situação Atual

### O que já existe

| Funcionalidade | Status | Observação |
|----------------|--------|------------|
| Confirmação de pagamento (`confirmPayment`) | ✅ | Hook completo em `usePayments.ts` |
| Criação de caso técnico no primeiro pagamento | ✅ | Já implementado |
| Notificação genérica a todos os técnicos | ✅ | Notifica a função TECNICO, não o responsável |
| Cash Flow (Livro Caixa) | ✅ | Tabela e UI funcionais |
| Campo `related_payment_id` no cash_flow | ✅ | Disponível para vinculação |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Notificação ao técnico responsável** | Quando o caso é criado/atualizado, notificar especificamente o `assigned_to_user_id` |
| **Lançamento automático no Cash Flow** | Criar entrada SERVICOS com valor do pagamento confirmado |
| **Vinculação payment/cash_flow** | Usar `related_payment_id` e `related_contract_id` |

---

## Fluxo Visual

```text
   FINANCEIRO CONFIRMA PAGAMENTO
                │
                ▼
   ┌────────────────────────────────────┐
   │ 1. Atualiza payment.status →       │
   │    CONFIRMADO                       │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ 2. É primeira/única parcela?       │
   │    ├── SIM → Cria caso técnico     │
   │    │         Notifica técnico resp.│
   │    └── NÃO → Apenas confirma       │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ 3. NOVO: Criar lançamento no       │
   │    Cash Flow (ENTRADA - SERVICOS)  │
   │    • Valor: payment.amount         │
   │    • Conta: baseada no método      │
   │    • Descrição: cliente + parcela  │
   │    • related_payment_id: payment.id│
   └────────────────────────────────────┘
```

---

## Alterações Técnicas

### 1. Modificar `src/hooks/usePayments.ts`

**Adicionar no `confirmPayment.mutationFn`:**

```typescript
// Após confirmar o pagamento (linha ~95):

// 6. NOVO: Criar entrada no Livro Caixa
const clientName = opportunity?.leads?.contacts?.full_name || 'Cliente';
const installmentInfo = payment.installment_number 
  ? ` - Parcela ${payment.installment_number}` 
  : '';

// Mapear método de pagamento para conta
const accountMap: Record<string, string> = {
  'TRANSFERENCIA': 'BRUCKSCHEN_ES',
  'PIX': 'PIX_BR',
  'PAYPAL': 'PAYPAL',
  'CARTAO': 'BRUCKSCHEN_ES',
  'DINHEIRO': 'DINHEIRO',
  'OUTRO': 'OUTRO',
};

const paymentAccount = accountMap[payment.payment_method || 'OUTRO'] || 'OUTRO';

await supabase.from('cash_flow').insert({
  type: 'ENTRADA',
  category: 'SERVICOS',
  description: `Pagamento ${clientName}${installmentInfo}`,
  amount: payment.amount,
  payment_account: paymentAccount,
  related_payment_id: payment.id,
  related_contract_id: contractId,
  reference_date: paidAt || new Date().toISOString().split('T')[0],
  created_by_user_id: user?.id,
});

// 7. Se for primeiro pagamento e caso foi criado, 
// notificar técnico responsável quando atribuído
// (o caso é criado sem assigned_to, então notificação 
// será enviada quando o coordenador atribuir)
```

### 2. Adicionar notificação específica ao técnico

Quando um caso é criado, ele inicialmente não tem `assigned_to_user_id`. A notificação ao técnico específico deve acontecer quando:
- O coordenador atribui o caso a um técnico
- OU se o caso já tiver um técnico atribuído

Vou adicionar lógica para:
1. Se já existe caso com técnico atribuído → notificar esse técnico
2. Se é novo caso → notificar MANAGER/COORD para atribuir

---

## Lógica de Mapeamento de Conta

| Método de Pagamento | Conta Cash Flow |
|---------------------|-----------------|
| TRANSFERENCIA | BRUCKSCHEN_ES |
| PIX | PIX_BR |
| PAYPAL | PAYPAL |
| CARTAO | BRUCKSCHEN_ES |
| DINHEIRO | DINHEIRO |
| OUTRO | OUTRO |

---

## Invalidação de Query Cache

Adicionar na `onSuccess`:
```typescript
queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
```

Isso garante que a tela de Cash Flow seja atualizada automaticamente.

---

## Verificação de Duplicidade

Antes de criar o lançamento no Cash Flow, verificar se já existe entrada com o mesmo `related_payment_id` para evitar duplicatas:

```typescript
const { data: existingEntry } = await supabase
  .from('cash_flow')
  .select('id')
  .eq('related_payment_id', payment.id)
  .maybeSingle();

if (!existingEntry) {
  // Criar entrada
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/usePayments.ts` | Adicionar criação de entrada no Cash Flow + notificação melhorada |

---

## Exemplo de Lançamento Criado

```json
{
  "type": "ENTRADA",
  "category": "SERVICOS",
  "description": "Pagamento João Silva - Parcela 1",
  "amount": 500.00,
  "payment_account": "PIX_BR",
  "related_payment_id": "uuid-do-pagamento",
  "related_contract_id": "uuid-do-contrato",
  "reference_date": "2026-01-31",
  "created_by_user_id": "uuid-do-financeiro"
}
```

---

## Testes Recomendados

1. Confirmar pagamento único (sem parcelas) → verificar Cash Flow
2. Confirmar primeira parcela → verificar Cash Flow + notificação
3. Confirmar parcela intermediária → verificar Cash Flow (sem notificação extra)
4. Verificar que a entrada aparece corretamente na tela de Fluxo de Caixa
5. Verificar vinculação correta (filtrar por contrato/pagamento)
6. Tentar confirmar mesmo pagamento duas vezes → verificar que não duplica

---

## Benefícios

- **Automação completa**: Zero entrada manual no Cash Flow
- **Rastreabilidade**: Cada entrada vinculada ao pagamento original
- **Consistência**: Conta de destino baseada no método de pagamento
- **Eficiência**: Financeiro confirma em um lugar, sistema atualiza tudo
