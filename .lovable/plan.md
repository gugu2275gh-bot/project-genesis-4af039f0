# Liberar KB no Pré-Handoff e responder pergunta pendente

## Problema

No exemplo do print:
1. Bot enviou as 2 frases do **Pré-Handoff** ("Já consigo ter uma visão inicial do seu caso." + "Na CB analisamos cada caso de forma individual…").
2. Cliente perguntou "o que é autorização de regresso?".
3. Bot respondeu "Ótima pergunta, te explico assim que terminarmos esse rapidíssimo levantamento." — adiando uma pergunta legítima de KB.

Causa raiz: em `supabase/functions/whatsapp-webhook/index.ts` (linhas 1749–1766), o gate de coleta (`collectionGateActive`) só cai quando TODAS as 7 etapas estão `done`. A detecção das sub-etapas de **APROFUNDAMENTO** (A1–A6 / B1–B5) usa regex sobre as mensagens já enviadas — se a IA reformulou alguma frase, a etapa permanece pendente e a KB nunca é liberada, mesmo o agente já tendo enviado o Pré-Handoff (que por definição significa "cadastro concluído").

## Correção

### 1. Pré-Handoff é o sinal definitivo de fim de cadastro

Em `whatsapp-webhook/index.ts`, logo após calcular `preHandoffDone` (linha 1750–1751), forçar:

```ts
if (preHandoffDone) {
  // Pré-Handoff já enviado → cadastro concluído por definição.
  // Marca todas as etapas anteriores como done para liberar a KB.
  for (const s of steps) s.done = true
}
```

Isso garante que `nextStep` fica `undefined`, `flowComplete = true`, `collectionGateActive = false`, e a KB é consultada no mesmo turno (via `getKnowledgeBaseContext` na linha 1807).

### 2. Consumir `pending_question` mesmo quando a pergunta atual é nova

O bloco de linhas 1786–1793 só recupera `pending_question` se o gate caiu. Com a correção acima isso já passa a funcionar. Manter a lógica como está, apenas validar que a query da KB inclui tanto `pending_question` quanto a mensagem atual (já está em `kbQueryParts`).

### 3. Reforçar instrução do modo tira-dúvidas

No bloco `if (!handoffDone)` (linha 1836+), adicionar regra explícita:

> "Se o cliente fez uma pergunta factual (o que é X, como funciona Y, prazos, valores) e há `pending_question` ou a mensagem atual contém '?', RESPONDA AGORA usando a KB. NÃO use mais a frase 'assim que terminarmos esse rapidíssimo levantamento' — o levantamento já acabou."

### 4. Backfill defensivo do funnel state

Quando `preHandoffDone` é detectado e `funnelStateLive.step !== 'livre'`, marcar `step = 'livre'` no `lead_funnel_state` para consistência futura (não bloqueia, é só housekeeping).

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/index.ts` — fix do gate + reforço da instrução tira-dúvidas.

## Deploy

- Redeploy `whatsapp-webhook`.

## Validação

- Reproduzir o cenário do print: enviar mensagens até o Pré-Handoff, fazer pergunta factual ("o que é autorização de regresso?"), confirmar que a resposta vem da KB no mesmo turno.
- Verificar logs `[GATE] flow complete — KB liberada` aparecendo após o Pré-Handoff.
