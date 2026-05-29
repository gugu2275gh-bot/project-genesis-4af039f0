## Problema (caso Pedro – screenshot)

Bot envia em ES:
1. 1:23 — "¿Cuál fue la fecha exacta de tu entrada en España?" + recordatório + sufixo pós-handoff.
2. Cliente: "15/03/2024".
3. 1:24 — Bot **repete** "¿Cuál fue la fecha exacta de tu entrada en España?".
4. Cliente: "15/03/2024" novamente.
5. Bot envia duas bolhas, ambas começando com "Perfecto.": "Perfecto. Ya tengo una visión inicial de tu caso." e "Perfecto. ¿Estás empadronado?".

## Por que o dedup atual não pegou

O `stripAlreadySentCanonicalBlocks` (criado na rodada anterior) compara cada parágrafo da nova resposta com **a mensagem anterior inteira** via Jaccard ≥ 0.8. No screenshot a mensagem anterior tinha 30+ palavras (pergunta + recordatório longo + sufixo pós-handoff). A repetição é só a pergunta curta (~9 palavras). Jaccard = inter/union ≈ 8/35 ≈ 0.23 → não dispara.

Além disso não há check de "pergunta canônica já feita" para a etapa B1 (entry date) — só existe para `interest`, `name`, `email`. E não há nenhuma defesa contra duas bolhas consecutivas com o mesmo opener ("Perfecto.").

## Solução (backend, edge function `whatsapp-webhook`)

### 1. Chunkar também o histórico no dedup
Em `lib/overrides.ts` → `stripAlreadySentCanonicalBlocks`:

- Para cada mensagem em `recentAssistantMessages`, dividir por `\n\n` e `|||` exatamente como fazemos com a nova resposta, e normalizar cada chunk.
- Construir `prevChunksNorm: string[]` plano com todos os chunks anteriores.
- Subir a comparação para esse conjunto: se `jaccard(pNorm, prevChunk) >= 0.8` para **qualquer** chunk anterior → echo, descarta.
- Adicionalmente: se `pNorm === prevChunk` (igualdade após normalização) → echo (cobre frases curtas com Jaccard baixo por falta de palavras > 3 chars).

### 2. Dedup por pergunta já feita
Mesma função:

- Extrair todas as substrings que terminam em `?` (ou `¿…?` em ES) da nova resposta e das mensagens anteriores recentes (últimas 3).
- Normalizar (`normalizeForLanguageChecks`).
- Se qualquer pergunta da resposta já apareceu (normalizada-igual ou via `areQuestionsEquivalent`) em uma das mensagens anteriores recentes → remover essa pergunta da resposta (split por sentenças, drop sentence).
- Se sobrar só "Perfecto."/"Certo." etc., usar o `nextPending` que já existe para anexar a próxima pergunta canônica do funil (incluindo B1 entry-date e B2 empadronado quando aplicável).

### 3. Próximo passo do funil para entry-date / empadronado
Estender o helper `nextPending` em `lockConfirmedFieldsInResponse` **e** o usado em `stripAlreadySentCanonicalBlocks` (pode virar export reutilizável `getNextPendingQuestion(language, funnelFlags)`):

- name → email → interest → location → **entry_date (B1)** → **empadronado yes/no (B2)** → etc.
- Receber flags extras: `entryDateKnown`, `empadronadoKnown` (vindos de `funnelStateLive`).
- Em `index.ts` passar essas flags na chamada de `stripAlreadySentCanonicalBlocks`.

### 4. Dedup de opener entre bolhas
Em `lib/overrides.ts`, adicionar `dedupOpenerAcrossBubbles(aiResponse, language)`:

- Splita em `|||`.
- Para cada parte ≥ 2, se a primeira palavra (case-insensitive, sem pontuação) for igual à primeira palavra da parte 1 (set de openers: `perfecto, perfeito, certo, ok, claro, vale, entendido, entendi, perfect, sure, parfait, d'accord, bien`), remove o opener da parte ≥ 2 mantendo o resto.
- Aplicar em `index.ts` entre `stripAlreadySentCanonicalBlocks` e o split final.

### 5. Testes (Deno)
Adicionar a `duplicate_block_strip_test.ts`:

- **Caso Pedro**: histórico com `["¿Cuál fue la fecha exacta de tu entrada en España?\n\nComo prometí... entrada en España, incluyendo día, mes y año, para poder continuar.\n\nEn breve uno de nuestros especialistas..."]`. Resposta nova = `"¿Cuál fue la fecha exacta de tu entrada en España?"`. Após dedup com `entryDateKnown=true`: resultado vazio ou trocado pela próxima pergunta pendente (B2 empadronado).
- **Caso opener**: aiResponse = `"Perfecto. Ya tengo una visión inicial de tu caso.|||Perfecto. ¿Estás empadronado?"` → segundo "Perfecto." removido.
- **Pergunta-equivalente**: histórico com pergunta de entry-date em PT; nova resposta com a mesma em ES (parafraseada) usando `areQuestionsEquivalent` → drop.

### 6. Deploy
Auto via Supabase.

## Fora de escopo

- Não vou refatorar o pipeline de overrides.
- Não vou mexer no extractor de `entry_date` (já funciona — `15/03/2024` é parseado).
- Sem mudanças de schema.
