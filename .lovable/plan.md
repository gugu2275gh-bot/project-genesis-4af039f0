## O que validei

Li o bypass em `whatsapp-webhook/index.ts` (linhas ~1500-1606), a ponte `lib/visual-flow.ts` e o motor `_shared/flow-engine.ts`.

Funciona como esperado: quando o agente de produção aponta um fluxo com etapa de INÍCIO válida, o motor determinístico roda, grava `visual_flow_state`, aplica `field_mapping` no CRM, envia as mensagens e retorna antes do funil legado.

Mas a validação encontrou **6 pontos onde o atendimento pode sair do fluxo antes dele terminar**. Todos são reais no código atual:

1. **O bypass está dentro do `if (botEnabled && geminiApiKey && ...)`** (linha 1401). Se a chave da IA falhar ou o bot for desligado, um cliente no meio do fluxo cai no comportamento legado. O fluxo é determinístico e não precisa de LLM para rodar.
2. **Silêncios automáticos pausam o fluxo** (linhas 1280-1332): se o cliente responder "ok", "obrigado", "vale", "gracias" ou só emoji, a IA é pausada — mas essas podem ser respostas legítimas de uma etapa do fluxo (ex.: confirmação Sim/Não).
3. **Reativação inteligente** (linhas 1118-1192): `DIRECT_ROUTE`/`SEND_MESSAGE` marcam `skipAIAgent = true` e mandam mensagem própria, atropelando um fluxo em andamento.
4. **Desambiguação de setor** (linha ~996) envia mensagem de menu numerado no meio do fluxo.
5. **Fallback silencioso para o legado**: qualquer erro dentro do bloco (`catch` da linha 1604), ou um turno que não gere mensagem, devolve o cliente ao funil legado mesmo com fluxo já iniciado.
6. **Sandbox x produção**: o simulador já usa `mergeFlows`, mas não replica essas travas, então o teste pode passar e a produção desviar.

## O que proponho fazer

**A. Trava dura de fluxo ativo (núcleo)**
- Carregar `visual_flow_state` e o plano do fluxo **antes** de reativação, desambiguação, buffers e checagens de pausa.
- Criar a condição `flowActive = plano habilitado && fluxo não finalizado`.
- Enquanto `flowActive`: pular reativação inteligente, desambiguação de setor, silêncio por "ok/obrigado" e a dependência de `botEnabled`/chave da IA. Continuam valendo apenas as proteções que evitam mensagem duplicada (buffer de mensagens novas, anti-duplicidade e lock concorrente) e a pausa real por atendente humano (`origem = SISTEMA`), que é intervenção humana explícita.

**B. Sem saída acidental para o legado**
- Com fluxo iniciado e não finalizado, o handler termina o turno no motor de fluxo, mesmo se o turno não gerar mensagem (loga e sai em silêncio, em vez de cair no funil antigo).
- Erros dentro do bloco passam a re-perguntar a etapa atual / sair em silêncio, sem repassar o turno para o legado — o estado do fluxo é preservado.

**C. Saída controlada só no fim**
- O legado (ou o modo livre com LLM) só volta a comandar quando `finished = true`, sinalizado explicitamente no `visual_flow_state` e no funil (`step = 'livre'`, `handoff_sent` quando aplicável).

**D. Paridade e testes**
- Aplicar o mesmo encadeamento pré-handoff → handoff no simulador.
- Testes Deno cobrindo: fluxo com resposta "ok"/"obrigado" no meio (não pode pausar), fluxo com falha da IA (deve continuar), erro na aplicação de campos do CRM (não pode desviar), reinício de fluxo já finalizado (não pode reiniciar) e conclusão com handoff.

## Detalhes técnicos

- `loadVisualFlowPlan` passa a ser chamado logo após resolver `lead`/`contact`, com cache na requisição, e a flag `flowActive` propaga por todo o handler.
- `runtime_config.execute_visual_flow = false` continua sendo o escape manual para voltar ao legado.
- Nenhuma mudança de schema é necessária: `visual_flow_state` e `field_mapping` já existem.
- Arquivos: `supabase/functions/whatsapp-webhook/index.ts`, `.../lib/visual-flow.ts`, `supabase/functions/ai-agent-sandbox/index.ts` e novo `_shared/flow-engine_strict_test.ts`.
