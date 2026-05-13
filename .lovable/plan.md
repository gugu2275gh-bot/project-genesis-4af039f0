## Objetivo
Garantir que o bot **sempre** complete todas as perguntas do ramo escolhido antes de emitir o pré-handoff (H1|||H2|||H3):
- `location_known='spain'` → bloco B (data entrada → empadronado yes/no → desde quando → cidade) → só então H1
- `location_known='outside'` → bloco A (idade → Europa 6m → familiar → remoto → formação) → só então H1

Sem isso, o LLM pode pular direto para H1 (caso Roberto: msgs 655→657 puladas a B5 "cidade").

## Mudanças

### 1. `lib/overrides.ts` — gate determinístico antes do pré-handoff
Nova função exportada `enforceBlockCompletion(aiResponse, language, flags)`:
- Detecta H1 no `aiResponse` (regex `PREHANDOFF_H1_RE` já existente).
- Se H1 presente **e** o bloco ainda não está completo segundo as flags persistidas (`location_known`, `entry_date_confirmed`, `empadronado_confirmed`, `empadronado_city`, e para o ramo A as flags equivalentes de idade/Europa/familiar/remoto/formação derivadas do transcript), **descarta o aiResponse inteiro** e retorna a próxima pergunta canônica do ramo, com `lock()`.
- Tabela de decisão para ramo B (`location_known='spain'`):
  - faltando `entry_date_confirmed` → "Qual foi a data exata da sua entrada na Espanha?"
  - faltando `empadronado_confirmed` → `getEmpadronadoQuestion`
  - `empadronado_confirmed=true` e faltando "desde quando" no transcript → `getEmpadronamientoSinceQuestion`
  - `empadronado_confirmed=true` e faltando `empadronado_city` → `getEmpadronamientoCityQuestion`
- Para ramo A (`location_known='outside'`): reusa `getOutsideSpainNextQuestion` que já é encadeada por transcript.

### 2. `lib/overrides.ts` — `forceAdvanceFromEmpadronadoQuestion`
- Trocar `wrap(...)` por `lock(replacement)` puro nos branches que forçam B5/B4 (linhas 432, 448, 455). Isso elimina o vazamento de H1 colado como "preâmbulo".
- Manter validação de cidade espanhola já travada com `lock()`.

### 3. `index.ts` — pipeline de overrides
Adicionar `enforceBlockCompletion` **logo após** `forceCorrectBlockForLocation` e **antes** de `stripPreambleBeforePreHandoff`, em todos os 3 pontos onde o pipeline roda (1982, 2014, 2044). Como `enforceBlockCompletion` aplica `lock()`, qualquer override posterior respeita.

### 4. Testes (`bpmn3_handoff_test.ts`)
Adicionar casos:
- Ramo B: prevQ="desde quando", cliente="05/02/2026", IA gera H1+H2+H3 puro → resultado deve ser apenas a pergunta de cidade.
- Ramo B: empadronado_city ausente, IA gera H1 → resultado é cidade.
- Ramo B: tudo preenchido → H1|||H2|||H3 passa intacto.
- Ramo A: faltando "formação superior", IA gera H1 → resultado é a pergunta canônica de formação.

## Fora de escopo
- BPMN, idiomas, latência, Msg5+Msg6, persistência de flags.
- Mudança no texto das perguntas existentes.
- Bug separado de roteamento Estudos vs Spain (não afeta este caso — Roberto está na Espanha, ramo B é o correto).

## Arquivos editados
- `supabase/functions/whatsapp-webhook/lib/overrides.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts`
