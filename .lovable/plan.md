

## Plan: Trocar modelo para Gemini 1.5 Flash

Alterar o modelo de IA no webhook de WhatsApp de `gemini-2.5-flash-lite` para `gemini-1.5-flash`.

### Alterações

**Arquivo**: `supabase/functions/whatsapp-webhook/index.ts`

1. Substituir todas as referências ao modelo `gemini-2.5-flash-lite` por `gemini-1.5-flash` nas URLs da API do Gemini (tanto na função `generateAIResponse` quanto na classificação de setores).

2. Atualizar as mensagens de log que mencionam o nome do modelo para refletir "Gemini 1.5 Flash".

3. Redesployer a Edge Function `whatsapp-webhook`.

A chave `CBAsesoria_Key` continua sendo usada normalmente.

