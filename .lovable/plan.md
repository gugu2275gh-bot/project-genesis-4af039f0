

## Melhorar Parser de Mensagens WhatsApp

### Problema Identificado
A mensagem exibida está em formato JSON bruto porque o parser atual (`parseWhatsAppFlowMessage`) só reconhece o formato `NativeFlowMessage`. O formato recebido é diferente - é um array de botões de quick reply diretamente.

### Formatos de Mensagem Suportados Atualmente
- `{ NativeFlowMessage: { buttons, body, selectedIndex } }`

### Novos Formatos a Suportar
1. **Array de botões com quick_reply** (formato da imagem)
2. **Objeto com buttons e body no root** 
3. **Lista de opções com selectedIndex**

### Solução Proposta

Expandir a função `parseWhatsAppFlowMessage` para detectar e formatar múltiplos tipos de mensagens interativas do WhatsApp:

**Antes (JSON bruto):**
```
{"id":"a","display_text":"Visto Estudante","disabled":false},...
```

**Depois (formatado):**
```
📋 Escolha o assunto:
• Visto Estudante
• Visto Trabalho  
• Reagrupamento
• Renovação Residência ✓ (selecionado)
• Nacionalidade Residência
...
```

### Arquivo a Modificar
- `src/components/crm/LeadChat.tsx`

### Detalhes Técnicos

A função `parseWhatsAppFlowMessage` será expandida para:

```typescript
function parseWhatsAppFlowMessage(content: string) {
  try {
    const parsed = JSON.parse(content);
    
    // Formato 1: NativeFlowMessage (existente)
    if (parsed.NativeFlowMessage) {
      // ... código existente
    }
    
    // Formato 2: Array de botões com buttonParamsJSON
    if (Array.isArray(parsed)) {
      const options = parsed
        .filter(item => item.buttonParamsJSON || item.display_text)
        .map(item => {
          if (item.buttonParamsJSON) {
            try {
              const params = JSON.parse(item.buttonParamsJSON);
              return params.display_text;
            } catch { return null; }
          }
          return item.display_text;
        })
        .filter(Boolean);
      
      if (options.length > 0) {
        return { isFlowMessage: true, bodyText: 'Opções:', options, selectedIndex: null, selectedOption: null };
      }
    }
    
    // Formato 3: Objeto com body.text e botões/buttons
    if (parsed.body?.text || parsed.buttons) {
      const bodyText = parsed.body?.text || 'Opções:';
      const buttons = parsed.buttons || [];
      const options = buttons.map(btn => {
        if (btn.buttonParamsJSON) {
          try { return JSON.parse(btn.buttonParamsJSON).display_text; }
          catch { return btn.display_text || null; }
        }
        return btn.display_text || null;
      }).filter(Boolean);
      
      const selectedIndex = parsed.selectedIndex;
      return {
        isFlowMessage: true,
        bodyText,
        options,
        selectedIndex,
        selectedOption: typeof selectedIndex === 'number' ? options[selectedIndex] : null
      };
    }
    
  } catch {
    // Não é JSON
  }
  return null;
}
```

### Renderização Melhorada

As opções serão exibidas como lista formatada:
- Cada opção em uma linha separada com bullet point
- Opção selecionada destacada com ícone de check
- Texto do body como título

### Resultado Visual Esperado

```
📋 Escolha o assunto:
  ○ Visto Estudante
  ○ Visto Trabalho
  ○ Reagrupamento
  ✓ Renovação Residência (destacado)
  ○ Nacionalidade Residência
  ○ Nacionalidade Casamento
  ○ Outro
```

