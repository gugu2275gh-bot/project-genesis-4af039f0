## Objetivo

Substituir o cadastro de etapas em tabela por um **editor visual de fluxo (canvas drag-and-drop)** dentro de "Fluxo de atendimento", com nós representando etapas, conexões representando respostas possíveis, e um painel lateral para configurar pergunta, validações e comportamento de cada etapa.

## O que sugiro

### 1. Canvas visual (React Flow)
- Adicionar `@xyflow/react`.
- Nova aba/modo "Editor visual" ao abrir um fluxo (mantendo a lista em tabela como visão alternativa).
- Nó = etapa, com badges: código, tipo de resposta, fase (Pré-handoff/Handoff), ícone se é handoff, ícone se é etapa final.
- Nó especial "Início" e nó "Handoff / Fim".
- Arrastar para posicionar, conectar saídas → próxima etapa, deletar/duplicar nó pelo próprio canvas.
- Botão "Auto-organizar" para layout automático em cascata.

### 2. Respostas possíveis e ramificações
Hoje cada etapa só tem um `next_step_code` (fluxo linear). Para desenhar de verdade:
- Nova coluna `branches` (jsonb) em `ai_agent_flow_steps`: lista de `{ id, label, match_type (IGUAL/CONTÉM/REGEX/QUALQUER/INTENÇÃO), value, next_step_code }`.
- Cada ramificação vira uma **saída (handle) do nó** no canvas; ligar essa saída a outro nó grava o `next_step_code` da ramificação.
- `next_step_code` continua como caminho padrão ("senão").
- Para tipos SIM_NAO / SELECAO / BOTOES, as opções geram ramificações automaticamente.

### 3. Configuração da etapa (painel lateral ao clicar no nó)
- **Pergunta**: mensagens multi-idioma (reaproveita `MultiLangField` + tradução automática).
- **Respostas**: tipo de resposta, opções (para seleção/botões), ramificações.
- **Validações**: obrigatório, formato (e-mail, número, data DD/MM/YYYY, telefone como texto), mín/máx, regex, nº de reperguntas antes de fallback, mensagem de repergunta por idioma — gravado em `validation`.
- **Comportamento**: permite pergunta paralela, permite resposta livre, salvar resposta em campo do lead (`save_to_field`), marcar como handoff, condição de saída.

### 4. Não repetir etapas já concluídas
- Novo bloco por etapa: `skip_if` — "pular se o campo X já estiver preenchido" / "pular se etapa Y já concluída" / "perguntar apenas uma vez por contato" (`ask_once`).
- Gravado em `validation`/`branches` (jsonb), exibido como badge no nó ("pula se já respondido").
- Nesta etapa isso é **configuração + visualização**; a execução no webhook de produção não é alterada (conforme regra de não mexer no agente ativo) — fica disponível para o runtime consumir depois.

### 5. Validação do desenho
Painel "Problemas do fluxo" mostrando em tempo real:
- etapas sem conexão de entrada (órfãs), etapas sem saída e sem handoff,
- códigos duplicados, referências a etapas inexistentes,
- **ciclos** (loop infinito) — que é a causa do tipo de problema já visto em produção,
- ramificações sem destino.

### 6. Persistência
- Nova coluna `canvas` (jsonb) em `ai_agent_flows` para posições dos nós e viewport.
- Salvamento explícito ("Salvar fluxo") gravando posições + etapas + ramificações em lote.

## Detalhes técnicos

- Migração: `ALTER TABLE ai_agent_flow_steps ADD COLUMN branches jsonb DEFAULT '[]'`, `ALTER TABLE ai_agent_flows ADD COLUMN canvas jsonb DEFAULT '{}'` (RLS/grants existentes permanecem).
- Novos arquivos: `src/components/ai-agents/flow-builder/FlowCanvas.tsx`, `StepNode.tsx`, `StepInspector.tsx`, `flow-validation.ts`, `flow-layout.ts`.
- `FlowsManagement.tsx` ganha alternância "Tabela | Editor visual"; hooks `useSaveFlowStep`/`useFlowSteps` reutilizados, mais um `useSaveFlowCanvas` para salvamento em lote.
- Tipos em `src/types/ai-agents.ts`: `FlowBranch`, `StepValidation`, `FlowCanvas`.
- Nenhuma alteração no `whatsapp-webhook` nem no fluxo real do AGENTE 1.0.
