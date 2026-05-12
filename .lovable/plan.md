## Diagnóstico do caso real (lead Gustavo)

Sequência observada no banco:
1. Agente: "Antes de tudo, como é seu nome completo?"
2. Cliente: "Gustavo braga" → salvo em `contacts.full_name` com `name_source = USER_CONFIRMED` e `lead_funnel_state.name_confirmed = true`.
3. Agente: pediu e-mail.
4. Cliente: "O que é autorizacao de regresso" (saiu do fluxo).
5. Agente: re-pediu e-mail (correto).
6. Cliente: enviou e-mail.
7. Agente: pediu interesse.
8. Cliente: "Autorizacao de regresso" (resposta válida ao interesse).
9. Agente: "Ótima pergunta, já te explico em seguida! Antes de tudo, como é seu nome completo?" — REPETIU NOME.

Causa raiz: quando o cliente sai do roteiro (faz pergunta factual ou muda de assunto) e volta, o `Gate de Fluxo` é recalculado a cada turno e às vezes escolhe a primeira etapa pendente errada porque:
- o "done" de cada etapa é detectado por regex no histórico de mensagens da IA, não pelo estado já persistido em `lead_funnel_state`/`contacts`;
- as flags `nameMissing`/`emailMissing`/`serviceMissing` são calculadas no início e não consideram o que já está confirmado no funil;
- a diretiva "TRAVAS RÍGIDAS" do `buildStateDirective` é apenas um aviso ao LLM, não uma regra que o Gate respeite.

## Plano de correção

1. Tornar o estado persistente (`lead_funnel_state` + `contacts.name_source`/`email`) a única fonte de verdade do Gate
   - Substituir os "done" baseados em regex por leitura direta do funil para `NOME`, `E-MAIL`, `INTERESSE`, `LOCALIZAÇÃO`.
   - Manter o regex apenas como fallback complementar (não como gatekeeper único).

2. Hard-skip de etapas já confirmadas mesmo após divergência
   - O Gate nunca pode escolher como "próxima etapa" algo cujo flag no funil já está `true`.
   - Quando o cliente diverge e depois volta, o Gate continua exatamente da próxima etapa pendente real, sem reabrir nenhuma etapa anterior.

3. Trava determinística pós-IA (sem nova chamada ao modelo)
   - Antes de enviar a resposta final, se ela contiver pergunta de nome/e-mail/interesse/localização que já está confirmado, substituir pela próxima pergunta pendente computada a partir do funil — sem re-chamar a IA.

4. Sincronização imediata após detectar nome/e-mail/interesse no turno
   - Sempre que o webhook fizer backfill de nome/e-mail/interesse no contato ou no lead, atualizar `lead_funnel_state` no mesmo turno e recomputar `nameMissing`/`emailMissing`/`serviceMissing` antes de montar o prompt.

5. Tratar perguntas factuais do cliente sem reiniciar fluxo
   - Quando a mensagem do cliente é uma pergunta (não uma resposta), o Gate acolhe em uma frase ("Ótima pergunta, te explico já já") e repete SOMENTE a etapa pendente atual — nunca volta para uma etapa anterior já marcada como confirmada.

6. Regressões cobrindo o caso real
   - Teste 1: nome confirmado → cliente faz pergunta factual no lugar de responder o interesse → próxima resposta NÃO contém pergunta de nome nem de e-mail.
   - Teste 2: cliente alterna entre responder e divergir 3 vezes seguidas → nenhuma pergunta confirmada é repetida.
   - Teste 3: backfill simultâneo de nome e e-mail no mesmo turno → próximo prompt já parte de "interesse".

7. Validação
   - Rodar a suíte do `whatsapp-webhook` (`supabase--test_edge_functions`).
   - Conferir nos logs do edge function que cada turno loga `[GATE] step=...` consistente com o funil persistido.

## Detalhes técnicos

- Arquivos a editar:
  - `supabase/functions/whatsapp-webhook/index.ts` (cálculo do Gate, recomputo pós-backfill, trava pós-IA).
  - `supabase/functions/whatsapp-webhook/lib/funnel-state.ts` (helper para "próxima etapa pendente" reutilizável).
  - `supabase/functions/whatsapp-webhook/lib/overrides.ts` (extender `forceSkipFullNameIfAlreadyKnown` para também substituir por interesse/localização quando e-mail também já existe).
  - Novo arquivo de teste `supabase/functions/whatsapp-webhook/funnel_persistence_test.ts`.
- Sem mudanças de schema — `lead_funnel_state` e `contacts.name_source` já existem.