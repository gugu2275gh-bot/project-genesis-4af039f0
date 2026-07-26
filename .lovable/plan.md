## Regra a garantir

Com um fluxo configurado, **tudo que o cliente recebe vem exclusivamente da configuração da etapa** — texto, idioma e formato de envio. Nenhuma heurística legada pode alterar a mensagem. Botões só aparecem se a etapa estiver marcada para isso.

## Causa confirmada do print

Os botões [Sí]/[No] não vieram do fluxo:

- `lib/twilio.ts:157` chama `sendYesNoQuickReply(...)` sempre que `isBinaryYesNoQuestion(body)` for verdadeiro.
- `lib/quick-reply.ts` decide isso por **regex sobre o texto de saída** (`YESNO_QUESTION_PATTERNS`), com padrões do roteiro antigo — inclusive `ya estas en espana`.
- Como a etapa de localização do fluxo tem exatamente esse texto em `es`, a camada de envio converteu a mensagem em template `twilio/quick-reply` sozinha, ignorando a configuração da etapa.

Os logs confirmam que o motor do fluxo comandou o turno (`[VISUAL_FLOW] step: msg_7_perguntar_localizacao`); o desvio foi só no envio.

## Plano

1. **Envio governado pelo fluxo.** Adicionar a opção `quickReply: 'auto' | 'on' | 'off'` no envio (`sendMessage` / `sendOutgoingIdempotent`). Quando a mensagem for originada pelo motor visual, o valor vem da etapa — nunca de regex. Sem valor explícito da etapa: `off`.
2. **Botões viram configuração da etapa.** Novo campo `quick_reply` (boolean, padrão `false`) dentro do JSONB `validation`, editável apenas quando `answer_type = SIM_NAO`, exposto no inspetor do editor visual e na edição em tabela ("Enviar como botões Sim/Não").
3. **Bloquear a heurística legada sob fluxo ativo.** `isBinaryYesNoQuestion` passa a valer somente no modo `auto` (atendimentos sem fluxo, LLM/funil legado). Com fluxo ativo, ela nunca é consultada.
4. **Auditar outros desvios na camada de envio** (sanitização, quebra de mensagens, sufixos, fallback de template) para garantir que nenhum deles reescreva o texto definido na etapa; o que não for imposto pelo WhatsApp fica desativado sob fluxo ativo.
5. **Retorno do botão.** Quando `quick_reply` estiver ligado, o `ButtonPayload` YES/NO continua normalizado para "sim"/"não" e validado pela etapa `SIM_NAO` do fluxo.
6. **Testes Deno**: (a) fluxo ativo + `quick_reply` desligado → texto puro, sem botões, mesmo com texto que casa com a regex legada; (b) `quick_reply` ligado → quick reply; (c) sem fluxo → comportamento legado inalterado; (d) texto enviado é idêntico ao configurado na etapa.

## Detalhes técnicos

- `supabase/functions/whatsapp-webhook/lib/twilio.ts`: parâmetro `quickReply`, default `'auto'`, com curto-circuito para `'off'`.
- `supabase/functions/whatsapp-webhook/index.ts` (bloco `[VISUAL_FLOW]`) e `lib/visual-flow.ts`: propagar a decisão por mensagem vinda da etapa.
- `supabase/functions/_shared/flow-engine.ts`: incluir no resultado do turno o metadado de cada mensagem (etapa de origem + `quick_reply`).
- Front: `src/components/ai-agents/flow-builder/StepInspector.tsx` e `src/components/ai-agents/FlowsManagement.tsx` — switch "Enviar como botões (Sim/Não)".
- Sandbox (`ai-agent-sandbox`) recebe o mesmo metadado para exibir a etapa como botões no simulador, mantendo paridade.
- Sem migração de schema: o campo entra no JSONB `validation` já existente.
