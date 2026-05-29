
## Diagnóstico do caso do Pedro (`75a0418f… / ebf47b3d…`)

Cronologia confirmada em `mensagens_cliente`:

| Hora UTC | Origem | Texto |
|---|---|---|
| 11:46:36 | IA | "¿Estás en España?" |
| 11:46:57 | WHATSAPP | "Sí" ← chegou ao DB |
| 11:50:33 | WHATSAPP | "Hola?" ← chegou ao DB |

Estado em `lead_funnel_state`: `step=localizacao`, `pre_handoff_sent=false`, `handoff_sent=false`. Ou seja, o bot recebeu as duas mensagens mas **não emitiu nenhuma resposta** e nem avançou o funil.

Os logs do edge function só ficam disponíveis por ~5 min, então a janela de 11:46-11:50 já expirou e não consigo provar qual ramo do `index.ts` causou o "skip". As hipóteses compatíveis com o estado observado:

1. **Cascade AI falhou silenciosamente** — entre 11:46 e 11:48 houve várias respostas `429 RESOURCE_EXHAUSTED` do Gemini (vistas nos logs de outros leads). Se `gemini-3-flash → gemini-2.5-flash-lite → gpt-4o-mini` falhou todos os retries, o webhook responde `200` e segue sem mandar nada.
2. **Buffer detectou "newer message"** — possível em caso de webhook duplicado do Twilio.
3. **`recentOutbound` anti-duplicate** — match falso se outra escrita aconteceu na mesma janela.
4. **Reactivation devolveu `SEND_MESSAGE` mas a inserção falhou** — improvável, pois não há registro com `origem='REACTIVATION'`.

Em todos os casos o sintoma é o mesmo: a conversa fica "parada" sem nenhum sinal pro cliente nem pro operador.

## Plano: watchdog anti-stall + observabilidade

### 1. Persistir trilha de cada turno (`whatsapp_turn_log`)
Nova tabela append-only com 1 linha por webhook processado:
```
id, lead_id, contact_id, message_id, inbound_text,
exit_reason (enum: REPLIED, BUFFERED_NEWER, ANTI_DUP, AI_FAILED,
             REACTIVATION_SENT, BOT_DISABLED, PAUSED_BY_HUMAN, KB_STRICT_FALLBACK, OTHER),
ai_provider_used, ai_error, response_chars,
funnel_step_before, funnel_step_after, created_at
```
Cada ponto de `return` no `index.ts` grava aqui antes de responder. Isso garante diagnóstico mesmo após os logs do edge function expirarem.

### 2. Cron `whatsapp-stall-watchdog` (a cada 1 min)
Identifica leads onde:
- Última `mensagens_cliente` é `origem='WHATSAPP'` (inbound), **e**
- Faz mais de 90 s desde a chegada, **e**
- `lead_funnel_state.handoff_sent = false` (bot ainda no controle), **e**
- Bot habilitado e não pausado por humano.

Para cada um:
1. Loga em `whatsapp_turn_log` com `exit_reason='STALL_RECOVERED'`.
2. Re-invoca o pipeline AI (mesma função do webhook, refatorada em helper `processAITurn(leadId)`).
3. Se falhar de novo, marca `stall_attempts++`. Em 2 tentativas, envia para o operador uma notificação ("conversa parada – intervir") e congela.

### 3. Retry mais robusto no `aiCascade`
- Em `429 RESOURCE_EXHAUSTED`, respeita o `retryDelay` informado pelo Gemini (atualmente o cascade só faz 2 retries de 2 s).
- Se TODOS os providers falharem, em vez de retornar silencioso, gravar `exit_reason='AI_FAILED'` e disparar o watchdog antes mesmo do cron rodar (enfileira reprocessamento imediato + alerta).

### 4. Painel rápido em Configurações → WhatsApp
Lista os últimos 50 registros de `whatsapp_turn_log` com filtro por `exit_reason`. Útil para o admin diagnosticar bot "engasgado" sem precisar pedir logs.

### Detalhes técnicos
- Migração: cria `whatsapp_turn_log` + grants + RLS (ADMIN/MANAGER read).
- `supabase/functions/whatsapp-webhook/index.ts`: extrair os blocos pré-AI e AI em `lib/turn-pipeline.ts` para reuso pelo watchdog.
- `supabase/functions/whatsapp-stall-watchdog/index.ts`: novo cron (1 min) registrado em `supabase/config.toml`.
- Front-end: nova aba `WhatsAppTurnLogs.tsx` em `pages/settings/`.

### Fora do escopo
- Mudar a lógica do funil ou prompts.
- Mexer no formato dos templates / Twilio.

Após aplicar, o caso do Pedro teria recuperado automaticamente em ≤ 90 s e ficaria registrado o motivo exato do skip.
