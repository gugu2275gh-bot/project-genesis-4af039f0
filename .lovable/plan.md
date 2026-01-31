

# Plano: Automação de Faturamento (Notas Fiscais) na Confirmação de Pagamento

## Objetivo

Automatizar a lógica de faturamento quando um pagamento é confirmado:
1. **Se pagamento foi para conta empresarial oficial (Bruckschen ES)** → Gerar fatura fiscal automaticamente
2. **Se pagamento foi via PIX Brasil, PayPal, conta pessoal ou dinheiro** → Não gerar fatura, apenas marcar "NO" e registrar mês/ano
3. **Permitir relatórios** de faturamento oficial vs recebimentos não faturados

---

## Análise da Infraestrutura Existente

### O que já existe

| Componente | Status | Observação |
|------------|--------|------------|
| Tabela `invoices` | ✅ | Número sequencial, IVA 21%, vinculação a pagamento |
| Tabela `cash_flow` | ✅ | Campos `is_invoiced` e `invoice_number` já existem |
| Hook `useInvoices` | ✅ | Geração de número sequencial (YYYY-NNNNN) |
| Hook `usePayments.confirmPayment` | ✅ | Já cria entrada no Cash Flow automaticamente |
| Página de Faturas | ✅ | UI completa para visualização |
| `PaymentAccount` enum | ✅ | Define contas oficiais vs informais |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Lógica de decisão de faturamento** | Verificar `payment_account` na confirmação |
| **Geração automática de fatura** | Para pagamentos em contas oficiais |
| **Atualização do Cash Flow** | Marcar `is_invoiced` e `invoice_number` |
| **Relatório de faturamento** | Filtros para oficial vs não-faturado |

---

## Regras de Negócio

### Contas que REQUEREM Fatura Fiscal (Espanha)

| Conta | Requer Fatura |
|-------|---------------|
| `BRUCKSCHEN_ES` / `BRUCKSCHEN_ASSOCIADOS_ES` | ✅ SIM |
| `BRUCKSCHEN_ASESORIA_ES` | ✅ SIM |
| `TRANSFERENCIA` (para conta ES) | ✅ SIM |
| `CARTAO` (processado na ES) | ✅ SIM |

### Contas que NÃO Requerem Fatura

| Conta | Fatura |
|-------|--------|
| `PIX_BR` / `PIX_BRASIL` | ❌ NÃO |
| `PAYPAL` | ❌ NÃO |
| `DINHEIRO` | ❌ NÃO |
| `CONTA_CAMILA` | ❌ NÃO |
| `OUTRO` | ❌ NÃO |

---

## Fluxo Visual

```text
   FINANCEIRO CONFIRMA PAGAMENTO
                │
                ▼
   ┌────────────────────────────────────┐
   │ 1. Atualiza payment → CONFIRMADO   │
   │ 2. Atualiza contrato (se primeiro) │
   │ 3. Cria entrada no Cash Flow       │
   └────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────────┐
   │ VERIFICAR CONTA DE PAGAMENTO       │
   │ (payment_account no cash_flow)     │
   └────────────────────────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
   CONTA OFICIAL      CONTA INFORMAL
   (BRUCKSCHEN)       (PIX/PAYPAL/etc)
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────────┐
│ Gerar Fatura │   │ Marcar NO        │
│ • Número seq.│   │ • is_invoiced=F  │
│ • IVA 21%    │   │ • invoice_number │
│ • Vincular   │   │   = null ou      │
│   payment_id │   │   'NO-MM/YYYY'   │
└──────────────┘   └──────────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────────┐
│ Atualizar    │   │ Atualizar        │
│ Cash Flow:   │   │ Cash Flow:       │
│ is_invoiced  │   │ is_invoiced=F    │
│   = TRUE     │   │ reference_month  │
│ invoice_num  │   │   registrado     │
│   = 2026-001 │   └──────────────────┘
└──────────────┘
```

---

## Alterações Técnicas

### 1. Modificar `src/hooks/usePayments.ts`

Adicionar lógica após criar entrada no Cash Flow (linha ~284):

```typescript
// Definir quais contas exigem fatura
const OFFICIAL_ACCOUNTS = [
  'BRUCKSCHEN_ES',
  'BRUCKSCHEN_ASSOCIADOS_ES',
  'BRUCKSCHEN_ASESORIA_ES',
];

// Verificar se a conta é oficial e requer fatura
const requiresInvoice = OFFICIAL_ACCOUNTS.includes(paymentAccount) || 
  (payment.payment_method === 'TRANSFERENCIA' && paymentAccount === 'BRUCKSCHEN_ES') ||
  (payment.payment_method === 'CARTAO' && paymentAccount === 'BRUCKSCHEN_ES');

if (requiresInvoice) {
  // Gerar fatura automática
  const invoiceNumber = await getNextInvoiceNumber();
  
  // Base de cálculo (valor bruto - assumindo que amount é o total)
  // Para IVA 21%: base = total / 1.21
  const totalAmount = payment.amount;
  const vatRate = 0.21;
  const amountWithoutVat = totalAmount / (1 + vatRate);
  const vatAmount = totalAmount - amountWithoutVat;
  
  const { data: newInvoice } = await supabase.from('invoices').insert({
    invoice_number: invoiceNumber,
    payment_id: payment.id,
    contract_id: contractId,
    client_name: clientName,
    client_document: opportunity?.leads?.contacts?.document_number || null,
    client_address: opportunity?.leads?.contacts?.address || null,
    service_description: `Serviços de assessoria - ${serviceDescription}`,
    amount_without_vat: amountWithoutVat,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    status: 'EMITIDA',
    created_by_user_id: user?.id,
  }).select().single();
  
  // Atualizar Cash Flow com referência à fatura
  if (newInvoice && cashFlowEntryId) {
    await supabase.from('cash_flow')
      .update({
        is_invoiced: true,
        invoice_number: newInvoice.invoice_number,
      })
      .eq('id', cashFlowEntryId);
  }
} else {
  // Marcar como não faturado com referência ao mês/ano
  const refMonthYear = format(new Date(paidAtDate), 'MM/yyyy');
  
  await supabase.from('cash_flow')
    .update({
      is_invoiced: false,
      invoice_number: `NO-${refMonthYear}`,
    })
    .eq('id', cashFlowEntryId);
}
```

### 2. Atualizar Inserção no Cash Flow

Modificar para capturar o ID do lançamento criado:

```typescript
const { data: cashFlowEntry } = await supabase.from('cash_flow').insert({
  type: 'ENTRADA',
  category: 'SERVICOS',
  description,
  amount: payment.amount,
  payment_account: paymentAccount,
  related_payment_id: payment.id,
  related_contract_id: contractId || null,
  reference_date: referenceDate,
  created_by_user_id: user?.id,
}).select().single();

const cashFlowEntryId = cashFlowEntry?.id;
```

### 3. Adicionar Função `getNextInvoiceNumber` no Hook

Reutilizar a lógica existente de `useInvoices`:

```typescript
async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .ilike('invoice_number', `${year}-%`)
    .order('invoice_number', { ascending: false })
    .limit(1);
  
  if (error) throw error;
  
  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = parseInt(data[0].invoice_number.split('-')[1]) || 0;
    nextNumber = lastNumber + 1;
  }
  
  return `${year}-${String(nextNumber).padStart(5, '0')}`;
}
```

### 4. Adicionar Relatório de Faturamento na Página Reports

Criar nova tab "Faturamento" em `src/pages/reports/Reports.tsx`:

**Métricas a exibir:**
- Total Faturado (com NF)
- Total Recebido Sem Fatura
- Número de Faturas Emitidas
- IVA Total a Recolher

**Filtros:**
- Por período
- Por tipo (Faturado / Não Faturado)
- Por conta de recebimento

**Tabela de dados:**
- Data | Cliente | Valor | Método | Conta | Fatura Nº | Status

### 5. Atualizar Página de Fluxo de Caixa

Adicionar coluna "Faturado?" na tabela `CashFlow.tsx`:

```typescript
{
  key: 'is_invoiced',
  header: 'Faturado',
  cell: (item) => (
    item.is_invoiced 
      ? <Badge variant="default">{item.invoice_number}</Badge>
      : <Badge variant="secondary">{item.invoice_number || 'Não'}</Badge>
  ),
},
```

### 6. Adicionar Filtros por Status de Faturamento

No `useCashFlow`, adicionar filtro opcional:

```typescript
const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'invoiced' | 'not_invoiced'>('all');

// Aplicar filtro
const filteredEntries = entries.filter(e => {
  if (invoiceFilter === 'invoiced') return e.is_invoiced;
  if (invoiceFilter === 'not_invoiced') return !e.is_invoiced;
  return true;
});
```

---

## Invalidação de Cache

Adicionar na `onSuccess` do `confirmPayment`:

```typescript
queryClient.invalidateQueries({ queryKey: ['invoices'] });
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/usePayments.ts` | Adicionar lógica de faturamento automático |
| `src/pages/finance/CashFlow.tsx` | Adicionar coluna "Faturado" + filtros |
| `src/pages/reports/Reports.tsx` | Nova tab de Relatório de Faturamento |
| `src/hooks/useCashFlow.ts` | Adicionar parâmetro de filtro por faturamento |

---

## Mensagens de Toast

**Quando fatura é gerada:**
```
"Pagamento confirmado! Fatura {número} emitida automaticamente."
```

**Quando não gera fatura:**
```
"Pagamento confirmado e registrado no Caixa (sem fatura fiscal)."
```

---

## Testes Recomendados

1. Confirmar pagamento via TRANSFERENCIA para BRUCKSCHEN_ES → verificar fatura gerada
2. Confirmar pagamento via PIX → verificar que NÃO gera fatura
3. Confirmar pagamento via PAYPAL → verificar que NÃO gera fatura
4. Verificar que Cash Flow mostra corretamente "Faturado" vs "Não Faturado"
5. Verificar relatório de faturamento com filtros
6. Verificar que número sequencial de fatura incrementa corretamente
7. Verificar que IVA é calculado corretamente (21%)

---

## Benefícios

- **Automação completa**: Zero intervenção manual para emitir faturas
- **Compliance fiscal**: Faturas apenas para recebimentos oficiais
- **Rastreabilidade**: Vinculação clara entre pagamento, fatura e Cash Flow
- **Relatórios**: Fácil distinção entre faturamento oficial e recebimentos informais
- **Controle mensal**: Recebimentos não faturados marcados com mês/ano

