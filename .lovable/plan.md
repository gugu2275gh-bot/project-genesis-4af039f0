

# Fix: Sincronização de Status dos Templates WhatsApp com Twilio

## Problema Raiz Identificado

O bug está na Edge Function `submit-whatsapp-templates`. A resposta da API Twilio ApprovalRequests retorna:

```text
{
  "whatsapp": { "status": "approved", "rejection_reason": "" },
  "sid": "HX...",
  "account_sid": "AC..."
}
```

Mas o código espera um formato diferente (`data.data[0].status`). Como `data.data` é `undefined`, a lógica cai no fallback e define o status como `"unsubmitted"` — sobrescrevendo o status real dos templates que estão aprovados no Twilio.

Este mesmo bug existe em dois lugares:
1. **Ação `check_status`** (linha 320) — parsing errado da resposta
2. **Ação `sync_from_twilio`** (linha 435) — mesmo parsing errado

## Correção

### Arquivo: `supabase/functions/submit-whatsapp-templates/index.ts`

**1. Corrigir parsing em `check_status` (linhas 316-332)**

Substituir a lógica de parsing para usar `data.whatsapp?.status` em vez de `data.data?.[0]?.status`:

```typescript
let newStatus = template.status
let rejectionReason = null

// Twilio returns: { whatsapp: { status: "approved", rejection_reason: "..." } }
if (data.whatsapp && data.whatsapp.status) {
  const mappedStatus = data.whatsapp.status
  if (['approved', 'rejected', 'pending', 'paused', 'disabled', 'received', 'unsubmitted'].includes(mappedStatus)) {
    newStatus = mappedStatus
  }
  if (mappedStatus === 'rejected' && data.whatsapp.rejection_reason) {
    rejectionReason = data.whatsapp.rejection_reason
  }
} else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
  // Fallback: legacy array format (kept for safety)
  const approval = data.data[0]
  const mappedStatus = approval.status || 'unknown'
  if (['approved', 'rejected', 'pending', 'paused', 'disabled', 'received', 'unsubmitted'].includes(mappedStatus)) {
    newStatus = mappedStatus
  }
  if (mappedStatus === 'rejected') {
    rejectionReason = approval.rejection_reason || 'Rejected by Meta'
  }
} else if (response.ok) {
  newStatus = 'unsubmitted'
}
```

**2. Corrigir parsing em `sync_from_twilio` (linhas 435-444)**

Aplicar a mesma correção:

```typescript
if (approvalData.whatsapp && approvalData.whatsapp.status) {
  approvalStatus = approvalData.whatsapp.status
  rejectionReason = approvalData.whatsapp.rejection_reason || null
} else if (approvalData.data && Array.isArray(approvalData.data) && approvalData.data.length > 0) {
  approvalStatus = approvalData.data[0].status || 'unknown'
  rejectionReason = approvalData.data[0].rejection_reason || null
} else {
  approvalStatus = 'not_submitted'
}
```

### Resultado Esperado

Após deploy, ao clicar em "Verificar Status" ou "Sincronizar do Twilio" na tela de templates, os 12 templates serão corretamente atualizados para `approved` (ou `rejected` para os 2 que a Meta rejeitou) e automaticamente ativados (`is_active = true`).

