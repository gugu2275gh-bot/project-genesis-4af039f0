
# Plano: Botão "Enviar Cobrança" na Tela de Pagamentos

## Objetivo

Adicionar um botão na tela de pagamentos que identifica pagamentos em atraso e envia automaticamente uma mensagem WhatsApp de cobrança para o cliente, usando a Edge Function `send-whatsapp` já existente.

---

## Como Funcionará

1. O usuário clica no botão "Enviar Cobrança" na linha do pagamento em atraso
2. O sistema busca o telefone do contato vinculado ao pagamento
3. Envia uma mensagem pré-definida via Edge Function `send-whatsapp`
4. Registra a mensagem na tabela `mensagens_cliente` para histórico
5. Mostra feedback de sucesso/erro ao usuário

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/usePayments.ts` | Adicionar mutation `sendCollectionMessage` para enviar WhatsApp |
| `src/pages/finance/PaymentsList.tsx` | Adicionar botão "Enviar Cobrança" na coluna de ações para pagamentos em atraso |

---

## Detalhes da Implementação

### 1. Hook usePayments.ts

Adicionar nova mutation que:
- Recebe o pagamento como parâmetro
- Busca o telefone do contato via `payment.opportunities.leads.contacts.phone`
- Busca o `lead_id` via `payment.opportunities.lead_id`
- Chama `supabase.functions.invoke('send-whatsapp', ...)` com a mensagem de cobrança
- Insere registro em `mensagens_cliente` para manter histórico

```typescript
const sendCollectionMessage = useMutation({
  mutationFn: async (payment: PaymentWithOpportunity) => {
    const phone = payment.opportunities?.leads?.contacts?.phone;
    const leadId = payment.opportunities?.lead_id;
    const clientName = payment.opportunities?.leads?.contacts?.full_name || 'Cliente';
    
    if (!phone) throw new Error('Telefone do contato não encontrado');
    
    const message = `Olá ${clientName}! Identificamos que seu pagamento está em atraso. Favor providenciar o mais rápido possível ou entre em contato com a CB Asesoria.`;
    
    // 1. Enviar WhatsApp via Edge Function
    const { error: webhookError } = await supabase.functions.invoke('send-whatsapp', {
      body: { mensagem: message, numero: String(phone) }
    });
    
    if (webhookError) throw webhookError;
    
    // 2. Registrar no histórico de mensagens (se tiver lead_id)
    if (leadId) {
      await supabase.from('mensagens_cliente').insert({
        id_lead: leadId,
        mensagem_IA: message,
        origem: 'SISTEMA',
      });
    }
    
    return { success: true };
  },
  onSuccess: () => {
    toast({ title: 'Cobrança enviada com sucesso!' });
  },
  onError: (error) => {
    toast({ title: 'Erro ao enviar cobrança', description: error.message, variant: 'destructive' });
  },
});
```

### 2. PaymentsList.tsx

Adicionar botão com ícone de WhatsApp na coluna de ações, visível apenas para pagamentos em atraso:

```tsx
import { MessageSquare } from 'lucide-react';

// Na coluna de ações, após os botões existentes para PENDENTE:
{getOverdueInfo(payment)?.isOverdue && (
  <Button 
    variant="ghost" 
    size="icon"
    onClick={(e) => {
      e.stopPropagation();
      sendCollectionMessage.mutate(payment);
    }}
    disabled={sendCollectionMessage.isPending}
    title="Enviar Cobrança WhatsApp"
    className="text-green-600 hover:text-green-700"
  >
    <MessageSquare className="h-4 w-4" />
  </Button>
)}
```

---

## Fluxo Visual

```text
+-------------------+     +--------------------+     +------------------+
| PaymentsList.tsx  | --> | usePayments.ts     | --> | send-whatsapp    |
| (botão cobrança)  |     | sendCollectionMsg  |     | Edge Function    |
+-------------------+     +--------------------+     +------------------+
                                    |
                                    v
                          +--------------------+
                          | mensagens_cliente  |
                          | (histórico)        |
                          +--------------------+
```

---

## Consideracoes

- A mensagem de cobranca e padronizada mas personalizada com o nome do cliente
- O botao so aparece para pagamentos em atraso (PENDENTE com due_date < hoje)
- A mensagem e registrada no historico do lead para rastreabilidade
- Usa a mesma Edge Function `send-whatsapp` que o LeadChat, mantendo consistencia
