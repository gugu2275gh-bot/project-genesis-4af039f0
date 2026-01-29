
# Plano: Corrigir Registro de Mensagens no SendWhatsAppButton

## Problema Identificado

O componente `SendWhatsAppButton.tsx` está funcionando corretamente para **enviar** a mensagem (o webhook retorna 200), mas o registro no banco está incorreto:

| Componente | Campo usado | Funciona? |
|------------|-------------|-----------|
| LeadChat (CRM) | `id_lead: leadId` | ✅ Sim |
| SendWhatsAppButton (Cases) | `phone_id: phone` | ❌ Não (falta `id_lead`) |

A mensagem é salva na tabela `mensagens_cliente` sem associar ao lead, então ela não aparece no histórico.

---

## Diferença de Código

**LeadChat (linha 61-67 do useLeadMessages):**
```typescript
.insert({
  id_lead: leadId,        // ✅ Associa ao lead
  mensagem_IA: message,
  origem: 'SISTEMA',
})
```

**SendWhatsAppButton (linha 212-216):**
```typescript
.insert({
  phone_id: phone,        // ❌ Só grava telefone, sem id_lead
  mensagem_IA: message,
  origem: 'SISTEMA',
})
```

---

## Correção Necessária

### 1. Adicionar `leadId` como prop no SendWhatsAppButton

O componente precisa receber o `leadId` para poder associar a mensagem corretamente:

```typescript
interface SendWhatsAppButtonProps {
  phone: number | null;
  clientName: string;
  leadId?: string | null;  // 👈 NOVO: para associar mensagem
  // ... restante das props
}
```

### 2. Corrigir o insert na tabela mensagens_cliente

```typescript
await supabase.from('mensagens_cliente').insert({
  id_lead: leadId,           // 👈 ADICIONAR
  phone_id: phone,
  mensagem_IA: message,
  origem: 'SISTEMA',
});
```

### 3. Passar o leadId do CaseDetail.tsx

No `CaseDetail.tsx`, o `leadId` está disponível via:
```typescript
serviceCase?.opportunities?.leads?.id
```

Precisamos passar isso para o `SendWhatsAppButton`:
```typescript
<SendWhatsAppButton
  phone={contact?.phone}
  clientName={contact?.full_name}
  leadId={serviceCase?.opportunities?.leads?.id}  // 👈 ADICIONAR
  // ... outras props
/>
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/cases/SendWhatsAppButton.tsx` | Adicionar prop `leadId` e incluir no insert |
| `src/pages/cases/CaseDetail.tsx` | Passar `leadId` para o componente |

---

## Fluxo Corrigido

```text
SendWhatsAppButton
        │
        ├─► 1. Chamar Edge Function send-whatsapp
        │       (envia para webhook n8n → WhatsApp)
        │
        └─► 2. Salvar em mensagens_cliente
                {
                  id_lead: "uuid-do-lead",    ✅ NOVO
                  phone_id: 553193025099,
                  mensagem_IA: "mensagem...",
                  origem: "SISTEMA"
                }
```

---

## Resultado Esperado

1. A mensagem será enviada via WhatsApp (já funciona)
2. A mensagem será salva no banco com o `id_lead` correto
3. A mensagem aparecerá no histórico do chat do lead no CRM
4. Rastreabilidade completa entre Cases e mensagens
