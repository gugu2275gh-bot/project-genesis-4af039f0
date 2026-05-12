## Objetivo
Quando o cliente envia um áudio no WhatsApp, o agente deve receber o **texto transcrito** como se fosse a mensagem do cliente e continuar a conversa normalmente — sem responder a um placeholder `[audio]`.

## Diagnóstico
- A função `transcribe-audio` já existe, é chamada automaticamente em `whatsapp-webhook/index.ts` (linhas 674–701) e atualiza `mensagens_cliente.mensagem_cliente` com o texto.
- **Mas** o agente é alimentado por `messageForAI = message.body || getMediaPlaceholder(...)` (linha 1376) e por `interactions.content`/`displayBody` (linhas 655, 660), que ficam como `"[audio]"`. A transcrição nunca é injetada no prompt da IA daquele turno.
- Resultado: o LLM vê `[audio]` e responde sem contexto, perdendo o conteúdo da fala.

## Mudanças (apenas em `supabase/functions/whatsapp-webhook/index.ts` e teste)

1. **Capturar a transcrição como variável**
   - No bloco "AUTO-TRANSCRIBE AUDIO/PTT" (linhas 674–701): guardar `transcribedText` a partir de `transcribeResult.transcription` quando a resposta for OK e o texto não for `[áudio inaudível]`.
   - Manter o `await` (já é) para que esteja disponível antes da geração da resposta.

2. **Persistir a transcrição nos registros do turno atual**
   - `displayBody`: se houver `transcribedText`, usar `🎙️ {transcrição}` (mantém indicação visual de que veio de áudio).
   - `interactions.content` (linha 655): mesmo tratamento.
   - `mensagens_cliente.mensagem_cliente` já é atualizado pela própria função `transcribe-audio` via `messageId`; ok.

3. **Alimentar o agente com a transcrição**
   - Substituir `message.body` efetivo por uma variável `effectiveBody = transcribedText || message.body || ''` no início do fluxo (logo após o bloco de transcrição).
   - Usar `effectiveBody` em:
     - `messageForAI` fallback (linha 1376) → `effectiveBody || getMediaPlaceholder(...)`.
     - `currentCustomerMessage` (linha 1127).
     - `extractNameAndEmail` (linha 1315) e `extractAndSuggestContactData` (linha 1338) — assim nome/e-mail ditados em áudio também são capturados.
     - Roteamento multichat / detecção de mensagem genérica (`clientMessage`, linha 730).
   - **Não** alterar `message.body` original em logs de baixo nível para preservar payload Twilio.

4. **Buffer de mensagens não respondidas**
   - O buffer (linhas 1364–1377) já lê `mensagem_cliente` do banco, que conterá a transcrição (a função `transcribe-audio` faz update antes do AI rodar). Verificar ordem: garantir que o `await` da transcrição ocorre **antes** da query do buffer (já ocorre, pois transcrição é em ~675 e buffer ~1364). Sem mudança extra.

5. **Idioma**
   - O prompt de `transcribe-audio` mantém o idioma original do falante. Nenhuma mudança necessária; a detecção de idioma do agente continua funcionando sobre o texto transcrito.

6. **Falhas de transcrição**
   - Se transcrição falhar ou retornar `[áudio inaudível]`: manter comportamento atual (placeholder `[audio]`) para o agente pedir que o cliente repita por texto. Não bloquear o fluxo.

7. **Teste**
   - Adicionar caso em `handler_test.ts` (ou novo arquivo) simulando payload com `MediaContentType0=audio/ogg` e mock de `transcribe-audio` retornando `"Quero saber sobre nacionalidade"`, verificando que o `messageForAI` enviado ao LLM contém esse texto e não `[audio]`.

## Arquivos a editar
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/*_test.ts` (novo teste)

## Validação
- Rodar `supabase--test_edge_functions` na função `whatsapp-webhook`.
- Em produção: enviar áudio de teste e verificar nos logs: `Auto-transcription completed: ...` seguido de `messageForAI` contendo o texto transcrito, e a resposta da IA coerente com o conteúdo falado.
