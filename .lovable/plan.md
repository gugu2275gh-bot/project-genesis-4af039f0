
# Plano: Corrigir Navegação de Alertas de Pagamento e Implementar Notificações WhatsApp SLA

## Problema Identificado

### 1. Navegação incorreta dos alertas de pagamento
No componente `SLAMonitoringPanel.tsx`, a função `getBreachRoute` para pagamentos retorna `/payments`, mas a rota correta é `/finance` (onde está a página `PaymentsList.tsx`).

### 2. Notificações WhatsApp de pagamento via Edge Function
A Edge Function `sla-automations` já tem a lógica de enviar WhatsApp para lembretes de pagamento, mas:
- A tabela `payment_reminders` tem uma constraint que limita os tipos de lembrete a `'D1', 'D3', 'D7', 'CANCELLED'`
- A função tenta inserir tipos como `'PRE_7D'`, `'PRE_48H'`, `'DUE_TODAY'`, `'POST_D1'`, `'POST_D3'`, `'POST_D7'`
- O envio de WhatsApp precisa funcionar corretamente pelo webhook configurado

---

## Alterações Necessárias

### 1. Corrigir navegação no `SLAMonitoringPanel.tsx`

Alterar a rota de `/payments` para `/finance`:

```typescript
const getBreachRoute = (breach: SLABreachItem): string => {
  switch (breach.type) {
    case 'lead':
      return breach.relatedId ? `/crm/leads/${breach.relatedId}` : '/crm/leads';
    case 'contract':
      return breach.relatedId ? `/contracts/${breach.relatedId}` : '/contracts';
    case 'payment':
      return '/finance';  // Já estava correto, mas vamos adicionar deep-link
    // ...
  }
};
```

Para navegação específica ao contrato relacionado ao pagamento, podemos melhorar passando o `contract_id` no breach:

```typescript
case 'payment':
  // Se tiver relatedId (opportunity_id), navegar para contratos ou finance
  return '/finance';
```

---

### 2. Migration SQL - Expandir tipos de lembrete na tabela `payment_reminders`

```sql
-- Remover constraint existente
ALTER TABLE public.payment_reminders 
DROP CONSTRAINT IF EXISTS payment_reminders_reminder_type_check;

-- Adicionar nova constraint com todos os tipos necessários
ALTER TABLE public.payment_reminders 
ADD CONSTRAINT payment_reminders_reminder_type_check 
CHECK (reminder_type IN (
  'D1', 'D3', 'D7', 'CANCELLED',
  'PRE_7D', 'PRE_48H', 'DUE_TODAY',
  'POST_D1', 'POST_D3', 'POST_D7'
));
```

---

### 3. Atualizar Edge Function `sla-automations` para enviar WhatsApp diretamente

A função `sendWhatsApp` atual dentro de `sla-automations` chama `supabase.functions.invoke('send-whatsapp')`, que requer autenticação. Como `sla-automations` roda via cron (sem contexto de usuário), precisamos fazer o envio direto para o webhook N8N:

```typescript
// Helper to send WhatsApp directly (no auth needed for cron jobs)
async function sendWhatsApp(phone: string | number, message: string) {
  try {
    const WEBHOOK_URL = 'https://webhook.robertobarros.ai/webhook/enviamsgccse';
    const phoneStr = String(phone).replace(/\D/g, '');
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: message, numero: phoneStr })
    });
    
    if (!response.ok) {
      console.error('WhatsApp webhook error:', await response.text());
      return false;
    }
    
    console.log('WhatsApp sent successfully to:', phoneStr.slice(-4));
    return true;
  } catch (e) {
    console.error('WhatsApp send failed:', e);
    return false;
  }
}
```

---

### 4. Adicionar Registro de Mensagens na Tabela `mensagens_cliente`

Para manter histórico das mensagens de SLA na mesma estrutura usada pelo CRM, adicionar inserção na tabela `mensagens_cliente` após cada envio de WhatsApp bem-sucedido:

```typescript
// Após enviar WhatsApp com sucesso, registrar na tabela de mensagens
if (leadId) {
  await supabase.from('mensagens_cliente').insert({
    id_lead: leadId,
    mensagem_IA: message,
    origem: 'SISTEMA',
  });
}
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/SLAMonitoringPanel.tsx` | Corrigir rota de pagamentos para `/finance` |
| `supabase/migrations/` | Nova migration para expandir CHECK constraint em `payment_reminders` |
| `supabase/functions/sla-automations/index.ts` | Enviar WhatsApp direto ao webhook + registrar mensagens em `mensagens_cliente` |

---

## Fluxo de Notificação de Pagamento (Visual)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CRON JOB (cada 15 min)                              │
│                                  │                                          │
│                                  ▼                                          │
│                     sla-automations Edge Function                           │
│                                  │                                          │
│         ┌────────────────────────┼────────────────────────┐                 │
│         ▼                        ▼                        ▼                 │
│    [PRE-DUE]               [DUE TODAY]              [POST-DUE]              │
│    D-7, D-2                    D0                  D+1, D+3, D+7            │
│         │                        │                        │                 │
│         └────────────────────────┼────────────────────────┘                 │
│                                  │                                          │
│                                  ▼                                          │
│              ┌─────────────────────────────────────┐                        │
│              │  Verifica se reminder já foi enviado │                        │
│              │  (payment_reminders table)          │                        │
│              └─────────────────────────────────────┘                        │
│                                  │                                          │
│                     Se não enviado ainda:                                   │
│                                  │                                          │
│         ┌────────────────────────┼────────────────────────┐                 │
│         ▼                        ▼                        ▼                 │
│  Insere reminder          Envia WhatsApp           Registra em              │
│  em payment_reminders     direto ao Webhook        mensagens_cliente        │
│                                                    (origem: SISTEMA)        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Templates de Mensagem (já configurados)

| Tipo | Template |
|------|----------|
| PRE_7D | "Olá {nome}! 📅 Sua parcela de €{valor} vence em 7 dias ({data}). Lembre-se de efetuar o pagamento." |
| PRE_48H | "Olá {nome}! ⏰ Sua parcela de €{valor} vence em 2 dias ({data}). Por favor, efetue o pagamento." |
| DUE_TODAY | "Olá {nome}! 🔔 Hoje vence sua parcela de €{valor}. Efetue o pagamento até o final do dia." |
| POST_D1/D3 | "Olá {nome}! Você tem um pagamento de €{valor} em atraso. Regularize para evitar cancelamento." |

---

## Seção Técnica

### Detalhes da Implementação

1. **Correção da rota**: Simples alteração de string no switch case

2. **Migration SQL**: 
   - DROP constraint existente
   - ADD nova constraint com valores expandidos
   - Não afeta dados existentes

3. **Edge Function**:
   - Substituir chamada a `supabase.functions.invoke('send-whatsapp')` por fetch direto
   - Adicionar inserção em `mensagens_cliente` para manter histórico
   - Buscar `lead_id` através da cadeia: `payment -> opportunity -> lead`

4. **Integração com Chat CRM**:
   - Mensagens enviadas pelo SLA automation aparecerão no chat do lead com `origem: 'SISTEMA'`
   - Label exibido será "Atendente" conforme lógica existente no LeadChat
