## Auditoria do agente vs `CB_pre-handoff_v2-4.bpm`

Estrutura canônica extraída do diagrama (Bizagi):

```text
Início → Msg1-2 → Msg3 (nome) → Msg4 (email) → Msg5 (interesse) → Msg6 (serviços) → Msg7 (localização)
        ├─ Sim → B1 confirmar situação → B2 data entrada → B3 empadronado? → B4 desde quando → B5 cidade
        └─ Não → A1 confirmar cenário → A2 idade → A3 Europa 6m → A4 familiar EU → A5 remoto → A6 formação
                             ↓
                       Msg H1+H2 pré-handoff → Msg H3 encaminhar → Fim (humano)
```

### Status atual (4 critérios pedidos)

| # | Critério | Status | Observação |
|---|----------|--------|------------|
| 1 | Pergunta feita não pode ser repetida | ⚠️ Parcial | `isLikelyQuestionLoop` só compara última↔próxima; LLM pode pular para uma pergunta feita 3 turnos atrás sem ser barrado. |
| 2 | Idioma travado no de início | ✅ OK | `contacts.preferred_language` gravado na 1ª msg e lido sempre depois (index.ts 1176-1194). Pequeno hardening sugerido no fallback. |
| 3 | Campos respondidos gravados | ⚠️ Parcial | Persistidos: nome, email, interesse, location, entry_date, empadronado, cidade, pre_handoff_sent, handoff_sent. **Faltando**: A2 idade, A3 Europa, A4 familiar, A5 remoto, A6 formação (coluna `outside_spain_progress` jsonb existe mas nunca é populada). Toda a sequência A depende de regex no transcript — frágil a paráfrase/truncamento. |
| 4 | Sequência correta | ✅ Após o gate `enforceBlockCompletion` do turno anterior, ramo B é seguro até H1. Ramo A continua dependendo só do transcript regex. |

### Outros achados

- **B1 e A1** (confirmar situação/cenário) estão embutidos como preâmbulo de B2 e A2. Funciona, mas se o LLM resumir o preâmbulo o cliente pode pular B1/A1 sem confirmação explícita.
- Coluna `outside_spain_progress` (jsonb) está declarada e inicializada `{}`, mas nenhum código a lê ou escreve.
- Não há controle determinístico para "Msg5+Msg6 já enviadas" além de regex em transcript — pode repetir o catálogo se a IA reabrir.

## Plano de correção

### 1. Persistir respostas do ramo A em `outside_spain_progress`
Em `lib/funnel-state.ts` adicionar tipo `OutsideProgress`:
```ts
{ a1_scenario_confirmed?: boolean, a2_age?: string, a3_europe_6m?: 'yes'|'no',
  a4_eu_family?: 'yes'|'no', a5_remote?: 'yes'|'no', a6_higher_ed?: 'yes'|'no' }
```
- Em `lib/overrides.ts` criar `extractOutsideProgressPatch(previousQuestion, currentMessage)` que detecta yes/no/idade pela pergunta anterior e devolve o campo correspondente.
- Em `index.ts`, depois de aplicar `computeDeterministicFunnelPatch`, mesclar o patch novo no `outside_spain_progress` via `applyTurnUpdates`.
- Atualizar `getOutsideSpainNextQuestion` para preferir os flags persistidos (com fallback ao transcript regex existente).

### 2. Estender `enforceBlockCompletion` ao ramo A com flags persistidas
Hoje o gate do ramo A reusa o transcript. Trocar por:
```text
if !a2_age           → A2
else if !a3_europe_6m → A3
else if !a4_eu_family → A4
else if !a5_remote   → A5
else if !a6_higher_ed→ A6
else                 → libera H1
```
A B-branch já está coberta — só ajustar para usar `outside_spain_progress` no A.

### 3. Anti-repetição global de perguntas canônicas
Em `lib/overrides.ts`, nova `preventRepeatedCanonicalQuestion(aiResponse, transcript, language, flags)`:
- Cataloga as 11 perguntas (A1-A6, B1-B5, Msg7 localização, Msg5+6 interesse) por tokens-âncora multi-idioma (regex já existentes, ex.: `isQuestionAboutSpainEntryDate`, `isEmpadronamientoCityQuestion`, etc.).
- Se a IA emite uma pergunta cujo token-âncora **já consta no transcript**, substitui pela próxima pergunta canônica do bloco (chama `enforceBlockCompletion` ou `getOutsideSpainNextQuestion`).
- Plugar no pipeline em `index.ts` logo antes de `stripPreambleBeforePreHandoff` nos 3 sites.

### 4. Hardening de idioma
- Em `index.ts:1189-1194` (fallback para contato legado): se `preferred_language` está null **mas** existem mensagens anteriores do cliente, detectar a partir da **primeira** mensagem do cliente, não da atual. Evita troca de idioma quando cliente envia "ok" curto em outro contexto.

### 5. Tornar B1/A1 idempotentes
- Adicionar flags `b1_situation_sent` e `a1_scenario_sent` em `outside_spain_progress` (ou novas colunas booleanas, mais barato manter no jsonb).
- `forceCorrectBlockForLocation` já injeta o preâmbulo "Perfeito. Agora preciso entender…" antes de B2; marcar a flag quando emitido. Em rounds seguintes, omitir o preâmbulo.

### 6. Testes
- `outside_progress_test.ts` (novo): extração yes/no por pergunta âncora; persistência via patch; gate A com flags persistidas.
- `bpmn3_handoff_test.ts`: caso "IA repete B2 após B5 ter sido feita" → bloqueado pela `preventRepeatedCanonicalQuestion`.
- `funnel_persistence_test.ts`: confirmar que `outside_spain_progress` mescla sem regredir flags.

## Fora de escopo
- Mudança de texto das perguntas (mantém o atual em PT/ES/EN/FR).
- Migração de schema (uso o jsonb `outside_spain_progress` que já existe).
- Latência, prompt da IA, BPMN, Twilio.

## Arquivos editados
- `supabase/functions/whatsapp-webhook/lib/funnel-state.ts` (tipo + applyTurnUpdates jsonb merge)
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (extractOutsideProgressPatch, preventRepeatedCanonicalQuestion, gate A reescrito)
- `supabase/functions/whatsapp-webhook/lib/questions.ts` (`getOutsideSpainNextQuestion` lê flags)
- `supabase/functions/whatsapp-webhook/index.ts` (pipeline + idioma fallback)
- `supabase/functions/whatsapp-webhook/outside_progress_test.ts` (novo)
- `supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts` (novos casos)
