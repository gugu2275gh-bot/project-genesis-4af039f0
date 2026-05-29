
## Sequência canônica pré-hands-off (estado atual no código)

Definida em `lib/questions.ts` (`getNextScriptedQuestion` + `getInsideSpainNextQuestion` + `getOutsideSpainNextQuestion`). Todas as strings vêm de `getPromptTemplates(language)` — **mesmo texto em PT/ES/EN/FR**, sem reescrita pelo LLM.

```
Step              Mensagem canônica                                Origem
─────────────────────────────────────────────────────────────────────────
1. abertura       openingLine1 ||| openingLine2                    templates
2. nome           askName                                           templates
3. email          thanksThenAskEmail                                templates
4. interesse      interestQuestion ||| servicesOfferedMessage       templates  ← Msg5+Msg6
5. localização    askLocationSpain  ("¿Estás en España?" etc.)     templates
6. aprofundamento  ┌ NA Espanha:                                   getInsideSpainNextQuestion
                   │   B1 intro + B2 data entrada (DD/MM/AAAA)
                   │   B3 empadronado?
                   │   B4 desde quando (se empadronado=true)
                   │   B5 cidade        (se empadronado=true)
                   └ FORA da Espanha:                              getOutsideSpainNextQuestion
                       A2 idade → A3 Europa 6m → A4 familiar UE
                       → A5 remoto → A6 formação superior
7. preHandoff     H1 resumo ||| H2 confirmação ||| H3 transfer     buildPreHandoffPayload
```

Regra do projeto (mem://): perguntas pré-hands-off são **padronizadas**, idioma travado no primeiro turno, **uma única vez cada**.

## O que quebrou no atendimento do Pedro/Gustavo (lead `70a9963f`)

Mensagem do cliente: **"Sí, ya tengo 2 años en España y quiero solicitar mi residencia"** após o catálogo.

| # | Bug | Local | Efeito |
|---|---|---|---|
| A | `computeDeterministicFunnelPatch` grava `interest_confirmed = msg` cru (frase inteira) quando casa `isPotentialInterestAnswer` | `overrides.ts:104-110` | Normalizer downstream não acha código → salva `SEM_SERVICO` |
| B | `LOCATION_IN_SPAIN_HINT_RE` seta `location_known='spain'` direto a partir da pista embutida | `overrides.ts:96-102` | Step 5 (`askLocationSpain`) é **pulado**, viola "uma pergunta padronizada por etapa" |

## Correções

### 1) `lib/overrides.ts` — extrair token canônico de serviço

Adicionar helper `extractServiceKeyword(msg, language)` com regex multilíngue:

```
residencia|residência|residency|résidence       → 'RESIDENCIA'
nacionalidad|nacionalidade|nationality|nationalité → 'NACIONALIDADE'
arraigo                                          → 'ARRAIGO'
reagrupaci[óo]n|reagrupação|family reunification|regroupement → 'REAGRUPACAO_FAMILIAR'
homologaci[óo]n|homologação|homologation         → 'HOMOLOGACAO'
autorizaci[óo]n de regreso|autoriza[çc][ãa]o de regresso|return permit → 'AUTORIZACAO_REGRESSO'
estudios|estudos|studies|études|curso|course     → 'ESTUDOS'
```

Antes de finalizar o mapping, abrir `src/types/database.ts` (enum `SERVICE_INTEREST_LABELS`) e o normalizer downstream para confirmar os códigos exatos aceitos.

No patch:
- Se `extractServiceKeyword(msg)` → set `patch.interest_confirmed = <CODIGO>`.
- Só usar `msg` cru como fallback quando `isQuestionAboutInterest(prevQ)` e nenhum keyword bater (→ vai para `OUTRO`).

### 2) `lib/overrides.ts` — não pular a pergunta canônica de localização

`LOCATION_IN_SPAIN_HINT_RE` em respostas compostas só deve setar `location_known` **depois** que a pergunta canônica `askLocationSpain` foi enviada no transcript. Lógica:

```ts
const locationQuestionAsked = /\b(est[áa]s en espa[ñn]a|voc[eê] est[áa] na espanha|are you in spain|[êe]tes-vous (d[ée]j[àa] )?en espagne)\b/i
  .test(String(previousAssistantMessage || ''))   // ou checar transcript inteiro

if (LOCATION_IN_SPAIN_HINT_RE.test(msg) && locationQuestionAsked) {
  patch.location_known = 'spain'
}
```

Assinatura passa a aceitar opcionalmente `assistantTranscript` (já disponível no callsite) para checar transcripts além do último turno. Resultado: mesmo com a pista embutida, o dispatcher continua emitindo `askLocationSpain` no próximo turno — uma única vez. Quando o cliente responder sim/não à pergunta canônica, o ramo YES/NO já existente consolida `location_known`.

### 3) Testes Deno (`compound_message_test.ts`)

- ES: compound msg sem pergunta de localização prévia → `interest_confirmed='RESIDENCIA'`, `location_known` undefined.
- ES: mesma msg **após** `askLocationSpain` no transcript → `interest_confirmed='RESIDENCIA'`, `location_known='spain'`.
- PT/EN/FR: variantes equivalentes.
- Catálogo follow-up + "residencia" isolado → `RESIDENCIA`.
- `isPotentialInterestAnswer('Sí, ya tengo 2 años en España y quiero solicitar mi residencia')` continua true (regressão).

### 4) Migration — limpar leads atuais

Para `70a9963f-4c4b-4821-9282-59655275e2ca` e `486eb20c-8ae8-4899-962b-dc01dce7386d`:
- `interest_confirmed = 'RESIDENCIA'`
- Manter `entry_date_confirmed`, `location_known='spain'`, `step='levantamento'`.
- `pending_questions = '[]'`.

### 5) Deploy

`whatsapp-webhook` redeployado.

## Arquivos

- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (edit)
- `supabase/functions/whatsapp-webhook/compound_message_test.ts` (novo)
- 1 migration de limpeza para os 2 leads

## Validação após implementação

1. `supabase--test_edge_functions` rodando os novos testes.
2. Inspecionar `lead_funnel_state` dos 2 leads — `interest_confirmed='RESIDENCIA'`.
3. Simular nova conversa via `curl_edge_functions` enviando a compound msg e verificar que o próximo turno do bot é a pergunta canônica `askLocationSpain` no idioma travado (ES).
