## O que aconteceu (confirmado nos dados)

Lead `8486bb41…1636c` (Roberto Barros), fluxo parado na etapa **msg_b2_data_de_entrada_na_espanha**, `unknown_attempts: 2`, `finished: false`.

Sequência real (tabela `mensagens_cliente`):

```text
IA     "Qual foi a data exata da sua entrada na Espanha?"
Cliente "Nao sei"
IA     "Sem problema! Uma data aproximada já me ajuda — só o mês e o ano servem."
Cliente "Maio de 2026"
IA     "Por favor digite uma data valida. Formato (DD/MM/AAAA)"
Cliente "Nao sei a data certa"
IA     (nada — log: [SEND_DEDUP] skipping duplicate → [VISUAL_FLOW] send skipped (dedup_hash))
```

Três causas encadeadas:

1. **Contradição de configuração.** A etapa (`ai_agent_flow_steps`) tem `unexpected_answer.unknown` = `enabled: true`, `mode: INSISTIR`, com a mensagem "só o mês e o ano servem"; mas `invalid_format` está `enabled: false` e nenhum modo é `ACEITAR_APROXIMADO`. No motor (`flow-engine.ts`, ~linha 777) o `parseApproxDate` só roda quando **a regra do desvio classificado** é `ACEITAR_APROXIMADO`. Logo "Maio de 2026" foi rejeitada, mesmo depois de o agente prometer aceitar mês/ano.
2. **Sem saída após esgotar tentativas.** `unknown.attempts = 2` e `max_reasks = 2`, sem `fallback_step_code` e sem modo `PULAR`: ao estourar, o motor volta a `stay(defaultReask())` — loop infinito na mesma etapa.
3. **Silêncio total.** Como o texto repetido é idêntico ao anterior, o dedup de envio (`lib/twilio.ts`, hash + near-duplicate 90s) bloqueia o envio. O cliente simplesmente para de receber respostas — a sensação de "travou".

## Correções propostas

**A. Data aproximada coerente com a promessa** (`_shared/flow-engine.ts`)
Em etapas `answer_type = DATA`, tentar `parseApproxDate` sempre que **qualquer** regra da etapa estiver em `ACEITAR_APROXIMADO` **ou** quando a mensagem da regra `unknown` já tiver sido usada para prometer data aproximada (`unknown_attempts > 0`). "Maio de 2026" passa a virar `01/05/2026` e o fluxo avança.

**B. Nunca ficar preso na etapa**
Ao esgotar `attempts`/`max_reasks` sem `fallback_step_code`, em vez de repetir a mesma pergunta: avançar com `fallback_value` (ou vazio, registrando "não informado") para etapas não críticas; se a etapa for obrigatória e não houver como avançar, encerrar em handoff humano com log `exit_reason` próprio.

**C. Nunca deixar o cliente sem resposta**
No envio do fluxo visual (`whatsapp-webhook/index.ts` + `lib/twilio.ts`): se todas as partes forem descartadas por dedup, enviar uma variação curta (ex.: "Só para confirmar: …") em vez de nada, e registrar `whatsapp_turn_log` com `exit_reason` indicando o descarte, para o watchdog conseguir enxergar.

**D. Destravar o atendimento atual**
Migration pontual atualizando `lead_funnel_state.visual_flow_state` desse lead: gravar `msg_b2… = "01/05/2026"` (a data que ele informou) e mover `current_step` para a etapa seguinte, para o atendimento continuar sem reiniciar.

**E. Validação**
Ampliar `_shared/flow_turn_test.ts` com casos: "Nao sei" → mensagem aproximada; "Maio de 2026" → aceita e avança; 3ª resposta vaga → avança/encaminha, nunca repete idêntico. Rodar a suíte e fazer deploy das edge functions.

### Detalhes técnicos
Arquivos: `supabase/functions/_shared/flow-engine.ts`, `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/whatsapp-webhook/lib/twilio.ts`, `supabase/functions/_shared/flow_turn_test.ts`, + 1 migration de correção do estado do lead.
