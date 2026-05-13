## Auditoria pré-handoff (vs. CB_pre-handoff_v2-5.bpm)

### Mapeamento BPMN → código

| BPMN (v2-5) | Código (canônico) | Persistência |
|---|---|---|
| Msg 1-2 abertura | prompt LLM | — |
| Msg 3 nome | `getFullNameReaskQuestion` | `contacts.full_name` + `name_confirmed` |
| Msg 4 email | `getEmailQuestion` | `contacts.email` + `email_confirmed` |
| Msg 5 interesse + Msg 6 catálogo | `ensureServicesAttachedToInterest` (mesma rodada `\|\|\|`) | `interest_confirmed` |
| Msg 7 localização | `getLocationQuestion` | `location_known` |
| A1 cenário + A2 idade | `getOutsideSpainAgeQuestion` (mesma bolha) | `outside_spain_progress.a2_age` |
| A3 Europa 6m | regex em `getOutsideSpainNextQuestion` | `a3_europe_6m` |
| A4 familiar | idem | `a4_eu_family` |
| A5 remoto | idem | `a5_remote` |
| A6 formação | idem | `a6_higher_ed` |
| B1 + B2 data entrada | `forceCorrectBlockForLocation` (preâmbulo + pergunta na mesma bolha) | `entry_date_confirmed` |
| B3 empadronado | `getEmpadronadoQuestion` | `empadronado_confirmed` |
| B4 desde quando | `getEmpadronamientoSinceQuestion` | **somente via extract.ts (LLM)** ⚠ |
| B5 cidade | `getEmpadronamientoCityQuestion` + `isValidSpanishCity` | `empadronado_city` |
| H1 + H2 + H3 | `buildPreHandoffPayload` (3 bolhas) | `pre_handoff_sent`, `handoff_sent` |

### Resultado vs. seus 4 critérios

**1. Pergunta feita não pode ser repetida — ⚠ Parcial**
- Anti-repetição cataloga A2-A6, B2-B5 e Msg7 em `preventRepeatedCanonicalQuestion` ✅
- **Lacunas**:
  - A1 ("confirmar cenário fora") e B1 ("confirmar situação aqui") não têm âncora nem flag persistida (`a1_scenario_sent`/`b1_situation_sent` declarados na interface mas nunca gravados). Se o LLM regerar o preâmbulo, sai duplicado.
  - Msg 3 (nome) e Msg 4 (email) não estão no catálogo do anti-repeat. A proteção depende de `lockConfirmedFieldsInResponse` (só dispara se flag confirmado). Se cliente devolveu nome inválido (1 palavra), `forceReaskFullNameIfSingleWord` reformula — ok.
  - Msg 6 (catálogo) — `ensureServicesAttachedToInterest` é idempotente via transcript ✅
  - Msg 7 — anti-repeat tem âncora, mas só dispara se a IA emite a versão padrão; paráfrases ("você está aí no Brasil ainda?") não pegam.

**2. Idioma travado — ✅ OK**
- 1ª mensagem detecta e grava `contacts.preferred_language`; turnos seguintes leem dali; fallback usa **primeira** mensagem do histórico (não a atual). Sem regressão.

**3. Campos respondidos gravados — ⚠ Parcial**
- ✅ Persistidos: nome, email, interesse, location_known, entry_date_confirmed, empadronado_confirmed, empadronado_city, A2-A6 em `outside_spain_progress`, `pre_handoff_sent`, `handoff_sent`.
- ⚠ **B4 "desde quando"**: nenhuma escrita determinística para `contacts.empadronamiento_since` ou em `funnel-state` — depende 100% da extração best-effort em `extract.ts`. Se o LLM falhar a extração, perde-se o dado e o gate de "askedSince" só usa transcript regex.
- ⚠ Flags `a1_scenario_sent` e `b1_situation_sent` existem na interface `OutsideProgress` mas **nunca são setados** — sem efeito prático, deveriam ser removidos ou populados.

**4. Sequência correta do fluxo — ✅ OK (com 1 ponto frágil)**
- `enforceBlockCompletion` bloqueia H1 enquanto B (data → empadronado → desde quando → cidade) ou A (idade → Europa → familiar → remoto → formação) estiver incompleto, usando flags persistidas + fallback transcript.
- `forceCorrectBlockForLocation` evita perguntar bloco errado (B em outside / A em spain).
- Ramo B `askedSince` ainda depende de transcript regex, não de coluna persistida → se trecho histórico for purgado/truncado, gate falha.

### Correções propostas

1. **Persistir B4 (desde quando) determinístico**
   - Adicionar `empadronado_since: string | null` em `FunnelState` (jsonb ou coluna nova) **e** gravar `contacts.empadronamiento_since` em `computeDeterministicFunnelPatch` quando `prevQ` é `isEmpadronamientoSinceQuestion` e a resposta é parseável por `parseEntryDateFromText`.
   - Substituir o uso de transcript em `enforceBlockCompletion`/`forceCorrectBlockForLocation` por essa flag persistida (com fallback ao transcript).

2. **Persistir A1/B1 enviados (idempotência de preâmbulo)**
   - Em `getOutsideSpainAgeQuestion` (caller `forceCorrectBlockForLocation` ramo outside) gravar `a1_scenario_sent=true` via `mergeOutsideProgress` na 1ª emissão; nas seguintes, omitir o preâmbulo "Entendido. Então seguimos…".
   - Idem para B1: ao emitir o preâmbulo "Perfeito. Agora preciso entender sua situação aqui." gravar `b1_situation_sent=true` (campo já existe) e omitir nas próximas rodadas.

3. **Catalogar Msg3 e Msg4 no anti-repeat**
   - Adicionar âncoras `Msg3_nome` (`isQuestionAboutFullName`) e `Msg4_email` (`isQuestionAboutEmail`) em `preventRepeatedCanonicalQuestion`, com substituição pela próxima pendente (`getEmailQuestion` / `getLocationQuestion`).

4. **Reforçar âncora Msg7**
   - Expandir o regex Msg7 para também detectar paráfrases ("ainda no Brasil/no exterior", "where are you currently", etc.) para evitar repergunta após `location_known` setado.

5. **Limpar flags mortas**
   - Remover `a1_scenario_sent` e `b1_situation_sent` se a opção (2) não for adotada.

### Testes a adicionar

- `funnel_persistence_test.ts`: verifica gravação de `empadronamiento_since` ao responder B4.
- `bpmn3_handoff_test.ts`: cenário em que LLM gera B1/A1 duas vezes — preâmbulo deve sumir na 2ª.
- `outside_progress_test.ts`: cenário onde transcript foi truncado mas flags A2-A6 estão ok → H1 libera.

### Arquivos a editar (na implementação)

- `lib/funnel-state.ts` — adicionar `empadronado_since`; popular flags A1/B1.
- `lib/overrides.ts` — gravar `empadronamiento_since` no patch determinístico; adicionar âncoras Msg3/Msg4 + paráfrases Msg7; usar flags em vez de transcript.
- `lib/questions.ts` — versão "sem preâmbulo" de A1/B1 quando flag já setado.
- `index.ts` — wiring (1 ponto onde já chamamos extractOutsideProgressPatch).
- Migração SQL: opcional `lead_funnel_state.empadronado_since date` (ou usar `outside_spain_progress` jsonb).
- Testes: 3 novos arquivos/cases.
