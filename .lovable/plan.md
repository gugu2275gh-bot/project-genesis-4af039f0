## Problema (do print)

Cliente, no meio do pré-handoff, mandou "Quero fazer um curso de idiomas" — não era resposta da pergunta corrente nem pergunta factual. O bot saiu do roteiro, deu uma explicação longa sobre cursos e só depois voltou para "¿Estás en España?". Comportamento esperado:

1. **Durante o pré-handoff**: qualquer mensagem que não seja resposta válida à pergunta atual deve ser **acolhida em uma frase curta** ("Anotado — vou tratar disso assim que terminarmos esse cadastro rapidíssimo") e **a pergunta pendente do roteiro deve ser repetida imediatamente** na mesma resposta.
2. **Após o pré-handoff (H1+H2+H3 enviados)**: o bot **automaticamente retoma TODAS as dúvidas/pedidos parqueados**, em ordem, respondendo cada uma com base na KB.

Hoje já existe `funnelStateLive.pending_question` (lib/funnel-state.ts) mas:
- Só guarda **1** pergunta (sobrescreve nunca — só salva se vazio).
- Só dispara para mensagens com `?` ou palavras interrogativas. **Não pega pedidos** como "Quero fazer um curso de idiomas".
- Confia no LLM para dizer "Anotado..." (a IA pode ignorar e improvisar).
- Ao consumir, só usa como query de KB — pode misturar com a mensagem atual e perder a ordem.

## Solução

### 1. Schema — fila de off-topics (migração)

Adicionar coluna `pending_questions jsonb` em `lead_funnel_state` (default `'[]'::jsonb`). Manter a coluna `pending_question` legada por compatibilidade, mas migrar leitura/escrita para a fila.

Item da fila:
```json
{ "text": "Quero fazer um curso de idiomas", "ts": "2026-05-15T09:54:00Z", "kind": "request" | "question" }
```

### 2. Detecção determinística de off-topic (`lib/offtopic.ts`)

Nova função `classifyOffTopic(currentMessage, lastAssistantQuestion, funnelStateLive)`:
- Se mensagem **é resposta válida** à `lastAssistantQuestion` (reusa heurísticas existentes: `isStructuredQuestionAnswer`, `isPotentialInterestAnswer`, `isPotentialEntryDateAnswer`, `isLikelyFullNameAnswer`, `hasValidEmail`, `isNeverBeenToSpainAnswer`, número para idade, sim/não para europa/familiar/remoto/formação/empadronado, cidade espanhola, data) → `null`.
- Se é **recusa** tratada por `isNameRefusal` / `isEmailRefusal` → `null` (já tem guard).
- Senão classifica `kind`:
  - `question` se contém `?` ou palavras interrogativas (regra atual).
  - `request` se começa com "quero", "queria", "preciso", "gostaria", "me interessa", "tenho dúvida", "quiero", "necesito", "me gustaría", "I want", "I need", "I'd like", "je veux", "j'aimerais", etc.
  - `other` para o resto (descartado, segue fluxo).

### 3. Park determinístico durante o pré-handoff

Em `index.ts` (área 1845–1875), substituir o bloco `pending_question` por:

```text
if (collectionGateActive) {
  const off = classifyOffTopic(rawCustomerMessage, lastAssistantQuestion, funnelStateLive)
  if (off && (off.kind === 'question' || off.kind === 'request')) {
    queue.push({ text: rawCustomerMessage, ts: now, kind: off.kind })
    persist queue → lead_funnel_state.pending_questions
    // FORÇA resposta = acolhimento + próxima pergunta do roteiro (BYPASS do LLM)
    aiResponseClean = LOCKED(`${ackPhrase(language)}\n\n${nextStep.scriptQuestion(language)}`)
  }
}
```

`ackPhrase` localizado em `lib/questions.ts`:
- pt: "Anotado! Vou tratar desse ponto assim que terminarmos esse cadastro rapidíssimo."
- es: "¡Anotado! Trataré ese punto en cuanto terminemos este registro rapidísimo."
- en: "Noted! I'll cover that as soon as we finish this quick intake."
- fr: "Noté ! Je traiterai ce point dès que nous aurons terminé ce bref questionnaire."

`nextStep.scriptQuestion(language)` reaproveita os getters existentes (`getEmailQuestion`, `getOutsideSpainAgeQuestion`, `getLocationQuestion`, `getEmpadronamientoCityQuestion`, etc.) selecionando pela próxima etapa do gate (steps já calculadas em `index.ts`). Se a etapa for o próprio H1/H2/H3 → emite o payload do pré-handoff.

Garantia: como o response é **lockado** com `LOCKED_SENTINEL`, todos os overrides downstream (`enforceBlockCompletion`, `forceReask*`, anti-loop) respeitam e não reescrevem.

### 4. Replay automático pós-pré-handoff

Imediatamente após persistir `pre_handoff_sent=true` (área 2244–2257 em `index.ts`), se `pending_questions.length > 0`:

1. Drena a fila **na ordem FIFO**.
2. Para cada item, gera 1 resposta via Gemini com prompt curto de KB:
   ```
   Como prometido, sobre "<text>": <resposta breve da KB no idioma travado>.
   ```
3. Envia como **bolhas separadas** via `sendWhatsAppMessage` (mesmo loop do split por `|||`), com 350 ms entre bolhas.
4. Após cada envio bem-sucedido, remove o item da fila e persiste (idempotência: se Twilio falhar, item permanece).
5. Sufixo pós-handoff (`getPostHandoffWaitSuffix`) é anexado **apenas à última** bolha do replay para não duplicar.
6. Se um item depender de KB vazia → usa `kbStrictFallback` (já existe).

Implementação como função separada `replayParkedQuestions(supabase, ctx, queue)` em `lib/parking.ts` para manter `index.ts` limpo.

### 5. Persistência defensiva

- `pending_questions` capped em 10 itens (LRU drop dos mais antigos) para evitar spam.
- Cada `text` truncado a 500 chars antes de salvar.
- Drenagem é transacional por item: lê → responde → remove. Falha de envio mantém o item.

### 6. Testes (`offtopic_park_replay_test.ts`)

- `classifyOffTopic`:
  - Resposta válida à pergunta de idade ("32") → `null`.
  - Pedido "Quero fazer um curso de idiomas" durante pergunta de localização → `request`.
  - Pergunta "Quanto custa?" durante pergunta de email → `question`.
  - Resposta "Sim" para "Você está na Espanha?" → `null`.
  - Recusas pt/es/en/fr → `null` (delegadas aos guards de nome/email).
- Park flow: enfileira ao detectar off-topic, response forçada = ack + próxima pergunta do roteiro.
- Replay: fila com 3 itens → 3 bolhas após `pre_handoff_sent=true`, na ordem; sufixo pós-handoff só na última.
- Idempotência: se Twilio "falhar" no item 2, item 2 permanece na fila e itens 1/3 não duplicam.
- Multi-idioma: ackPhrase correto em es/en/fr.

## Critérios de aceite

- Off-topics durante pré-handoff sempre recebem ack curto + próxima pergunta do roteiro, sem alucinação.
- Nenhuma off-topic é perdida — todas viram itens da fila.
- Após H3, todas as dúvidas parqueadas são respondidas em ordem antes do bot voltar ao modo normal pós-handoff.
- Validações de nome/email do guard anterior continuam intactas.
- Suíte existente (151) verde + ~10 novos testes.

## Notas técnicas

- Migração SQL: `ALTER TABLE lead_funnel_state ADD COLUMN pending_questions jsonb NOT NULL DEFAULT '[]'::jsonb;`
- Sem mudança no prompt do LLM para o caso off-topic — resposta é 100% determinística (LOCKED).
- Replay usa o mesmo loop de envio/log já existente (mensagens_cliente + interactions).
- Idiomas: pt, es, en, fr.
