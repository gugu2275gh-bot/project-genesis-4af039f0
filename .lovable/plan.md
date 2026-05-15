## Problema

Após o pré-handoff/handoff ter sido emitido (flag `pre_handoff_sent=true` em `lead_funnel_state`), o LLM ainda gera novamente as frases de fechamento — "Perfecto. Ya tengo una visión inicial de tu caso…", "En CB analizamos cada caso de forma individual…" e "Voy a remitir tu información…" — duplicando a despedida no meio da conversa pós-handoff (visível no print enviado).

Hoje há defesas para a abertura (`stripRepeatedOpener`) e para perguntas canônicas (`preventRepeatedCanonicalQuestion`), mas **nenhum guard que descarte a repetição de H1/H2/H3** quando o pré-handoff já está concluído. O sufixo "aguarde um especialista" é anexado, mas o bloco de fechamento continua sendo enviado.

## Solução

Adicionar um stripper determinístico `stripRepeatedPreHandoff` em `supabase/functions/whatsapp-webhook/lib/overrides.ts`, executado na pipeline de overrides logo antes do envio (ou logo antes de `stripPreambleBeforePreHandoff`).

Comportamento:

1. **Gate de ativação:** roda apenas quando `funnelStateLive.pre_handoff_sent === true` (passado como flag `preHandoffSent`).
2. **Detecção:** regex multilíngue para cada uma das 3 frases-âncora (reutiliza `PREHANDOFF_H1_RE` já existente + duas novas para H2 "cada caso de forma individual / each case individually / cada cas individuellement" e H3 "encaminhar suas informações / remitir tu información / forward your information / transmettre vos informations").
3. **Ação por bolha:** divide a resposta por `|||` e por parágrafos; remove qualquer parte que case com H1/H2/H3.
4. **Resultado vazio:** se sobrar nada significativo, substitui pelo sufixo localizado pós-handoff (`getPostHandoffWaitSuffix`) e marca como `lock()` — assim o usuário recebe uma única linha "Em breve um de nossos especialistas…" em vez do fechamento duplicado.
5. **Resultado parcial:** se sobrar conteúdo útil (ex.: resposta a uma dúvida nova do cliente), devolve apenas essa parte limpa.

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/lib/overrides.ts` — nova função `stripRepeatedPreHandoff` + 2 regex (H2, H3 — H1 já existe).
- `supabase/functions/whatsapp-webhook/index.ts` — chamar `stripRepeatedPreHandoff(aiResponseClean, detectedChatLanguage, { preHandoffSent: !!funnelStateLive.pre_handoff_sent })` logo após `stripPreambleBeforePreHandoff` (linha ~2192) e antes do split por `|||`.
- Novo arquivo `supabase/functions/whatsapp-webhook/prehandoff_idempotency_test.ts` — testes Deno cobrindo: (a) bloco completo H1+H2+H3 com `preHandoffSent=true` → vira sufixo pós-handoff, (b) só H1 isolado → removido, (c) resposta híbrida (KB + H1 colado) → sobra só o KB, (d) `preHandoffSent=false` → passa intacto, (e) cobertura nas 4 línguas (pt/es/en/fr).

## Critérios de aceite

- Após `pre_handoff_sent=true`, o cliente nunca mais recebe "visión inicial / visão inicial / initial view / première vision".
- O fluxo pós-handoff continua respondendo a perguntas livres (KB) com o sufixo "aguarde um especialista" — sem o bloco de despedida grudado.
- Testes existentes (`bpmn3_handoff_test.ts`, `wave7_test.ts`, `opener_idempotency_test.ts`, etc.) continuam verdes.
- Sem migração SQL — usa flag `pre_handoff_sent` que já existe em `lead_funnel_state`.

## Validação

Rodar `supabase--test_edge_functions` apenas em `whatsapp-webhook`. Esperado: testes existentes verdes + ~5 novos verdes.
