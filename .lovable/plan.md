# Bug: bot pulou B5 após "sim" ao empadronamento

## O que aconteceu

Sequência real (lead `51b2…3f`):
1. Bot: "Perfeito. Você está empadronado?" (B3 reduzida — sem "se sim, desde quando")
2. Cliente: "sim"
3. Bot: "Perfeito! Me conta com calma: o que você busca hoje? …" ← **voltou para INTERESSE**

Estado do funil: `step=interesse`, `location_known=spain`, `empadronado_confirmed=null`. As regex do roteiro classificam o `aprofundamento` como **não concluído** (faltava B5 "em qual cidade…empadronad"), mas a IA, livre, escolheu reemitir a pergunta de interesse em vez de seguir a instrução `(B5)`.

## Causa raiz

Não existe override determinístico entre B3 (empadronado?) e B5 (cidade) — toda a transição depende do LLM obedecer `aprofundamentoInstruction`. Quando ele desvia, nada corrige. Além disso, `getEmpadronadoQuestion` envia apenas o yes/no, sem o "se sim, desde quando", então a B4 (data) também depende exclusivamente do LLM.

## Correção

### 1. `lib/questions.ts`

Reescrever `getEmpadronadoQuestion` para incluir B3+B4 numa só pergunta natural:
- PT: "Perfeito. Você está empadronado? Se sim, desde quando?"
- ES/EN/FR equivalentes.

Criar `getEmpadronamientoCityQuestion(language)`:
- PT: "Perfeito. Em qual cidade você está empadronado?"
- ES/EN/FR equivalentes.

### 2. `lib/overrides.ts`

Adicionar `forceAdvanceFromEmpadronadoQuestion(previous, current, ai, language)`:
- Detecta que a `previousQuestion` é a pergunta de empadronado (regex `empadronad/`).
- Se o cliente respondeu **sim** (`isYesAnswer`) e a `aiResponse` não pergunta cidade → substitui a última pergunta da IA por `getEmpadronamientoCityQuestion`.
- Se o cliente respondeu **não** (`isNoAnswer`) → libera o LLM para avançar ao Pré-Handoff (não força nada).
- Se o cliente respondeu sim + já incluiu cidade no texto → também avança para Pré-Handoff (não re-pergunta).

Helpers auxiliares: `isYesAnswer` / `isNoAnswer` cobrindo `sim|si|sí|yes|claro|estou|aham` e negações comuns nos 4 idiomas.

### 3. `index.ts`

Logo após o bloco que chama `forceAdvanceFromEntryDateQuestion`, encadear `forceAdvanceFromEmpadronadoQuestion` com a mesma assinatura (previousAssistantMessage, currentMessage, aiResponse, language).

Manter o detector `askedCidade` da etapa 6 (B5) — agora ele baterá quando o override emitir a pergunta de cidade.

### 4. Persistência (opcional, sem bloquear)

Em `lib/extract.ts` o LLM já extrai `empadronamiento_city` e `empadronamiento_since`. Garantir que esses campos, quando vierem populados, sejam gravados em `lead_funnel_state.empadronado_confirmed=true` (e idealmente em colunas próprias se existirem) para que B5 não seja re-perguntada em sessões futuras.

## Validação

1. Reproduzir o cenário do print: pergunta de empadronado → cliente diz "sim" → confirmar que o próximo turno é "Em qual cidade você está empadronado?".
2. Variante: cliente responde "sim, desde 2023 em Madrid" → bot avança direto para Pré-Handoff (não re-pergunta).
3. Variante: cliente responde "não" → bot avança para Pré-Handoff.
4. Adicionar testes unitários em `funnel_persistence_test.ts` cobrindo as três variantes.

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/lib/overrides.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/funnel_persistence_test.ts` (testes)

## Deploy

Redeploy `whatsapp-webhook`.
