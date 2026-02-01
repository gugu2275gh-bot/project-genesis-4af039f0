
# Plano: Corrigir Lógica de Registro de Mensagem WhatsApp nos Casos Técnicos

## Problema Identificado

Ao comparar o envio de WhatsApp entre **CRM Leads** e **Casos Técnicos**, identifiquei uma diferença na inserção de mensagens na tabela `mensagens_cliente`:

| Módulo | Código | Problema |
|--------|--------|----------|
| CRM Leads (`useLeadMessages.ts`) | Não passa `phone_id` | Correto |
| Casos Técnicos (`SendWhatsAppButton.tsx`) | Passa `phone_id: parseInt(phoneNumber, 10)` | Incorreto |

---

## Análise Técnica

### O que é `phone_id`?

A coluna `phone_id` na tabela `mensagens_cliente` é do tipo `bigint` e serve para correlacionar mensagens recebidas do webhook com o número de telefone do cliente. **Não deve ser preenchida manualmente** ao enviar mensagens pelo sistema.

### Código Atual (Incorreto)

```typescript
// SendWhatsAppButton.tsx - linha 342-347
await supabase.from('mensagens_cliente').insert({
  id_lead: leadId,
  phone_id: parseInt(phoneNumber, 10) || null,  // INCORRETO
  mensagem_IA: message,
  origem: 'SISTEMA',
});
```

### Código Correto (Como funciona no CRM Leads)

```typescript
// useLeadMessages.ts - linha 61-67
await supabase.from('mensagens_cliente').insert({
  id_lead: leadId,
  mensagem_IA: message,
  origem: 'SISTEMA',
});
// Sem phone_id - o campo é preenchido apenas por mensagens recebidas
```

---

## Alteração Proposta

### Arquivo: `src/components/cases/SendWhatsAppButton.tsx`

Remover a linha que insere `phone_id`:

**Antes:**
```typescript
await supabase.from('mensagens_cliente').insert({
  id_lead: leadId,
  phone_id: parseInt(phoneNumber, 10) || null,
  mensagem_IA: message,
  origem: 'SISTEMA',
});
```

**Depois:**
```typescript
await supabase.from('mensagens_cliente').insert({
  id_lead: leadId,
  mensagem_IA: message,
  origem: 'SISTEMA',
});
```

---

## Verificação de Dados

Os logs confirmam que ambos os envios funcionaram corretamente via Edge Function. O problema era apenas no registro local:

| ID | Origem | phone_id | Status |
|----|--------|----------|--------|
| 447 | CRM Leads | `null` | Correto |
| 446 | Casos Técnicos | `5.53193025099e+11` | Errado |

---

## Benefícios da Correção

- **Consistência**: Mesmo comportamento entre CRM e Casos Técnicos
- **Integridade de Dados**: `phone_id` mantido para uso correto (mensagens recebidas do webhook)
- **Evita Erros**: `parseInt` em números de telefone longos pode causar overflow ou perda de precisão
