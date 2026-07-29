## O que aconteceu

Verifiquei no banco e no código:

- O agente de produção **AGENTE 2.0** está com `pre_handoff_flow_id` = fluxo **"teste aberto"** (confirmado na tabela `ai_agents`).
- O fluxo "teste aberto" tem 10 etapas, mas a **primeira etapa (`abertura_geral`) é do tipo `PERGUNTA_GERAL`** — não existe nenhuma etapa `INICIO` (confirmado em `ai_agent_flow_steps`).
- Em `supabase/functions/whatsapp-webhook/lib/visual-flow.ts` (linha 146), o plano só é considerado válido quando a etapa inicial é do tipo `INICIO`:
  `const enabled = !!start && stepKindOf(start) === 'INICIO'`
  Como `stepKindOf` converte `PERGUNTA_GERAL` em `PERGUNTA` (flow-engine.ts:275), a condição falha e o loader devolve `EMPTY_PLAN`, registrando "fluxo configurado sem etapa de INÍCIO válida — usando funil legado".

Resultado: o fluxo visual **não rodou**. A mensagem do cliente caiu no motor legado com `kb_strict_mode: true`, que não achou resposta na base e disparou o texto genérico "Não tenho essa informação no momento. Vou encaminhar…" — repetido duas vezes por causa do reenvio/retry do Twilio.

Detalhe secundário: o fluxo está com `status = 'RASCUNHO'`, e o seletor do agente permitiu escolhê-lo sem qualquer aviso.

## Correção proposta

1. **Aceitar fluxos que começam por pergunta** (`visual-flow.ts`)
   - Trocar a exigência rígida de `INICIO` por: o plano é válido se houver ao menos uma etapa e a etapa inicial for `INICIO`, `INFORMATIVA` ou `PERGUNTA` (inclui `PERGUNTA_GERAL`).
   - Manter o log de diagnóstico quando o fluxo realmente estiver vazio/inválido.
   - Conferir em `flow-engine.ts` (`startFlow`/`startFlowWithPrefill`) que o primeiro turno envia a mensagem da etapa inicial e **aguarda** a resposta quando ela é pergunta — ajustar se estiver auto-avançando.

2. **Aviso de rascunho na configuração do agente** (`AgentFormDialog.tsx`, aba Fluxo)
   - Mostrar um alerta quando o fluxo selecionado estiver em `RASCUNHO`, deixando claro que ele está em produção mesmo assim.

3. **Blindagem contra a repetição da mensagem genérica**
   - Verificar o caminho do fallback estrito de base (`kb_strict_mode`) para não reenviar a mesma frase em reentregas do Twilio dentro de uma janela curta (mesma proteção de idempotência já usada na saudação).

4. **Testes Deno**
   - Novo teste garantindo que um fluxo iniciado por `PERGUNTA_GERAL` retorna `enabled: true` e que o 1º turno envia a saudação/pergunta geral e aguarda a resposta.
   - Rodar a suíte existente de `whatsapp-webhook` e `_shared`.

5. **Deploy** das funções `whatsapp-webhook` e `ai-agent-sandbox`, e depois um teste real: mandar exatamente "tenho 34 anos, moro em Valencia, sou formado, minha avó é italiana, cheguei em maio, quero nacionalidade" e confirmar que o fluxo interpreta os campos e pula as perguntas já respondidas.

## Detalhes técnicos

- Arquivos afetados: `supabase/functions/whatsapp-webhook/lib/visual-flow.ts`, possivelmente `supabase/functions/_shared/flow-engine.ts`, `src/components/ai-agents/AgentFormDialog.tsx`, novo arquivo de teste.
- Sem migração de banco necessária: o fluxo "teste aberto" passa a funcionar como está. Opcionalmente posso também promovê-lo de `RASCUNHO` para `ATIVO` — me diga se quer.
