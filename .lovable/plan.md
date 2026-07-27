## Causa confirmada

A frase "Perfeito. Vou te fazer perguntas rápidas..." vem da etapa `msg_a1_fora_da_espanha_confirmar_cenario`, que no banco só tem a chave `pt-BR` em `messages` (sem `es`/`en`/`fr`). Sem tradução salva, o motor entrega o texto base em português mesmo com o idioma travado em espanhol.

A auditoria do fluxo mostrou que o problema não é isolado a essa etapa — outros textos também podem sair em português:
- `msg_a1_...`: mensagem principal sem ES/EN/FR.
- `msg_7_perguntar_localizacao`, `msg_b3_esta_empadronado`, `msg_b5_cidade...`, `msg_h1_h2_pre_handoff`, `msg_h3_...`, `msg_a1_...`: sem mensagens de reperguntar (`reask_messages`) traduzidas ou vazias.
- `msg_a3_europa_nos_ultimos_6_meses` e `msg_a4_familiar_europeu...`: opções `Sim/Não` sem `options_i18n` (hoje salvas só pela regra automática de binários).

Ou seja: cada tipo de texto do agente depende de tradução gravada manualmente, e qualquer lacuna vira vazamento de português.

## Solução: garantia de idioma em todos os pontos de fala

1. **Camada única de localização na saída**
   - Criar um utilitário compartilhado que TODA mensagem passa antes de ir ao WhatsApp/sandbox: mensagem da etapa, reperguntas, mensagens de resposta inesperada, reconhecimento, escalonamento/handoff, saudação, avisos de erro e rótulos de botões.
   - Regra: se existir texto no idioma travado, usa; se não existir, traduz na hora via IA (cascata já existente) e devolve traduzido.
   - Nunca envia o texto-base em outro idioma sem tentar traduzir primeiro; o texto original só é usado se a tradução falhar.

2. **Cache para não pagar tradução repetida**
   - Traduções geradas em tempo de execução são gravadas de volta na própria etapa (`messages`, `reask_messages`, `validation.options_i18n`), então cada texto é traduzido uma única vez.
   - Cache em memória por processo para evitar chamadas duplicadas na mesma conversa.

3. **Preenchimento das lacunas existentes**
   - Rodar uma passada única que completa ES/EN/FR em todas as etapas do fluxo ativo onde faltar: mensagens, reperguntas, textos de resposta inesperada e opções.

4. **Prevenção no editor**
   - Selo de alerta na etapa quando faltar algum idioma em qualquer campo de texto.
   - Botão "Traduzir pendências do fluxo" que completa tudo de uma vez.
   - Ao salvar uma etapa com texto novo em português, oferecer tradução automática dos campos alterados.

5. **Teste de regressão**
   - Teste no sandbox que percorre o fluxo inteiro em ES, EN e FR e falha se qualquer mensagem enviada permanecer idêntica ao texto em português (exceto textos intencionalmente iguais, como nomes próprios).

## Detalhes técnicos

- Novo `supabase/functions/_shared/flow-i18n.ts` com `localizeText()` / `localizeStepTexts()`; consumido por `flow-engine.ts`, `flow-ack.ts`, `flow-turn.ts` e pelo `whatsapp-webhook`.
- Reaproveita a cascata de tradução já existente (Gemini → Lovable AI Gateway), com timeout curto e fallback ao texto base.
- Escrita de cache nas colunas `messages` / `reask_messages` / `validation` de `ai_agent_flow_steps` via service role, em background (não bloqueia a resposta).
- UI: `FlowsManagement.tsx`, `StepInspector.tsx` e `StepRoutingEditor.tsx` para os selos e a ação em lote.
- Redeploy de `whatsapp-webhook` e `ai-agent-sandbox`. Sem alteração de schema.
