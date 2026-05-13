## Diagnóstico (a partir dos logs reais do lead)

Da tabela `interactions` + log `[TURN]` da conversa do Gustavo:

```
03:03:27 BOT  "Você está na Espanha?"
03:03:47 USR  "sim"
03:04:01 BOT  "Qual foi a data exata da sua entrada na Espanha?"  (avançou, OK)
...
03:06:19 BOT  "Em qual cidade você está empadronado?"
03:06:28 USR  "paris"
03:06:43 LOG  [CITY_VALIDATION] invalid Spanish city in answer, reprompting: paris
03:06:43 LOG  [TURN] nextStep:"interesse", stepsDone:["abertura","nome","email"],
              dataKnown.service:false, location.inSpain:false, outsideSpain:false
03:06:44 BOT  "Me conta com calma: o que você busca hoje? ..."   ← reprompt SUMIU
03:07:01 USR  "autorização de regressop"
03:07:17 BOT  "Hoje você já está na Espanha?"                    ← repergunta localização
```

Três bugs reais, mesma raiz: **o estado do funil nunca foi persistido** para `interest_confirmed`, `location_known` nem `empadronado_city`. Como o GATE recompõe o roteiro a cada turno apenas a partir de `funnelStateLive` + regex no histórico, ele "esquece" tudo:

- A IA gera a próxima pergunta pendente segundo o GATE (= INTERESSE).
- `forceAdvanceFromEmpadronadoQuestion` gera o reprompt de cidade (log confirma).
- Mas o GATE/diretiva de estado força o LLM a re-perguntar interesse no turno seguinte; e o reprompt acaba descartado porque `nextStep="interesse"` nunca avança (interesse continua "missing").
- O mesmo motivo faz a IA voltar a perguntar "Você está na Espanha?" depois (`location_known` nunca foi gravado).

A correção tem que ser **transversal** (idiomas PT/ES/EN/FR) e baseada em **persistência determinística por turno**, não em extração best-effort.

## Plano

### 1. `lib/funnel-state.ts` — adicionar `empadronado_city`

- Nova coluna `empadronado_city text` em `lead_funnel_state` (migration).
- `FunnelState` ganha `empadronado_city: string | null`.
- `applyTurnUpdates` aceita o campo no `patch`.

### 2. Persistência turn-a-turn baseada em `previousQuestion`

Em `index.ts`, antes de chamar a IA, calcular um patch determinístico a partir de `(previousQuestion, rawCustomerMessage)` — zero LLM, zero heurística:

| previousQuestion detectada por… | regra | grava |
|---|---|---|
| `getLocationQuestion` (PT/ES/EN/FR) e variantes "Você está na Espanha?" | `YES_ANSWER_RE` → `'spain'`; `NO_ANSWER_RE` → `'outside'` | `location_known` |
| `isQuestionAboutInterest` | `isPotentialInterestAnswer(msg)` → `service_interest` (ou `'detected'`) | `interest_confirmed` |
| `isQuestionAboutSpainEntryDate` + `parseEntryDateFromText` no passado | iso | `entry_date_confirmed` |
| `isEmpadronamientoCityQuestion` + `isValidSpanishCity` | normalizado | `empadronado_city` |
| `isEmpadronadoYesNoQuestion` | sim/não | `empadronado` (já existente) |

O patch é gravado **antes** da chamada à IA e usado em `funnelStateLive` no mesmo turno. Assim o GATE e os flags `interestKnown`/`locationKnown` refletem a realidade.

### 3. Reforçar a validação B5 (cidade) — sentinel anti-clobber

- `forceAdvanceFromEmpadronadoQuestion` retorna o reprompt **e** marca `aiResponse` com prefixo invisível `\u200B[LOCKED_REPROMPT]\u200B` (removido antes do envio).
- `lockConfirmedFieldsInResponse`, `removeRepeatedQuestionIntro`, F1‑HARD, F4 e o anti-loop checam o sentinel e devolvem `aiResponse` intacto.
- Imediatamente antes de `sendWhatsAppMessage`, o sentinel é tirado.
- Adiciona-se também `isQuestionAboutEmpadronamientoCity(q)` e o reprompt ao detector de "perguntas pendentes" para que, se o LLM tentar pular para outra etapa, o GATE volte ao B5.

### 4. Dataset de cidades — cobrir lacunas que aceitariam estrangeiras

- Auditoria do `spanish-cities.json`: garantir que **só** municípios INE estão lá; remover qualquer entrada com diacríticos truncados (ex.: "paris" não está, mas a normalização precisa rejeitar `paris` como qualquer outra estrangeira).
- `isValidSpanishCity` passa a:
  1. `extractCityFromAnswer` (já existe) com NFD + lowercase.
  2. Rejeitar lista negra explícita de capitais não-espanholas comuns (`paris`, `lisboa`, `lisbon`, `roma`, `rome`, `londres`, `london`, `berlin`, `nova york`, `new york`, `buenos aires`, `mexico`, `bogota`, `lima`, …) — segurança extra mesmo se algum dia entrarem por engano.
  3. Só aceita se bater no Set INE.

### 5. Localização — pergunta única, resposta gravada

- `getLocationQuestion(language)` permanece a única forma sim/não.
- Detector `isQuestionAboutLocationSpain(q)` cobre PT/ES/EN/FR (incluindo "Você está na Espanha?" e "Hoje você já está na Espanha?").
- Quando previousQuestion bate o detector e a resposta é sim/não, grava `location_known` (regra 2).
- O GATE só pergunta de novo se `funnelStateLive.location_known` continuar `null` — agora vai estar gravado.

### 6. Interesse — gravar mesmo quando vier antes do bot perguntar

- Em todo turno, se `isPotentialInterestAnswer(rawCustomerMessage)` e `interest_confirmed` ainda nulo, grava `interest_confirmed = rawCustomerMessage` (mesmo sem ter passado pela pergunta).
- Isso fecha o caso da imagem 3: o cliente já disse "autorização de regresso" e o GATE para de marcar "interesse" como pendente.

### 7. Testes Deno (`wave6_test.ts`)

- B5 `"paris"` → reprompt; resposta seguinte `"madrid"` → grava `empadronado_city='madrid'`, libera próximo passo.
- B5 `"lisboa"`, `"londres"`, `"buenos aires"` → reprompt.
- "Você está na Espanha?" + `"sim"` (PT/ES/EN/FR) → `location_known='spain'`.
- Interesse: `"autorização de regresso"` antes do bot perguntar → `interest_confirmed` gravado, GATE pula etapa.
- Sentinel: simula override + lockConfirmedFieldsInResponse + isLikelyQuestionLoop — reprompt sobrevive.

### 8. Migration + deploy

- `alter table public.lead_funnel_state add column if not exists empadronado_city text;`
- `supabase functions deploy whatsapp-webhook`.

## Arquivos a editar/criar

- `supabase/functions/whatsapp-webhook/lib/funnel-state.ts`
- `supabase/functions/whatsapp-webhook/lib/questions.ts` (novos detectores PT/ES/EN/FR)
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (sentinel + guards)
- `supabase/functions/whatsapp-webhook/lib/spanish-cities.ts` (blacklist de capitais estrangeiras)
- `supabase/functions/whatsapp-webhook/index.ts` (patch determinístico por turno + remover sentinel antes do envio)
- `supabase/migrations/<ts>_add_empadronado_city.sql`
- `supabase/functions/whatsapp-webhook/wave6_test.ts`

Resultado: as três correções já feitas em PT passam a valer para ES/EN/FR pelo mesmo caminho determinístico, e o reprompt de cidade não é mais sobrescrito pela IA no mesmo turno.