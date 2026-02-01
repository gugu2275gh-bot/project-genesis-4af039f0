

# Plano: Corrigir Chamada da Edge Function WhatsApp nos Casos Técnicos

## Problema Identificado

A chamada da Edge Function nos Casos Técnicos está diferente do CRM Leads:

| Módulo | Código |
|--------|--------|
| CRM Leads | `numero: String(contactPhone)` |
| Casos Técnicos | `numero: phoneNumber` (processado com `.replace(/\D/g, '')`) |

## Diferenças Encontradas

### 1. Processamento do Número (Principal)

**CRM Leads (funciona):**
```typescript
numero: String(contactPhone)
```

**Casos Técnicos (não funciona):**
```typescript
const phoneNumber = String(phone).replace(/\D/g, '');
// ...
numero: phoneNumber
```

### 2. Ordem dos Campos no Body

**CRM Leads:**
```typescript
body: { 
  mensagem: message, 
  numero: String(contactPhone) 
}
```

**Casos Técnicos:**
```typescript
body: {
  numero: phoneNumber,
  mensagem: message,
}
```

---

## Solução Proposta

Modificar o `SendWhatsAppButton.tsx` para usar exatamente o mesmo padrão do CRM Leads:

### Arquivo: `src/components/cases/SendWhatsAppButton.tsx`

**Antes (linha 329-335):**
```typescript
const phoneNumber = String(phone).replace(/\D/g, '');
// ...
const { data, error } = await supabase.functions.invoke('send-whatsapp', {
  body: {
    numero: phoneNumber,
    mensagem: message,
  },
});
```

**Depois:**
```typescript
const { data, error } = await supabase.functions.invoke('send-whatsapp', {
  body: { 
    mensagem: message, 
    numero: String(phone)
  }
});
```

### Alterações:

1. Remover a variável `phoneNumber` e o processamento `.replace(/\D/g, '')`
2. Usar `String(phone)` diretamente como no CRM
3. Manter a mesma ordem de campos: `mensagem` primeiro, depois `numero`

---

## Por que isso pode resolver

O número no banco é armazenado como `bigint`. Quando convertemos para string:

- `String(553193025099)` → `"553193025099"` (correto)
- O `.replace(/\D/g, '')` não deveria alterar, mas pode haver algum comportamento edge case

Replicar exatamente o código que funciona elimina qualquer diferença potencial.

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/cases/SendWhatsAppButton.tsx` | Ajustar chamada da Edge Function para igualar ao CRM |

