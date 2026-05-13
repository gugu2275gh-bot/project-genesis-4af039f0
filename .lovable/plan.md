## Diagnóstico

Cliente disse "hola" (espanhol). Bot respondeu em português.

`detectChatLanguage("hola")` retorna corretamente `"es"`. O problema é que a coluna `contacts.preferred_language` tem `DEFAULT 'pt'` no Postgres. Todo contato novo nasce com `'pt'` antes mesmo da detecção rodar. Como o lock implementado na conversa anterior respeita qualquer valor presente em `preferred_language`, ele travou em PT sem nunca olhar para "hola".

## Correção

Usar o flag `isFirstInteraction` (já calculado na linha 1147 de `index.ts`) como gatilho de detecção, em vez de checar se `preferred_language` está vazio.

### `supabase/functions/whatsapp-webhook/index.ts` (~linhas 1149-1167)

Substituir a lógica de lock atual por:

- **Se `isFirstInteraction === true`** → rodar `detectChatLanguage(currentCustomerMessage)` e persistir (sobrescreve o default `'pt'`). Esse é o único momento em que a detecção roda.
- **Senão (mensagens subsequentes)** → usar `contact.preferred_language` direto, sem reavaliar. Lock mantido.
- Se a 1ª mensagem não tiver texto (áudio/imagem antes do transcribe), cair no default `'pt-BR'` do detector e persistir — comportamento consistente com o resto do sistema.

### Reset do contato afetado

Para o lead atual (`a83c91f3-...`, contact `ea70de89-...`) o campo já foi gravado como `'pt'` pela lógica antiga — o lock vai mantê-lo em PT mesmo após o fix. Plano:

- Migration única: `UPDATE contacts SET preferred_language = NULL WHERE preferred_language = 'pt' AND id IN (SELECT contact_id FROM leads WHERE created_at >= now() - interval '24 hours')` para destravar contatos recentes que podem ter sido marcados incorretamente. (Opção alternativa: zerar só o contato em questão — confirmar com o usuário se quer reset amplo ou cirúrgico.)

### Não mexer

- Schema default `'pt'` da coluna fica como está (não quebra contatos legados criados sem detecção).
- `lib/language.ts` continua igual.

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/index.ts`
- 1 migration de reset (escopo a confirmar)

## Pergunta antes de implementar

O reset deve ser:
1. Apenas o contato atual (`ea70de89-...`)?
2. Todos contatos criados nas últimas 24h com `preferred_language='pt'`?
3. Nenhum reset (só corrigir daqui em diante; contatos atuais ficam como estão)?
