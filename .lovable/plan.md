
## O que aconteceu (diagnóstico em tempo real)

Conversa do Roberto (`lead_id 5f56496d-…`):

```
10:26  bot  → catálogo (¿Tu caso encaja en alguno de estos?)
10:27  user → "Sí, ya tengo 2 años en España y quiero solicitar mi residencia"
10:27  bot  → ¿Estás en España?          ← OK
10:27  user → "Sí"
10:27  bot  → ¿Estás en España?          ← REPETIÇÃO (bug)
```

Estado persistido após a 1ª resposta: `interest_confirmed = 'SEM_SERVICO'`, `location_known = NULL`. Ou seja, nada do que o cliente disse foi consolidado.

### Causa raiz #1 — `INTEREST_CAPTURE` quebra com `const` reassignment

Log da Edge Function: `[INTEREST_CAPTURE] non-blocking error: Assignment to constant variable.`

`index.ts` linha ~1591:
```ts
const leadInterest = …            // declarado const mais acima
…
leadInterest = { ...(leadInterest||{}), service_interest: detectedInterest }  // ❌ reatribuição
```

O throw cai no catch e é silenciado. Resultado:
- `serviceMissing` permanece `true`
- `leadInterest.service_interest` continua `SEM_SERVICO`
- `syncFunnelFromCapturedData` em seguida persiste `funnel.interest_confirmed = 'SEM_SERVICO'` (valor truthy)
- O `computeDeterministicFunnelPatch` extrai corretamente `RESIDENCIA_PARENTE_COMUNITARIO`, mas o filtro `&& !funnelStateLive.interest_confirmed` (linha 1632) descarta porque já há um valor (errado).

### Causa raiz #2 — Patch da localização não consolidado no turno "Sí"

No turno seguinte (`prev = "¿Estás en España?"`, `msg = "Sí"`) não há log `DET_PATCH` nem `DETERMINISTIC_PATCH` (só aparece patch vazio). Hipótese: o turno do "Sí" gerou patch vazio porque a Gate ainda contava `interest_confirmed='SEM_SERVICO'` truthy e o fluxo descartou o ramo. Mais provável: a IA repetiu a pergunta porque o GATE mostrou `step=localizacao done=4/7 inSpain=false` e `forceReaskLocationSpainIfAmbiguous` classificou "Sí" como `yes` mas, sem `interest_confirmed` válido (bloqueio do Gate em SEM_SERVICO), o flow voltou a emitir a pergunta canônica de localização novamente.

Independentemente da causa secundária, **a raiz é o bug #1**: enquanto o interesse permanecer "SEM_SERVICO", o gate fica preso no pré-localização e ignora consolidações posteriores.

## Correções

### 1) `index.ts` — corrigir reassignment de `leadInterest`

Trocar `const leadInterest` por `let leadInterest` no ponto da declaração, OU usar uma variável local nova em vez de reatribuir. Preferir **`let leadInterest`** (mínimo de risco) — assim o bloco do INTEREST_CAPTURE funciona.

### 2) `index.ts` — patch determinístico deve ter prioridade sobre `SEM_SERVICO`

Tornar o filtro do detPatch mais robusto:

```ts
const currentInterestEmpty = !funnelStateLive.interest_confirmed
  || ['SEM_SERVICO', 'OUTRO', ''].includes(String(funnelStateLive.interest_confirmed).toUpperCase())
if (detPatch.interest_confirmed && currentInterestEmpty) {
  safe.interest_confirmed = detPatch.interest_confirmed
}
```

Isto garante que mesmo se algum sync anterior gravar 'SEM_SERVICO', o detPatch sobrescreve com o código canônico extraído da mensagem do cliente.

### 3) `index.ts` — mesma proteção em `syncFunnelFromCapturedData`

Auditar `syncFunnelFromCapturedData` para que **não** grave `SEM_SERVICO` em `funnel.interest_confirmed` (deve manter NULL quando não há interesse válido capturado), evitando o "falso truthy" que bloqueia patches subsequentes.

### 4) Migration de limpeza para o lead `5f56496d-…`

```sql
UPDATE lead_funnel_state
SET interest_confirmed = 'RESIDENCIA_PARENTE_COMUNITARIO',
    location_known = 'spain',
    pending_questions = '[]',
    updated_at = now()
WHERE lead_id = '5f56496d-8b9b-438b-a59d-e6bc05b32f2f';

UPDATE leads
SET service_interest = 'RESIDENCIA_PARENTE_COMUNITARIO',
    interest_confirmed = true
WHERE id = '5f56496d-8b9b-438b-a59d-e6bc05b32f2f';
```

### 5) Teste de regressão Deno

Em `compound_message_test.ts` (ou novo `interest_capture_test.ts`), simular sequência:
1. msg composta → `detPatch.interest_confirmed = 'RESIDENCIA_PARENTE_COMUNITARIO'`
2. com `funnelStateLive.interest_confirmed = 'SEM_SERVICO'` simulado → safe deve incluir o override
3. próximo turno: prev=`¿Estás en España?`, msg=`Sí` → `patch.location_known = 'spain'`

### 6) Deploy

Redeploy `whatsapp-webhook` e verificar nos logs:
- ausência de `[INTEREST_CAPTURE] non-blocking error: Assignment to constant variable.`
- `[DET_PATCH]` contém `location_known` quando o cliente confirma localização.

## Arquivos

- `supabase/functions/whatsapp-webhook/index.ts` (edit — 3 pontos)
- `supabase/functions/whatsapp-webhook/compound_message_test.ts` (extend)
- 1 migration de limpeza

## Validação

1. `supabase--test_edge_functions` rodando os novos testes.
2. Inspecionar `lead_funnel_state` do Roberto: `interest_confirmed='RESIDENCIA_PARENTE_COMUNITARIO'`, `location_known='spain'`.
3. Simular nova conversa via `curl_edge_functions`: cliente que envia compound + "Sí" deve ver o fluxo avançar para a pergunta de data de entrada (B2), **sem** repetir `¿Estás en España?`.
