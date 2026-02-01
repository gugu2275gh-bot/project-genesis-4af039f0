

# Plano: Diagnosticar e Corrigir Problema de Quebras de Linha no WhatsApp

## Problema Identificado

Através da análise dos logs da Edge Function, identifiquei que:

| Horário | Quebras de linha | WhatsApp |
|---------|-----------------|----------|
| 19:02:10 | Presentes (`\n`) | Chegou ✅ |
| 19:02:33 | Presentes (`\n`) | Chegou ✅ |
| 19:08:13 | Ausentes (espaços) | Não chegou ❌ |

A mensagem das **19:08:13 chegou na Edge Function SEM as quebras de linha** - elas foram substituídas por espaços duplos antes de sair do browser.

O código-fonte está correto, então isso sugere um problema de **cache do build** ou **versão antiga do código rodando no preview**.

---

## Solução em Duas Partes

### Parte 1: Adicionar Logging Detalhado

Para diagnosticar exatamente o que está acontecendo, vou adicionar um log que mostra a mensagem completa ANTES de enviar:

**Arquivo:** `src/components/cases/SendWhatsAppButton.tsx`

```typescript
console.log('[WhatsApp Cases] Iniciando envio:', { 
  phone,
  numero: String(phone),
  templateId: selectedTemplate,
  leadId,
  messagePreview: message.substring(0, 100), // Primeiros 100 chars
  hasNewlines: message.includes('\n'), // Verificar se tem quebras
  messageLength: message.length,
});
```

### Parte 2: Normalizar Quebras de Linha

Para garantir que as quebras de linha sejam preservadas mesmo em casos edge, vou adicionar uma normalização explícita:

```typescript
// Garantir que quebras de linha estão no formato correto
const normalizedMessage = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const { data, error } = await supabase.functions.invoke('send-whatsapp', {
  body: { 
    mensagem: normalizedMessage, 
    numero: String(phone) 
  },
});
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/cases/SendWhatsAppButton.tsx` | Adicionar logging detalhado e normalização de quebras de linha |

---

## Próximos Passos Após Implementação

1. Aguardar o preview recompilar completamente
2. Forçar refresh com Ctrl+Shift+R (hard reload)
3. Testar enviando o template "Contato Inicial"
4. Verificar no console se `hasNewlines: true`
5. Verificar nos logs da Edge Function se `\n` está presente

---

## Nota Importante

Se após essas alterações o problema persistir COM `hasNewlines: false` no console, isso confirmará que há um problema no **build/cache do Vite** que está corrompendo os template literals. Nesse caso, será necessário converter os templates para usar `\n` explícito em vez de quebras de linha literais.

