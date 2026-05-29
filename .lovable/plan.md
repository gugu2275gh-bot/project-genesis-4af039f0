# Diagnóstico — atendimento do Pedro (lead `c7c5d054`)

## Linha do tempo real (do banco)

| Hora | De | Mensagem |
|------|----|----------|
| 12:55:06 | Pedro | "Hola, buenos dias" |
| 12:55:13 | Bot | Abertura |
| 12:55:21 | Pedro | "Sí, de acuerdo" |
| 12:55:27 | Bot | Pergunta nome |
| 12:55:39 | Pedro | "Pedro Henrique" |
| 12:55:45 | Bot | Pergunta e-mail |
| 12:55:55 | Pedro | "ph.oliveira@outlook.es" |
| 12:56:05 | Bot | Pergunta serviço |
| 12:56:13 | Pedro | **"Sí, ya tengo 2 años en España y quiero solicitar mi residencia"** |
| 12:56:19 | Bot | **"¿Estás en España?"** ❌ (já era óbvio que sim) |
| 12:56:26 | Pedro | "Sí" |
| 12:56:32 | Bot | **"¿Estás en España?"** ❌ (repetição) |

Estado atual em `lead_funnel_state`: `location_known = null`, `step = localizacao`, `updated_at = 12:56:19` (não houve update após o "Sí").

## Causa raiz (duas falhas independentes)

### Bug #1 — Regex quebrada em `computeDeterministicFunnelPatch`

`overrides.ts` linhas 94-95:

```ts
|| /\b\d+\s*(anos|años|years|ans)\s*(em|en|in)\s*espa[ñn]ha?\b/i
|| /\b(tenho|tengo|i have)\s+\d+\s*(anos|años|years|ans)\s*(em|en|in)\s*espa[ñn]ha?\b/i
```

O trecho `espa[ñn]ha?` exige **`h` literal** seguido de `a` opcional. "España"/"Espana" não tem `h`, então **nunca casa**. Confirmado por teste:

```
/tengo\s+\d+\s*años\s*en\s*espa[ñn]ha?/i.test('tengo 2 años en España') → false
```

Resultado: a frase composta do Pedro **não** seta `location_known='spain'` — patch só captura `interest_confirmed`. Bot cai no hard-lock de localização e pergunta "¿Estás en España?".

### Bug #2 — Resposta "Sí" pura não está persistindo `location_known`

No turno seguinte, `prevQ = "¿Estás en España?"`, `msg = "Sí"`. A lógica YES deveria setar `location_known='spain'`, mas o estado **não foi atualizado** (timestamp do `lead_funnel_state` ficou em 12:56:19). Suspeitas a investigar/corrigir:

- `lastAssistantMessage` no segundo turno não está vindo igual ao texto canônico injetado pelo hard-lock (o hard-lock substitui a saída da IA, mas o que entra no histórico do próximo turno pode ser outra coisa) — `isQuestionAboutLocationSpain(prevQ)` retorna false e o ramo YES/NO não dispara.
- Ou o caminho do det_patch foi pulado por algum early-return.

## Plano de correção

### 1. Corrigir o regex de "X anos en España" (Bug #1)
Em `supabase/functions/whatsapp-webhook/lib/overrides.ts`, trocar `espa[ñn]ha?` por `espa[ñn]h?a?` (ou simplesmente `espa[ñn]a`) nas linhas 93-95, cobrindo "España", "Espana" e variantes. Aplicar o mesmo fix em qualquer outra ocorrência do mesmo padrão no arquivo.

### 2. Garantir que "Sí" puro seta `location_known` (Bug #2)
- Em `index.ts`, garantir que `lastAssistantMessage` usado pelo `computeDeterministicFunnelPatch` reflita a **última saída realmente enviada ao cliente** (incluindo a versão canônica injetada pelo hard-lock), e não o texto bruto da IA. Reconstruir `history` a partir de `interactions` (direction=OUTBOUND, origin_bot=true) ao invés do contexto in-memory quando houver divergência.
- Adicionar fallback no det_patch: se `msg` ∈ {sim, sí, si, yes, ok, claro} **e** existir QUALQUER mensagem assistente recente (últimas 2) detectada por `isQuestionAboutLocationSpain`, setar `location_known='spain'`.

### 3. Hard-lock só pode disparar se `location_known` ainda é null
Já existe `blockLocationReaskIfKnown`, mas o hard-lock de `step=localizacao` (linha do log "[GATE-HARD-LOCK]") roda **antes** dele e força a pergunta canônica mesmo quando o det_patch acabou de marcar spain. Reordenar: rodar `applyTurnUpdates` do det_patch **antes** de avaliar `step` para o hard-lock; recomputar `funnelStateLive.step` após o patch.

### 4. Limpeza do estado do Pedro
- `lead_funnel_state` (lead `c7c5d054`): setar `location_known='spain'`, `interest_confirmed='RESIDENCIA_PARENTE_COMUNITARIO'`, `step='levantamento'`, `pending_questions=[]`.
- Próxima mensagem do bot deve ser a pergunta de data de entrada **em espanhol** (idioma já travado em `contacts.preferred_language='es'`).

### 5. Teste Deno cobrindo o cenário do Pedro
Adicionar teste em `whatsapp-webhook/*_test.ts`:
- Input composto: "Sí, ya tengo 2 años en España y quiero solicitar mi residencia" + prevQ pergunta de interesse → assert `patch.location_known === 'spain'` **e** `patch.interest_confirmed` setado.
- Input "Sí" + prevQ "¿Estás en España?" → assert `patch.location_known === 'spain'`.
- Variantes sem ñ: "Espana", "espana", "2 anos en Espana".

### 6. Deploy
Redeploy `whatsapp-webhook` após as correções.

## Detalhes técnicos

- Arquivos a editar: `supabase/functions/whatsapp-webhook/lib/overrides.ts`, `supabase/functions/whatsapp-webhook/index.ts`, novo arquivo de teste.
- Migration somente para limpar o estado do lead do Pedro (UPDATE em `lead_funnel_state`).
- Sem mudanças no frontend.
