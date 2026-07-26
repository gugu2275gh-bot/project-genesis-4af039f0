## Objetivo

Hoje o WhatsApp de produção ignora os fluxos desenhados: `whatsapp-webhook` roda o funil legado em código (`flow-machine.ts` + `turn-orchestrator.ts` + textos do agente). Os campos `pre_handoff_flow_id` / `handoff_flow_id` / `flow_id` do agente só são lidos pelo simulador (`ai-agent-sandbox`). O objetivo é: **quando o agente de produção tiver fluxo configurado, o motor determinístico do fluxo comanda o atendimento; o funil legado só roda quando nenhum fluxo estiver configurado.**

## Escopo aprovado

- Fluxo substitui **todo o pré-handoff** (perguntas, validações, ramificações, reperguntas). O LLM só entra depois do fluxo terminar (modo livre / base de conhecimento).
- Etapas ganham um campo configurável **"Salvar resposta em"** para alimentar o CRM.
- Ao terminar o pré-handoff, o **fluxo de handoff é encadeado automaticamente**.

## O que será feito

### 1. Banco de dados
- `ai_agent_flow_steps`: nova coluna `field_mapping text` (nulo = não salva em campo).
- `lead_funnel_state`: nova coluna `visual_flow_state jsonb default '{}'` para guardar `current_step`, `answers`, `lang`, `reask_count`, `finished`, `path`.
- Grants/RLS seguem os padrões já existentes nessas tabelas.

### 2. Motor de fluxo compartilhado (`_shared/flow-engine.ts`)
- Suporte a **encadeamento de fluxos**: quando o pré-handoff termina (etapa `FIM`/`handoff = true`), o motor inicia o fluxo de handoff sem perder o estado.
- Exposição do `field_mapping` no resultado do turno, para o chamador persistir os valores.
- Continua determinístico: mensagens exatas, `validation`, `branches`, `next_step_code`, `fallback_step_code`, datas DD/MM/AAAA e detecção de idioma já implementadas.

### 3. Produção (`whatsapp-webhook`)
- Carregar, junto com o agente de produção, as etapas de `pre_handoff_flow_id`, `handoff_flow_id` e `flow_id`.
- Se houver etapa de INÍCIO válida e `runtime_config.execute_visual_flow !== false`:
  - **bypass** de `decideTurn` / `flow-machine` / heurísticas de nome, e-mail, localização, empadronado e pré-handoff;
  - o turno é resolvido por `startFlow` / `advanceFlow`, e as mensagens do fluxo são enviadas via o mesmo dispatcher de WhatsApp atual (respeitando janela de 24h e templates);
  - estado salvo em `lead_funnel_state.visual_flow_state`; `pre_handoff_sent` / `handoff_sent` continuam sendo marcados para os SLAs e notificações existentes.
- Sem fluxo configurado → comportamento atual intacto (fallback total).
- Depois do fluxo (handoff concluído): modo livre com LLM/KB, exatamente como hoje.

### 4. Persistência das respostas no CRM
- Cada resposta validada com `field_mapping` preenchido grava no destino correspondente (`contacts.full_name`, `contacts.email`, `lead_funnel_state.location_known`, `entry_date_confirmed`, `empadronado_confirmed`, `empadronado_city`, `interest_confirmed`, entre outros).
- Todas as respostas, mapeadas ou não, ficam também em `lead_funnel_state.answers` pelo `step_code`.

### 5. UI
- `StepInspector` (editor visual) e o diálogo de etapa da tabela ganham o seletor **"Salvar resposta em"** com a lista de campos do CRM.
- Na tela do agente, indicar claramente que, havendo fluxo selecionado, ele **tem precedência** sobre prompts/heurísticas do pré-handoff.

### 6. Simulador
- `ai-agent-sandbox` passa a carregar também o `handoff_flow_id` e a usar o mesmo encadeamento, garantindo paridade simulador ↔ produção.

### 7. Testes
- Testes Deno: fluxo assume o pré-handoff, encadeia handoff, grava `field_mapping`, ignora heurísticas legadas, e fallback para o legado quando não há fluxo.
- Regressões existentes do webhook devem continuar passando.

## Detalhes técnicos

- Ponto de corte em `whatsapp-webhook/index.ts` logo antes de `decideTurn` (linha ~1516): se `visualFlowEnabled`, resolve o turno pelo motor e pula todo o bloco legado até o dispatcher.
- `resolveFlowLanguage` continua definindo o idioma já na 1ª mensagem.
- Idempotência preservada: dedupe de mensagens e `pre_handoff_sent` / `handoff_sent` continuam bloqueando reenvios.
