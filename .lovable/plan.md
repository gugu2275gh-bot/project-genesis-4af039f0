# Otimização do tempo de resposta do agente no WhatsApp

## O que medi

- O banco **não** é o gargalo: as consultas mais pesadas têm média de 2–8 ms (`slow_queries`).
- O tempo por turno vem do webhook `whatsapp-webhook` (3.714 linhas no `index.ts`), que hoje executa quase tudo em série:
  1. **Buffer fixo** de 300 ms (msg "completa") ou **1500 ms** (msg curta) antes de qualquer processamento;
  2. **~75 chamadas `await supabase`** sequenciais (config, agente, textos, fluxo, histórico, rate limit, notificações, logs);
  3. Uma **chamada HTTP extra à edge function `smart-reactivation`** (cold start + chamada OpenAI própria) quando não há fluxo visual ativo;
  4. **LLM** com system prompt gigante + até 24 mensagens de histórico + `maxOutputTokens: 2048`;
  5. Envio das mensagens ao Twilio em série com **pausa de 350 ms** entre cada balão.

Somando, um turno simples pode custar de 4 a 12 s mesmo quando o fluxo visual é determinístico e nem precisaria de LLM.

## O que será feito (sem mudar comportamento do fluxo)

### 1. Instrumentação primeiro
Adicionar marcas de tempo por fase (buffer, config, fluxo, LLM, envio) no `logTurn`, para medir antes/depois e provar o ganho.

### 2. Buffer adaptativo mais inteligente
- Reduzir o buffer padrão de 1500 ms → 700 ms.
- **Zerar o buffer** quando a etapa ativa do fluxo visual espera resposta curta (SIM/NÃO, escolha de opção, data) — nesses casos não há "balões em sequência" a consolidar.
- Manter integralmente as proteções `BUFFERED_NEWER` e anti-duplicidade.

### 3. Paralelizar leituras independentes
Agrupar em `Promise.all` os blocos que hoje são sequenciais e não dependem entre si: config do agente, textos multilíngues, etapas do fluxo, base de conhecimento, histórico da conversa, contagem de rate limit. Estimativa: −0,5 a −1,5 s por turno.

### 4. Cache em memória do isolate (TTL curto)
`ai_agents`, `ai_agent_texts`, `ai_agent_flow_steps`, `llm_settings` e `system_config` mudam raramente. Cache de 60 s no escopo do módulo, invalidado por TTL — isolates quentes deixam de reler tudo a cada mensagem.

### 5. Tirar do caminho crítico o que não bloqueia a resposta
Mover para depois do envio (via `EdgeRuntime.waitUntil`): notificações de setor, inserts em `interactions`, `turn-log`, marcação de setor na mensagem e updates de `webhook_logs`. O cliente recebe a resposta antes desses writes.

### 6. `smart-reactivation` só quando fizer sentido
Hoje é chamada em quase todo turno sem fluxo visual. Passará a ser chamada apenas quando a última interação for antiga (janela de reativação) — nos demais casos o resultado é sempre "CURRENT_FLOW" e a chamada é puro custo (HTTP + LLM).

### 7. Envio das mensagens
- Enviar o primeiro balão imediatamente e os seguintes em background.
- Reduzir a pausa entre balões de 350 ms → 150 ms (mantendo a ordem).

### 8. Ajustes no LLM (apenas quando o fluxo visual não responde)
- Histórico de 24 → 12 mensagens.
- `maxOutputTokens` 2048 → 700 (as respostas do agente são curtas).
- Enxugar o system prompt duplicado (regras repetidas) e cortar contexto da base de conhecimento quando a etapa é de captação de dado.
- Manter a cascata dinâmica de `llm_settings` intacta; apenas reduzir o timeout de 45 s → 20 s no primeiro provedor para cair mais rápido no fallback.

## O que NÃO muda

- Regras do fluxo visual, ramificações, validações e travas (Strict Flow Lock).
- Detecção de idioma na 1ª mensagem e travamento por idioma.
- Botões Sim/Não apenas quando habilitados na etapa.
- Proteções anti-duplicidade e rate limit.

## Verificação

- Suíte Deno existente (`flow-engine`, `quick-reply-flow`, testes multilíngues) deve continuar 100% verde.
- Comparar os logs de tempo por fase antes/depois em um teste no Sandbox e em um turno real.

## Detalhes técnicos

Arquivos afetados: `supabase/functions/whatsapp-webhook/index.ts`, `lib/ai.ts`, `lib/agent-runtime.ts`, `lib/visual-flow.ts`, `lib/kb.ts`, `lib/twilio.ts`, `lib/turn-log.ts`. Nenhuma migration de banco é necessária.
