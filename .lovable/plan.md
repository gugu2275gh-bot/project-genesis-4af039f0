## Problema

O bot perguntou o nome do Gustavo **3 vezes** porque:

1. 1ª resposta foi um email → corretamente rejeitada como nome.
2. 2ª resposta ("Gustavo", 1 palavra) → rejeitada por `isLikelyFullNameAnswer()`, mas o bot **não insistiu explicitamente** por nome completo: agradeceu "Ótimo, Gustavo!" e foi para o interesse.
3. Como `name_confirmed` continuou `false`, a cada turno seguinte o gate volta para a etapa "nome" e o bot **re-pergunta**.

## Regras desejadas

1. **Nome completo é obrigatório (≥ 2 palavras alfabéticas).** Se cliente mandar só uma palavra, o bot **insiste educadamente** na MESMA etapa, sem avançar e sem fingir que aceitou.
2. **Assim que vier ≥ 2 palavras válidas:** gravar imediatamente em `contacts.full_name` + `name_source='USER_CONFIRMED'`, marcar `funnel_state.name_confirmed=true`, e **NUNCA mais perguntar nome** nesta conversa.
3. **Mesmo número/contato voltando depois:** se `name_source ∈ {USER_CONFIRMED, STAFF_EDITED}`, o novo lead já nasce com `name_confirmed=true` (já existe via `isContactNameTrustworthy`, vamos reforçar).

## Mudanças

### 1. Manter validação estrita (≥ 2 palavras) em `lib/name-extraction.ts`
Mantém `isLikelyFullNameAnswer` como está (já exige `alphaWords.length >= 2`). Não relaxar.

### 2. Resposta determinística quando cliente manda só 1 palavra
Em `supabase/functions/whatsapp-webhook/index.ts`, no bloco que detecta resposta à pergunta de nome:

- Se a última pergunta do bot foi sobre nome completo E `messageForAI` tem 1 só palavra alfabética (não é email, data, etc.):
  - **Não** agradecer/avançar.
  - Substituir a próxima resposta da IA por uma **reask explícita**: "Obrigado! Para seguir, preciso do seu **nome e sobrenome** (nome completo). Pode me enviar?"
  - Implementar via novo helper em `lib/overrides.ts` → `forceReaskFullNameIfSingleWord(prevQuestion, currentMsg, aiResponse, language)`.

### 3. Trava firme após nome capturado
No mesmo arquivo, quando `isLikelyFullNameAnswer(messageForAI) === true` e a pergunta anterior foi sobre nome:

- Atualizar `contacts.full_name` + `name_source='USER_CONFIRMED'` (já faz).
- **Sincronizar imediatamente `funnel_state.name_confirmed=true`** antes do gate (já faz via `syncFunnelFromCapturedData`).
- Em `lib/overrides.ts > lockConfirmedFieldsInResponse`, adicionar regra: **se em qualquer ponto do histórico o assistant já fez `isQuestionAboutFullName` E `nameKnown===true`**, qualquer nova pergunta sobre nome na resposta da IA é substituída pela próxima etapa pendente. Rede de segurança contra loop.

### 4. Reuso entre atendimentos do mesmo número
Já funciona via `isContactNameTrustworthy()` em `loadFunnelState`. Reforçar:
- Em `applyTurnUpdates`, **nunca permitir downgrade** de `name_confirmed: true → false`.
- Adicionar log `[NAME_REUSE]` quando contato vem de lead anterior com nome confiável.

### 5. Hotfix do Gustavo (lead atual `9b82823b...`)
Migration única para destravar a conversa em curso:
- `contacts.full_name = 'Gustavo'`, `name_source = 'USER_CONFIRMED'` no contato `4c2ed246-212e-431b-8f38-622b59fe810c` (cliente já se identificou; staff aceita "Gustavo" como nome válido manualmente).
- `lead_funnel_state`: `name_confirmed=true`, `email_confirmed=true`, `interest_confirmed='VISTO_ESTUDANTE'`, `step='localizacao'`.

(Atenção: pelas regras novas, "Gustavo" sozinho NÃO seria aceito automaticamente — o hotfix é manual porque a conversa atual já passou por loop e queremos destravar sem pedir mais nada redundante.)

### 6. Testes
Em `supabase/functions/whatsapp-webhook/index_test.ts`:
- "bot perguntou nome → cliente respondeu 'Gustavo' (1 palavra) → IA deve **re-perguntar nome completo**, não avançar".
- "bot perguntou nome → cliente respondeu 'Gustavo Silva' → IA deve **avançar para email**, gravar nome, e em turnos seguintes nunca mais perguntar nome".
- "contato com `name_source='USER_CONFIRMED'` em lead novo → `loadFunnelState` retorna `name_confirmed=true`".

## Resultado

- 1 palavra → bot insiste UMA vez de forma clara ("nome e sobrenome, por favor").
- 2+ palavras → grava e sela. Nunca mais pergunta no lead atual nem em leads futuros do mesmo número.
- Loop atual do Gustavo destravado pelo hotfix.

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/index.ts` — lógica de detecção pós-pergunta-de-nome.
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` — `forceReaskFullNameIfSingleWord` + endurecer `lockConfirmedFieldsInResponse`.
- `supabase/functions/whatsapp-webhook/lib/funnel-state.ts` — guard contra downgrade de `name_confirmed`.
- `supabase/functions/whatsapp-webhook/index_test.ts` — novos testes.
- Nova migration de hotfix para Gustavo.
