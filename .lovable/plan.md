

# Plano: Remover Campo de Edição de Telefone do WhatsApp nos Casos Técnicos

## Objetivo

Modificar o componente `SendWhatsAppButton` para usar o telefone diretamente do banco de dados, sem exibir o campo de edição manual. Seguindo o mesmo padrão do envio de cobrança em Pagamentos.

---

## O que será alterado

### Componente `SendWhatsAppButton.tsx`

**Remover:**
- Estado `editedPhone` 
- `useEffect` que inicializa o número
- Função `getPhoneValidation`
- Todo o bloco JSX do campo de telefone (linhas 414-438)

**Manter:**
- Seleção de templates
- Preview da mensagem
- Botão de envio

**Modificar:**
- `handleSend`: usar diretamente `String(phone)` em vez de `editedPhone`
- Validação: apenas verificar se `phone` existe antes de enviar

---

## Código Atual vs. Novo

### Antes (com campo editável)

```typescript
// Estados
const [editedPhone, setEditedPhone] = useState<string>('');

// useEffect para inicializar
useEffect(() => {
  if (isOpen && phone) {
    setEditedPhone(String(phone).replace(/\D/g, ''));
  }
}, [isOpen, phone]);

// Validação complexa
const getPhoneValidation = (phoneStr: string) => { ... };
const phoneValidation = getPhoneValidation(editedPhone);

// handleSend usa editedPhone
const { error } = await supabase.functions.invoke('send-whatsapp', {
  body: { numero: editedPhone, mensagem: message }
});
```

### Depois (direto do banco)

```typescript
// Sem estados de edição de telefone
// Sem useEffect
// Sem validação complexa

// handleSend usa phone diretamente
const phoneNumber = String(phone).replace(/\D/g, '');
const { error } = await supabase.functions.invoke('send-whatsapp', {
  body: { numero: phoneNumber, mensagem: message }
});
```

---

## Visual Esperado

O dialog ficará simplificado:

```
┌─────────────────────────────────────────┐
│ Enviar WhatsApp para Breno Teste        │
├─────────────────────────────────────────┤
│                                         │
│ Template de Mensagem                    │
│ ┌─────────────────────────────────────┐ │
│ │ Contato Inicial                   ▼ │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Mensagem                                │
│ ┌─────────────────────────────────────┐ │
│ │ Olá Breno Teste! 👋                 │ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│                          [ Enviar ]     │
└─────────────────────────────────────────┘
```

Sem o campo de telefone - número vem direto do banco.

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/cases/SendWhatsAppButton.tsx` | Remover campo de edição de telefone e usar `phone` diretamente |

---

## Benefícios

- **Simplicidade**: Interface mais limpa sem campo desnecessário
- **Consistência**: Mesmo comportamento de Pagamentos
- **Menos erros**: Evita edição acidental do número
- **Confiabilidade**: Número sempre vem do banco de dados

