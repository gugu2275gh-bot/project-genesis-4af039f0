
# Plano: Ajustes Avançados no Módulo Financeiro

## Resumo Executivo

Este plano implementa funcionalidades avançadas de gestão financeira conforme solicitado:

1. **Prorrogação de Data de Pagamento** - Alterar vencimento de parcela específica
2. **Reparcelamento (Reescalonar Parcelas)** - Dividir saldo em mais parcelas  
3. **Registro Manual de Acordos** - Histórico de observações no contrato
4. **Recibos com Aprovação** - Fluxo de aprovação antes de disponibilizar ao cliente

---

## Análise do Estado Atual

### Funcionalidades Já Existentes

| Funcionalidade | Status | Detalhes |
|----------------|--------|----------|
| Prorrogação (RescheduleDialog) | Parcial | Altera `due_date` e guarda `rescheduled_reason`, mas não envia notificação WhatsApp |
| Reparcelamento (RefinanceDialog) | Existe | Cancela parcelas antigas e cria novas, mas acesso não está visível na UI |
| Recibos | Parcial | Geração manual por botão, sem aprovação nem armazenamento |
| Notas de Acordo | Não existe | Precisamos criar tabela e componente |

### Campos Existentes na Tabela `payments`

```
- original_due_date: date (preserva data original)
- rescheduled_at: timestamptz (quando foi alterado)
- rescheduled_reason: text (motivo da alteração)
- receipt_url: text (URL do recibo)
- receipt_available_in_portal: boolean (se cliente pode ver)
```

---

## 1. Melhorar Prorrogação de Data de Pagamento

### Problema Atual
- O `RescheduleDialog.tsx` já funciona, mas:
  - Não envia notificação WhatsApp ao cliente
  - O botão de prorrogação está visível apenas na lista de pagamentos

### Alterações Necessárias

**Arquivo: `src/components/payments/RescheduleDialog.tsx`**

Adicionar envio de WhatsApp após prorrogação:

```typescript
if (notifyClient) {
  const phone = payment.opportunities?.leads?.contacts?.phone;
  if (phone) {
    const message = `Olá ${clientName}! 📅 Sua parcela de €${payment.amount.toFixed(2)} foi prorrogada. Nova data de vencimento: ${format(newDueDate, "dd/MM/yyyy")}. Qualquer dúvida, estamos à disposição.`;
    
    await fetch('https://webhook.robertobarros.ai/webhook/enviamsgccse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: message, numero: String(phone).replace(/\D/g, '') })
    });
  }
}
```

---

## 2. Melhorar Reparcelamento (Acesso e UX)

### Problema Atual
- `RefinanceDialog.tsx` existe mas:
  - Não há botão visível na UI para acioná-lo
  - Parcelas canceladas não ficam claramente marcadas

### Alterações Necessárias

**Arquivo: `src/pages/finance/PaymentsList.tsx`**

Adicionar botão de "Reparcelar" quando há múltiplas parcelas pendentes do mesmo contrato:

```typescript
// Após o botão de prorrogação
{payment.status === 'PENDENTE' && payment.contract_id && (
  <Button 
    variant="ghost" 
    size="icon"
    onClick={(e) => {
      e.stopPropagation();
      setSelectedContractId(payment.contract_id);
      setShowRefinanceDialog(true);
    }}
    title="Reparcelar"
  >
    <RefreshCw className="h-4 w-4" />
  </Button>
)}
```

**Migration SQL**: Adicionar campo para marcar parcelas reparceladas

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS 
  refinanced_status text CHECK (refinanced_status IN ('ORIGINAL', 'CANCELLED_FOR_REFINANCE', 'REFINANCED'));
```

---

## 3. Registro Manual de Acordos (Nova Funcionalidade)

### Nova Tabela: `contract_notes`

```sql
CREATE TABLE public.contract_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  note text NOT NULL,
  note_type text DEFAULT 'ACORDO' CHECK (note_type IN ('ACORDO', 'OBSERVACAO', 'HISTORICO')),
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Índice
CREATE INDEX idx_contract_notes_contract_id ON contract_notes(contract_id);

-- RLS
ALTER TABLE contract_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view contract notes" ON contract_notes
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'FINANCEIRO', 'JURIDICO', 'ATENCAO_CLIENTE', 'TECNICO']::app_role[]));

CREATE POLICY "Finance and Legal can manage notes" ON contract_notes
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'FINANCEIRO', 'JURIDICO']::app_role[]));
```

### Novo Hook: `src/hooks/useContractNotes.ts`

```typescript
export function useContractNotes(contractId: string | undefined) {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['contract-notes', contractId],
    queryFn: async () => { /* fetch notes */ },
    enabled: !!contractId,
  });

  const addNote = useMutation({
    mutationFn: async (note: { text: string; type: string }) => { /* insert note */ },
  });

  return { notes, isLoading, addNote };
}
```

### Novo Componente: `src/components/contracts/ContractNotesSection.tsx`

Componente visual para exibir e adicionar notas de acordo no contrato:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  📋 HISTÓRICO DE ACORDOS                         [+ Adicionar Nota] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔄 ACORDO - 10/10/2025 - Ana Silva                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Parcelamento reajustado: 2ª parcela dividida em duas de       │  │
│  │ €375,00 com vencimentos em 15/11 e 15/12.                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  📝 OBSERVAÇÃO - 05/10/2025 - João Costa                             │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Cliente solicitou 5 dias de prorrogação na 1ª parcela devido  │  │
│  │ a atraso na transferência bancária internacional.             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Integração no `ContractDetail.tsx`

Adicionar o componente na aba de pagamentos ou como seção separada.

---

## 4. Sistema de Recibos com Aprovação

### Nova Estrutura

Adicionar campos na tabela `payments`:

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_by uuid REFERENCES public.profiles(id);
```

### Fluxo de Recibos

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       FLUXO DE RECIBOS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PAGAMENTO CONFIRMADO                                            │
│        │                                                            │
│        ▼                                                            │
│  2. RECIBO GERADO AUTOMATICAMENTE                                   │
│     - receipt_number = "REC-2026-XXXXXX"                            │
│     - receipt_generated_at = now()                                  │
│     - receipt_url = blob URL (ou storage)                           │
│     - receipt_available_in_portal = FALSE                           │
│        │                                                            │
│        ▼                                                            │
│  3. FINANCEIRO REVISA NA LISTA DE PAGAMENTOS                        │
│     - Botão "Aprovar Recibo" ✓                                      │
│     - Pode gerar manualmente se necessário                          │
│        │                                                            │
│        ▼                                                            │
│  4. RECIBO APROVADO                                                 │
│     - receipt_approved_at = now()                                   │
│     - receipt_approved_by = user.id                                 │
│     - receipt_available_in_portal = TRUE                            │
│        │                                                            │
│        ▼                                                            │
│  5. CLIENTE VÊ NO PORTAL                                            │
│     - Botão "Ver Recibo" aparece apenas se approved                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Alterações no `PaymentsList.tsx`

**Novo estado de recibo na tabela:**

```typescript
{
  key: 'receipt',
  header: 'Recibo',
  cell: (payment) => {
    if (payment.status !== 'CONFIRMADO') return '-';
    
    if (payment.receipt_approved_at) {
      return (
        <Badge variant="success">
          <FileCheck className="h-3 w-3 mr-1" />
          Aprovado
        </Badge>
      );
    }
    
    if (payment.receipt_generated_at) {
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3 mr-1" />
          Aguardando
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline">Não gerado</Badge>
    );
  }
}
```

**Botões de ação para recibos:**

```typescript
{payment.status === 'CONFIRMADO' && (
  <div className="flex gap-1">
    {/* Gerar Recibo Manualmente */}
    {!payment.receipt_number && (
      <Button variant="ghost" size="icon" onClick={() => generateAndSaveReceipt(payment)} title="Gerar Recibo">
        <FileText className="h-4 w-4" />
      </Button>
    )}
    
    {/* Aprovar Recibo */}
    {payment.receipt_number && !payment.receipt_approved_at && (
      <Button variant="ghost" size="icon" onClick={() => approveReceipt(payment.id)} title="Aprovar Recibo">
        <Check className="h-4 w-4 text-success" />
      </Button>
    )}
    
    {/* Download Recibo */}
    {payment.receipt_approved_at && (
      <Button variant="ghost" size="icon" onClick={() => downloadReceipt(payment)} title="Baixar Recibo">
        <Download className="h-4 w-4" />
      </Button>
    )}
  </div>
)}
```

### Alterações no `PortalPayments.tsx`

Mostrar botão "Ver Recibo" apenas se aprovado:

```typescript
{status === 'CONFIRMADO' && payment.receipt_available_in_portal && (
  <Button variant="outline" size="sm" onClick={() => downloadReceipt(...)}>
    <Receipt className="h-4 w-4 mr-2" />
    Ver Recibo
  </Button>
)}
```

### Novo Hook: `src/hooks/useReceipts.ts`

```typescript
export function useReceipts() {
  const generateReceipt = useMutation({
    mutationFn: async (paymentId: string) => {
      // 1. Gerar número sequencial
      // 2. Criar PDF
      // 3. Upload para storage
      // 4. Atualizar payment com receipt_url e receipt_number
    }
  });

  const approveReceipt = useMutation({
    mutationFn: async (paymentId: string) => {
      // Atualizar payment com receipt_approved_at e receipt_available_in_portal = true
    }
  });

  return { generateReceipt, approveReceipt };
}
```

---

## Resumo das Alterações

### Migrations SQL

```sql
-- 1. Tabela de notas de contrato
CREATE TABLE public.contract_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  note text NOT NULL,
  note_type text DEFAULT 'ACORDO' CHECK (note_type IN ('ACORDO', 'OBSERVACAO', 'HISTORICO')),
  created_by_user_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_contract_notes_contract_id ON contract_notes(contract_id);
ALTER TABLE contract_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view contract notes" ON contract_notes
  FOR SELECT USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'MANAGER', 'FINANCEIRO', 'JURIDICO', 'ATENCAO_CLIENTE', 'TECNICO']::app_role[]));

CREATE POLICY "Finance and Legal can manage notes" ON contract_notes
  FOR ALL USING (has_any_role(auth.uid(), ARRAY['ADMIN', 'FINANCEIRO', 'JURIDICO']::app_role[]));

-- 2. Campos de recibo na tabela payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_generated_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_approved_by uuid REFERENCES public.profiles(id);

-- 3. Campo para status de reparcelamento
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refinanced_status text 
  CHECK (refinanced_status IN ('ORIGINAL', 'CANCELLED_FOR_REFINANCE', 'REFINANCED'));
```

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/hooks/useContractNotes.ts` | Hook para gerenciar notas de acordo |
| `src/hooks/useReceipts.ts` | Hook para gerar e aprovar recibos |
| `src/components/contracts/ContractNotesSection.tsx` | Componente de histórico de acordos |

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/payments/RescheduleDialog.tsx` | Adicionar envio de WhatsApp |
| `src/components/payments/RefinanceDialog.tsx` | Marcar parcelas com `refinanced_status` |
| `src/pages/finance/PaymentsList.tsx` | Coluna de recibos + botões de reparcelamento |
| `src/pages/contracts/ContractDetail.tsx` | Adicionar `ContractNotesSection` |
| `src/pages/portal/PortalPayments.tsx` | Condicionar exibição de recibo à aprovação |
| `src/hooks/usePayments.ts` | Gerar recibo automático ao confirmar pagamento |
| `src/lib/generate-receipt.ts` | Persistir PDF no storage |
| `src/integrations/supabase/types.ts` | Regenerado automaticamente |

---

## Seção Técnica: Geração Automática de Recibo

Ao confirmar pagamento no `usePayments.ts`:

```typescript
// Após confirmar pagamento com sucesso
const receiptNumber = `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

// Gerar blob do PDF
const receiptBlob = generateReceipt({
  receiptNumber,
  clientName,
  amount: payment.amount,
  // ...outros campos
});

// Upload para storage
const filePath = `receipts/${payment.id}/${receiptNumber}.pdf`;
await supabase.storage.from('client-documents').upload(filePath, receiptBlob);

// Atualizar payment
await supabase.from('payments').update({
  receipt_number: receiptNumber,
  receipt_url: filePath,
  receipt_generated_at: new Date().toISOString(),
  receipt_available_in_portal: false, // Aguarda aprovação
}).eq('id', payment.id);
```

---

## Fluxo Visual Completo

```text
PRORROGAÇÃO:
Cliente pede → Financeiro abre RescheduleDialog → Seleciona nova data 
→ Salva motivo → Envia WhatsApp → Lembretes SLA recalibrados

REPARCELAMENTO:
Saldo pendente → Financeiro abre RefinanceDialog → Define nº parcelas 
→ Preview mostrado → Confirma → Parcelas antigas CANCELLED → Novas criadas
→ Nota registrada automaticamente no contrato

RECIBOS:
Pagamento confirmado → Recibo gerado (storage) → Status "Aguardando"
→ Financeiro revisa → Aprova → receipt_available_in_portal = TRUE
→ Cliente vê no portal
```
