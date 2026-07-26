## O que já está validado

Rodei a suíte completa do motor de fluxo: **45 testes, 0 falhas** (`flow-engine`, `unexpected-answer`, `date-validation`, `flow-strict`, `language-detect`, `language-first-message`, `quick-reply-flow`), e o `deno check` passa nos três arquivos novos/alterados. As integrações estão ligadas de verdade:

- `advanceFlowTurn` é chamado tanto em produção (`whatsapp-webhook/lib/visual-flow.ts`) quanto no simulador (`ai-agent-sandbox/index.ts`).
- `FLOW_RETRY_PREFIX` está aplicado no webhook (evita silêncio por deduplicação do Twilio).
- Watchdog compila e o cron `whatsapp-stall-watchdog-1m` continua apontando para a função.

## 2 pontos que ainda não estão garantidos (proponho corrigir)

**1. Latência desnecessária em respostas válidas que "parecem pergunta"**
Hoje a busca na base roda ANTES de saber se o fluxo vai avançar. Se o cliente responde algo válido mas com cara de pergunta (ex.: "posso ser o Pedro Oliveira?"), gastamos uma busca na base + espera antes de avançar. Ajuste: rodar a busca da "resposta e retomada" só depois de `advanceFlow` indicar `reasked = true`, mantendo o mesmo timeout curto.

**2. Sobreposição de execuções do watchdog**
O cron dispara a cada 1 minuto e cada execução agora varre 3 ciclos (~36s). Isso é seguro (o lead recuperado deixa de ser o "último inbound"), mas não há trava explícita. Ajuste: reduzir para 2 ciclos de 20s e registrar no log o número do ciclo, para o comportamento ficar previsível e auditável.

## Cobertura de teste que falta

Criar `supabase/functions/ai-agent-sandbox/answer-reask_test.ts` cobrindo:
- `looksLikeQuestion` nos 4 idiomas (pt/es/en/fr), incluindo falsos positivos ("sim", "Pedro Oliveira").
- `composeAnswerAndReask` juntando resposta + pergunta numa única bolha com a frase de ligação correta por idioma.
- `advanceFlowTurn` com LLM/KB simulados: resposta fora do tema → uma única mensagem contendo resposta + repergunta, sem sair da etapa.
- Timeout: LLM que nunca responde não pode segurar o turno (deve seguir com o fallback).
- Data aproximada aceita na 1ª falha e `max_reasks` padrão 1 escalando corretamente.

## Detalhes técnicos

- `_shared/flow-turn.ts`: mover o par `kbSearch`/`answerAside` para depois de `advanceFlow`, preservando o `Promise.all` do par `kb_check`/`ack_ai`.
- `whatsapp-stall-watchdog/index.ts`: `SWEEP_CYCLES = 2`, `SWEEP_INTERVAL_MS = 20_000`, log por ciclo.
- Após os ajustes: rodar a suíte de novo e redeployar `whatsapp-webhook`, `ai-agent-sandbox` e `whatsapp-stall-watchdog`.
