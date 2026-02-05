
# Plano: Melhorar Apresentação de Mensagens com Botões WhatsApp

## Problema Identificado

Mensagens do WhatsApp que contêm botões de quick reply (NativeFlowMessage) estão sendo exibidas como JSON bruto no chat, tornando a leitura confusa.

**Exemplo do JSON atual:**
```json
{"NativeFlowMessage":{"buttons":[{"name":"quick_reply","buttonParamsJSON":"{\"id\":\"a\",\"display_text\":\"Visto Estudante\"...}
```

---

## Solução Proposta

Criar uma função de parsing que detecta mensagens com estrutura de botões WhatsApp e exibe de forma amigável:

1. **Detectar** se a mensagem é um JSON de NativeFlowMessage
2. **Extrair** o texto principal (`body.text`) e a opção selecionada (`selectedIndex`)
3. **Renderizar** de forma elegante, mostrando apenas a opção escolhida pelo cliente

---

## Resultado Visual

**Antes:**
```
{"NativeFlowMessage":{"buttons":[{"name":"quick_reply"...
```

**Depois:**
```
📋 Escolha o assunto:
✅ Visto Estudante
```

---

## Implementação Técnica

Vou adicionar uma função `parseWhatsAppMessage` no componente `LeadChat.tsx` que:

```typescript
// Detecta e parseia mensagens de botões WhatsApp
function parseWhatsAppMessage(content: string) {
  try {
    // Tenta fazer parse do JSON
    const parsed = JSON.parse(content);
    
    if (parsed.NativeFlowMessage) {
      const { buttons, body, selectedIndex } = parsed.NativeFlowMessage;
      const bodyText = body?.text || 'Opções:';
      
      // Extrai os display_text de cada botão
      const options = buttons?.map(btn => {
        const params = JSON.parse(btn.buttonParamsJSON);
        return params.display_text;
      }) || [];
      
      return {
        isFlowMessage: true,
        bodyText,
        options,
        selectedIndex,
        selectedOption: options[selectedIndex] || null
      };
    }
  } catch {
    // Não é JSON, retorna null
  }
  return null;
}
```

A renderização será condicional:

```tsx
{(() => {
  const flowData = parseWhatsAppMessage(msg.content);
  if (flowData) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">{flowData.bodyText}</p>
        <div className="flex items-center gap-2 bg-white/50 rounded px-2 py-1">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm">{flowData.selectedOption}</span>
        </div>
      </div>
    );
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>;
})()}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/crm/LeadChat.tsx` | Adicionar função de parsing e renderização condicional |

---

## Benefícios

- ✅ Mensagens de botões ficam legíveis
- ✅ Mostra claramente a opção selecionada pelo cliente
- ✅ Mantém compatibilidade com mensagens normais de texto
- ✅ Visual consistente com o restante do chat
