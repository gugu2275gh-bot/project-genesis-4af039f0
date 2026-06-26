
# Refator: Máquina de Estados Determinística do Atendimento

## Objetivo
Tirar do LLM qualquer decisão sobre "qual é a próxima etapa". O LLM continua redigindo texto, traduzindo, mantendo tom e respondendo dúvidas via KB. Toda transição passa a ser decidida por uma **state machine** consultando estado persistido — nunca relendo histórico.

**Compromissos:**
- Sem mudanças no Bizagi, ordem de mensagens, qualificação, Twilio, OpenAI, Gemini, embeddings, APIs ou UX.
- Refatoração interna do `whatsapp-webhook` apenas. Testes existentes continuam passando.

## Diagnóstico do que já existe (será reaproveitado, não recriado)

| Necessidade do pedido | Já existe em | Ação |
|---|---|---|
| `conversations` / current_step / status | `lead_funnel_state` (step, flags, pending_questions, handoff_sent, pre_handoff_sent) | **Estender** com colunas faltantes |
| `lead_profile` consolidado | `contacts` + trigger `sync_contact_is_in_spain` já espelha estado→contato | **Manter** — já é o perfil consolidado |
| `lead_answers` (respostas por etapa) | Parcial: campos em `lead_funnel_state` + `outside_spain_progress` jsonb | **Estender** jsonb existente; sem nova tabela |
| `conversation_events` | `whatsapp_turn_log` + `interactions` | **Manter** — já cobre |
| `flow_steps` (catálogo) | Hardcoded em `index.ts`/`overrides.ts`/`questions.ts` | **Criar** módulo `lib/flow-machine.ts` em código (não tabela — evita acoplamento DB e mantém testabilidade) |
| Perguntas paralelas | `pending_questions[]` jsonb + `lib/offtopic.ts` + `lib/parking.ts` | **Manter** — já implementado |
| Idioma | `contacts.preferred_language` + `lib/language.ts` | **Manter** |
| Branch Inside/Outside | `lead_funnel_state.location_known` + `outside_spain_progress` | **Manter** |

## Mudanças

### 1. Schema (migração mínima, aditiva)
Adicionar em `lead_funnel_state` (não criar tabela nova):
- `current_flow text` — ex: `ONBOARDING`, `INSIDE_SPAIN`, `OUTSIDE_SPAIN`, `KB_FREE`
- `status text` — `ACTIVE | AWAITING_HUMAN | CLOSED`
- `branch text` — `INSIDE | OUTSIDE | null`
- `last_human_handoff_at timestamptz`
- `answers jsonb default '{}'` — registro `{step → answer}` para auditoria/replay

Sem `DROP`. Sem renomear. Sem mexer em RLS/grants existentes (a tabela já tem 3 policies). Triggers existentes (`sync_contact_is_in_spain`) continuam funcionando porque só adicionamos colunas.

### 2. Novo módulo `lib/flow-machine.ts`
Catálogo declarativo das etapas — uma única fonte de verdade:

```ts
type StepDef = {
  code: StepCode
  flow: FlowCode
  ask: (lang) => string         // delega para questions.ts existente
  validate: (msg, ctx) => ValidationResult  // delega para extract.ts/offtopic.ts existentes
  persist: (supabase, state, value) => Promise<Patch>  // grava em answers + colunas dedicadas
  next: (state, value) => StepCode  // transição determinística
}
```

Reaproveita 100% de:
- `lib/questions.ts` (textos das perguntas)
- `lib/extract.ts` (extração nome/email/interesse)
- `lib/offtopic.ts` + `isValidAnswerForStep` (validação por etapa)
- `lib/funnel-state.ts` (`computeNextStep`, `applyTurnUpdates`, `mergeOutsideProgress`)

### 3. Orquestrador no `index.ts`
Extrair em `lib/turn-orchestrator.ts` o pipeline já existente, agora explícito:

```
1. loadFunnelState        (já existe)
2. resolveCurrentStep     (state.step — nunca infere do histórico)
3. classifyMessage        (offtopic.classifyOffTopic — já existe)
   ├─ se off-topic → park em pending_questions (já existe)
   └─ se resposta válida → persist + grava em answers jsonb
4. computeNextStep        (já existe — agora consulta flow-machine)
5. applyTurnUpdates       (já existe)
6. LLM redige             (ai.ts — apenas redação)
7. overrides.lockConfirmedFieldsInResponse  (já existe — trava regressão)
```

Hoje esse fluxo está espalhado em ~3000 linhas de `index.ts`. Vamos **encapsular sem mudar comportamento**: o `index.ts` passa a chamar `orchestrateTurn(ctx)` e os testes em `handler_test.ts`, `canonical_flow_test.ts`, `wave5/6/7_test.ts` continuam validando o resultado fim-a-fim.

### 4. Conversation Context (objeto em memória do turno)
Tipo `ConversationContext` montado uma vez por turno a partir do estado + perfil + pending_questions, passado para todas as funções (em vez de cada uma reler do banco). Não é tabela — é estrutura em memória, evita duplicação.

### 5. Testes
- Adicionar `flow_machine_test.ts` cobrindo catálogo (transições NAME→EMAIL→INTEREST→LOCATION→INSIDE/OUTSIDE).
- Adicionar `orchestrator_test.ts` cobrindo: pergunta paralela não perde etapa; LLM nunca decide next_step; replay de mensagem não pula etapa.
- Todos os ~30 testes existentes devem continuar verdes (régua de não-regressão).

## Entregáveis

1. Migração aditiva em `lead_funnel_state` (5 colunas).
2. `supabase/functions/whatsapp-webhook/lib/flow-machine.ts` — catálogo.
3. `supabase/functions/whatsapp-webhook/lib/turn-orchestrator.ts` — pipeline.
4. `supabase/functions/whatsapp-webhook/lib/conversation-context.ts` — tipo + builder.
5. Refator interno de `index.ts` chamando o orquestrador (sem mudar entrada/saída HTTP).
6. 2 arquivos de teste novos + verificação dos existentes.
7. Resumo técnico no fim explicando como o estado persistido impede o agente de "se perder".

## Riscos & Mitigação
- **Risco:** quebrar testes finos de wording. **Mitigação:** o orquestrador continua chamando exatamente as mesmas funções de texto (`questions.ts`, `ai.ts`, `overrides.ts`).
- **Risco:** divergência entre `contacts` e `lead_funnel_state`. **Mitigação:** trigger `sync_contact_is_in_spain` já garante; `loadFunnelState` já reconcilia.
- **Risco:** refator de 3k linhas. **Mitigação:** extração incremental — manter `index.ts` como casca fina, mover blocos para o orquestrador um por vez, rodar testes a cada extração.

Confirmo prosseguir com este plano?
