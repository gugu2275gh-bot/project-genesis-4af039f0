## Por que a pergunta saiu como texto aberto

Confirmado no código:

- `quickReplyOf()` em `supabase/functions/_shared/flow-engine.ts:109` só liga botões quando `validation.quick_reply === true` **E** `answer_type === 'SIM_NAO'`.
- A etapa da imagem 1 está com **Tipo de resposta esperada = "Botões" (`BOTOES`)**, que não é `SIM_NAO` — logo `quick_reply` sai `false` e o webhook envia `quickReply: 'off'` (`whatsapp-webhook/index.ts:1698`).
- Além disso, o único envio com botões existente é `sendYesNoQuickReply()` (`lib/quick-reply.ts`), que cria um Content Twilio fixo com dois botões **Sim/Não**. Não existe hoje envio de botões a partir das "Opções oferecidas ao cliente".

Ou seja: as opções digitadas no editor hoje servem só para validar/rotear a resposta digitada — nunca viram botões no WhatsApp.

E sobre a imagem 2: o botão "Traduzir" existente atua nos **equivalentes aceitos do caminho** (entrada). Os **rótulos exibidos** (`validation.options`) não têm tradução — por isso apareceriam sempre em português.

## O que será implementado

### 1. Envio real de botões por opções
- Novo `sendOptionsQuickReply(phone, question, options, language)` em `lib/quick-reply.ts`: cria/reutiliza Content Twilio `twilio/quick-reply` com até 3 botões vindos das opções da etapa (títulos truncados em 20 caracteres, ids estáveis `OPT_1..OPT_3`), com cache por idioma+opções.
- `sendOutgoingIdempotent` ganha `quickReply: 'options'` com a lista de rótulos; falha em qualquer ponto cai no texto atual (comportamento hoje).
- `quickReplyOf()` passa a retornar botões também quando `answer_type === 'BOTOES'` (ou `SELECAO` com ≤3 opções e `quick_reply` marcado), expondo os rótulos junto do `outbound`.
- Webhook: repassa os rótulos ao envio; se houver mais de 3 opções, mantém texto e lista numerada (aviso já existe no editor).
- Recebimento: `parseMessage` mapeia `ButtonPayload = OPT_n` para o rótulo canônico da etapa, que segue para o roteamento normal por caminhos.

### 2. Tradução automática dos rótulos das opções
- `StepValidation` ganha `options_i18n?: { pt?: string[]; es?: string[]; en?: string[]; fr?: string[] }`.
- No `StepRoutingEditor`, ao adicionar/editar opções, um botão "Traduzir" (e tradução automática ao salvar a etapa, igual às mensagens) gera os rótulos nos 4 idiomas via `useAgentTranslate`, exibidos em campos por idioma.
- No runtime (`flow-engine.ts`), os rótulos exibidos/enviados como botões usam o idioma travado da conversa, com fallback para o texto original.
- Os equivalentes aceitos dos caminhos continuam funcionando e passam a incluir automaticamente os rótulos traduzidos, para que a resposta digitada em qualquer idioma case com o caminho certo.

### 3. Validação
- Testes em `supabase/functions/ai-agent-sandbox/`: etapa `BOTOES` gera outbound com rótulos, limite de 3, fallback para texto, matching de `OPT_n` e de rótulo traduzido digitado.
- Redeploy de `whatsapp-webhook` e `ai-agent-sandbox`.

## Observações técnicas
- Botões só funcionam dentro da janela de 24h; fora dela o fallback de template/texto atual permanece.
- WhatsApp limita 3 botões de resposta rápida e 20 caracteres por título — acima disso a etapa é enviada como lista numerada em texto.
