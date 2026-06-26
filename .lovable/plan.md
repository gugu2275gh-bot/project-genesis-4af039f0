# Plano: integrar Turn Orchestrator no `whatsapp-webhook/index.ts`

## Contexto

O `index.ts` tem 3.073 linhas (handler único de ~2.600 linhas). Reescrevê-lo do zero violaria as restrições já estabelecidas ("não alterar UX", "não alterar ordem do Bizagi", "não alterar lógica de qualificação", "reutilizar ao máximo, priorizar refatoração em vez de substituição"). A integração precisa ser **cirúrgica**: o orquestrador entra como **gate único** logo após o carregamento do estado, e os handlers legados das etapas Inside/Outside/PreHandoff/Handoff continuam — eles já são chamados via `pass_through` por design da máquina.

## Mudanças no `index.ts`

1. **Imports novos** no topo do arquivo:
   - `buildConversationContext` de `./lib/conversation-context.ts`
   - `decideTurn, applyTurnDecision` de `./lib/turn-orchestrator.ts`
   - `resolveCurrentStep, getStepDef` de `./lib/flow-machine.ts`

2. **Gate do orquestrador** — inserido logo após carregar `state` e `contact` (antes de qualquer cálculo legado de "qual é a etapa atual"):
   ```ts
   const ctx = buildConversationContext(state, contact, language)
   const decision = decideTurn(ctx, incomingText)
   state = await applyTurnDecision(supabase, state, decision)
   ```
3. **Despacho determinístico** baseado em `decision.action.kind`:
   - `park_offtopic` → reusa o caminho existente de "parking" (`lib/parking.ts` + replay) e **retorna** sem avançar etapa.
   - `reask_current` → reusa o reask já existente (`questions.ts` → `getStepDef(step).ask(lang)`) e retorna.
   - `advance` → segue para o redator LLM passando `next_step` já decidido (não recalcula).
   - `pass_through` → cai no handler legado da etapa (Inside/Outside/PreHandoff/Handoff), que continua intocado.

4. **Remoção de duplicidades** no handler:
   - Bloco que recomputava `currentStep` via inspeção de flags (`!name_confirmed ? 'nome' : ...`) → substituído por `ctx.current_step`.
   - Chamadas redundantes a `classifyOffTopic` na fase ONBOARDING → o orquestrador já classificou; o handler legado só roda em `pass_through`.
   - Validações inline de nome/email/interesse/localização → já vivem em `StepDef.validate`; o handler legado dessas 4 etapas é desativado quando o orquestrador retorna `advance`/`reask`/`park`.

5. **O que permanece intocado**:
   - Scripted dispatch (Msg1/Msg2/Msg3 do Bizagi).
   - `getInsideSpainNextQuestion` / `getOutsideSpainNextQuestion` / `mergeOutsideProgress` (etapas marcadas `pass_through`).
   - Anti-repeat, dedup, idempotência, KB/RAG, Twilio, Gemini/OpenAI.
   - Toda a camada de envio de mensagem.

## Auditoria pós-mudança (entregue no chat após implementar)

- Lista exata de trechos removidos de `index.ts` (com nº de linha original).
- Verificação ponto-a-ponto: o `index.ts` ainda calcula etapa? (Esperado: apenas via `ctx.current_step` / `decision.next_step`.)
- LLM influencia navegação? (Esperado: não para NAME/EMAIL/INTEREST/LOCATION; Inside/Outside ainda usam extração LLM **dentro** do handler `pass_through` — isso é por design da máquina atual e foi documentado na auditoria anterior.)
- Confirmação de que `flow-machine` + `turn-orchestrator` são a única fonte oficial para as 4 etapas determinísticas.

## Testes

- Todos os testes existentes (`flow_machine_test`, `turn_orchestrator_test`, `handler_test`, `canonical_flow_test`, `offtopic_*`, `wave*`, etc.) devem continuar passando.
- Sem novos testes — a cobertura unitária do orquestrador já existe.

## Riscos e mitigação

- **Risco**: regressão silenciosa em fluxos não cobertos por teste (Inside/Outside aprofundamento). **Mitigação**: gate só intercepta as 4 etapas determinísticas; demais caem em `pass_through` e mantêm 100% do código legado.
- **Risco**: dupla gravação em `lead_funnel_state` (orquestrador + handler legado). **Mitigação**: handler legado das 4 etapas é gated por `if (decision.action.kind === 'pass_through')`.

## Detalhes técnicos

- Nenhuma migração SQL adicional — as colunas (`current_flow`, `status`, `branch`, `answers`, `last_human_handoff_at`) já foram criadas na migração anterior.
- Nenhum novo arquivo. Apenas edições em `supabase/functions/whatsapp-webhook/index.ts`.
- Tamanho estimado da mudança: ~150 linhas adicionadas (gate + dispatch), ~200–400 linhas removidas (duplicidades de decisão de etapa).
