
# Plano: Corrigir Envio de WhatsApp no SendWhatsAppButton

## Problema Raiz Identificado

Ao comparar as 3 implementações que enviam WhatsApp:

| Componente | Funciona? | Código |
|------------|-----------|--------|
| `sendCollectionMessage` (Pagamentos) | ✅ | `numero: String(phone)` |
| `useLeadMessages` (CRM Lead Chat) | ✅ | `numero: String(contactPhone)` |
| `SendWhatsAppButton` (Casos Técnicos) | ❌ | `numero: phone.toString()` |

A diferença é que o `phone` no `SendWhatsAppButton` é do tipo `number | null` (bigint convertido para number pelo Supabase), e quando convertido para string via `.toString()`, números muito grandes como `553193025099` podem aparecer em **notação científica** (`5.53193025099e+11`).

Além disso, no componente atual:
1. Não há validação do formato do número antes do envio
2. Não há console.log para debug
3. O usuário não tem feedback visual sobre problemas com o número

---

## Solução Proposta

### 1. Corrigir conversão do número (SendWhatsAppButton.tsx)

Alterar de:
```typescript
numero: phone.toString(),
```

Para:
```typescript
numero: String(phone).replace(/\D/g, ''),
```

Isso garante:
- Conversão consistente com os outros componentes que funcionam
- Remoção de qualquer caractere não-numérico (espaços, hífen, etc.)
- Evita problema de notação científica

### 2. Adicionar validação visual do número

Adicionar um indicador visual quando o número parecer suspeito:
- Menos de 10 dígitos: ⚠️ Número muito curto
- Mais de 15 dígitos: ⚠️ Número muito longo
- Botão "Corrigir" com 1 clique (conforme preferência do usuário)

### 3. Permitir edição do número antes do envio

Adicionar um campo de texto editável no modal para que o usuário possa corrigir o número antes de enviar, caso necessário.

### 4. Adicionar console.log para debug

Incluir logs detalhados para facilitar debugging futuro:
```typescript
console.log('[WhatsApp Cases] Enviando:', { 
  phoneOriginal: phone, 
  phoneFormatted: cleanedPhone,
  templateId: selectedTemplate 
});
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/cases/SendWhatsAppButton.tsx` | Corrigir conversão, adicionar validação visual e campo editável |

---

## Alterações Detalhadas

### SendWhatsAppButton.tsx

1. **Adicionar estado para número editável**:
```typescript
const [editedPhone, setEditedPhone] = useState<string>('');
```

2. **Inicializar o número quando o modal abre**:
```typescript
useEffect(() => {
  if (isOpen && phone) {
    setEditedPhone(String(phone).replace(/\D/g, ''));
  }
}, [isOpen, phone]);
```

3. **Validar formato do número**:
```typescript
const getPhoneValidation = (phoneStr: string) => {
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length < 10) return { valid: false, message: 'Número muito curto' };
  if (digits.length > 15) return { valid: false, message: 'Número muito longo' };
  return { valid: true, message: null };
};
```

4. **Exibir campo editável com validação visual**:
```tsx
<div className="space-y-2">
  <Label>Número WhatsApp</Label>
  <div className="flex gap-2">
    <Input
      value={editedPhone}
      onChange={(e) => setEditedPhone(e.target.value.replace(/\D/g, ''))}
      className={cn(!phoneValidation.valid && 'border-yellow-500')}
    />
  </div>
  {!phoneValidation.valid && (
    <p className="text-xs text-yellow-600">⚠️ {phoneValidation.message}</p>
  )}
</div>
```

5. **Usar o número editado no envio**:
```typescript
const { error } = await supabase.functions.invoke('send-whatsapp', {
  body: {
    numero: editedPhone, // Usa o número editado/validado
    mensagem: message,
  },
});
```

---

## Fluxo Corrigido

```text
                        Modal Aberto
                             │
                             ▼
              ┌──────────────────────────────────┐
              │  📱 Número: 553193025099         │
              │  [Campo editável com validação]   │
              │                                   │
              │  ⚠️ Número muito curto (se <10)   │
              │     [Sugerir correção]            │
              │                                   │
              │  Template: Contato Inicial ▼      │
              │                                   │
              │  [Mensagem pré-visualizada]       │
              │                                   │
              │           [Enviar]                │
              └──────────────────────────────────┘
                             │
                             ▼
              console.log('[WhatsApp Cases] Enviando...')
                             │
                             ▼
              Edge Function send-whatsapp
              { numero: "553193025099", mensagem: "..." }
                             │
                             ▼
              Webhook n8n → WhatsApp ✅
```

---

## Resultado Esperado

1. O número será sempre enviado no formato correto (string numérica pura)
2. O usuário pode verificar e editar o número antes de enviar
3. Validação visual alerta sobre números suspeitos
4. Console.log facilita debug em caso de problemas futuros
5. Comportamento idêntico aos componentes que já funcionam (Pagamentos, CRM)
