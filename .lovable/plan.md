

# Plano: Indicador de Parcela em Atraso no Grid de Contratos

## Objetivo

Adicionar um indicador visual (badge) no grid de contratos do Financeiro para identificar rapidamente contratos que possuem parcelas em atraso.

---

## Análise Técnica

### Estrutura Atual

O hook `useContracts` já busca pagamentos junto aos contratos, mas não inclui o campo `due_date`:

```typescript
payments (
  id, amount, status, paid_at, installment_number
)
```

### O que falta

- Incluir `due_date` na query de pagamentos
- Criar lógica para detectar pagamentos em atraso
- Exibir badge visual no grid

---

## Alterações Propostas

### 1. Atualizar o hook `useContracts.ts`

Adicionar `due_date` à query de pagamentos:

```typescript
payments (
  id, amount, status, paid_at, installment_number, due_date
)
```

Atualizar o tipo `ContractWithOpportunity`:

```typescript
payments?: Array<{
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  installment_number: number | null;
  due_date: string | null;  // NOVO
}>;
```

### 2. Atualizar o grid `ContractsList.tsx`

Adicionar função para detectar pagamentos em atraso:

```typescript
const hasOverduePayments = (contract: typeof contracts[0]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const payments = contract.payments || [];
  return payments.some(p => 
    p.status === 'PENDENTE' && 
    p.due_date && 
    new Date(p.due_date) < today
  );
};
```

Adicionar badge de atraso na coluna "Saldo":

```typescript
{
  key: 'balance',
  header: 'Saldo',
  cell: (contract) => {
    const { balance } = calculatePaymentStatus(contract);
    const isFullyPaid = balance <= 0;
    const isOverdue = hasOverduePayments(contract);
    
    return (
      <div className="flex items-center gap-2">
        <span className={isFullyPaid ? 'text-emerald-600' : 'text-amber-600'}>
          {isFullyPaid ? 'Quitado' : formatCurrency(balance, contract.currency)}
        </span>
        {isOverdue && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Atraso
          </Badge>
        )}
      </div>
    );
  },
},
```

---

## Visual Esperado

| Cliente | Serviço | Status | Valor Total | Pago | Saldo |
|---------|---------|--------|-------------|------|-------|
| Breno Teste | Visto Trabalho | Assinado | € 1.500,00 | € 750,00 | € 750,00 🔴 **Atraso** |
| Maria Silva | Visto Estudante | Assinado | € 1.500,00 | € 1.500,00 | ✅ Quitado |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useContracts.ts` | Adicionar `due_date` na query e no tipo |
| `src/pages/contracts/ContractsList.tsx` | Adicionar lógica de detecção e badge visual |

---

## Benefícios

- **Visibilidade imediata**: Financeiro identifica rapidamente contratos inadimplentes
- **Ação proativa**: Permite agir antes de suspender o contrato
- **Zero impacto em performance**: Utiliza dados já carregados (apenas adiciona um campo)

