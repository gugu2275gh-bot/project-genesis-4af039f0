## Por que você não vê "Ramificações"

A tela do print é o **formulário simples de etapa** (lista "Etapas" → editar) em `src/components/ai-agents/FlowsManagement.tsx`. Ele só tem "Próxima etapa (código)" — um destino único e digitado à mão. Tudo que muda a direção do fluxo (ramificações, opções, botões) hoje só existe no **Editor visual**. A proposta é trazer esse controle completo para o formulário simples também.

## O que será feito

### 1. Bloco "Respostas e caminhos" no formulário de etapa
Substitui o par "Próxima etapa (código)" + "Validação (JSON)" por controles visuais:

- **Tipo de resposta** (já existe) passa a comandar o bloco abaixo:
  - `SIM_NAO` → gera automaticamente as opções Sim / Não
  - `SELECAO` / `BOTOES` / `MULTIPLA_ESCOLHA` → editor de **Opções** (adicionar, renomear, reordenar, excluir), com aviso quando exceder o limite de botões do WhatsApp
  - `TEXTO_LIVRE`, `EMAIL`, `NUMERO`, `DATA`, `NOME` → sem opções, apenas ramificações por conteúdo (contém / regex / intenção)
- **Opções → caminhos**: cada opção vira uma linha com destino próprio, sem precisar criar a ramificação manualmente. Botão "Sincronizar opções com caminhos" cria o que faltar e sinaliza caminhos órfãos.

### 2. Editor de caminhos (ramificações)
Cada linha contém:
- **Rótulo** (texto exibido no botão/opção)
- **Comparação**: É igual a · Contém · Expressão regular · Intenção (IA) · Qualquer resposta
- **Valor**
- **Equivalentes aceitos** (sinônimos em outros idiomas) com botão **Traduzir** (preenche es/en/fr automaticamente)
- **Vai para…**: select com os códigos das outras etapas do fluxo (nada digitado à mão)
- Excluir caminho

### 3. Saídas complementares que também mudam a direção
- **Próxima etapa padrão (senão)** → vira select de etapas (hoje é input livre)
- **Etapa de repergunta / fallback** após exceder as tentativas (`max_reasks`), com select de destino
- **Encaminhar para humano nesta etapa** (handoff) já existente, agora exibido junto do bloco de saídas para ficar claro que encerra o caminho
- **Não repetir esta etapa** (pular se campo já preenchido / etapa concluída / uma vez por contato) e **Salvar resposta no campo**, hoje escondidos dentro do JSON

### 4. Validação sem JSON
O campo "Validação (JSON)" vira um bloco de campos (obrigatória, formato esperado, regex, mínimo, máximo, reperguntas), com o JSON bruto disponível em um "Avançado" recolhido para quem quiser editar direto.

### 5. Conferência na lista de etapas
Nova coluna **Caminhos** na tabela, mostrando o resumo (`sim → msg_a1…`, `nao → msg_b1…`) e um alerta quando algum caminho aponta para etapa inexistente ou sem destino.

## Como ficará a sua etapa 5

Em `msg_7_perguntar_localizacao` (Tipo de resposta = Sim/Não):
- `sim` → `msg_a1_fora_da_espanha_confirmar_cenario`
- `nao` → `msg_b1_na_espanha_confirmar_situacao`
- Traduzir preenche `sí/yes/oui` e `no/non`, garantindo o funcionamento nos 4 idiomas.

## Detalhes técnicos

- Arquivo principal: `src/components/ai-agents/FlowsManagement.tsx` (`StepDialog` + tabela de etapas). O editor de caminhos/opções será extraído para um componente reutilizável, compartilhado com `flow-builder/StepInspector.tsx`, para as duas telas nunca divergirem.
- Reutiliza `normalizeBranches`, `BRANCH_MATCH_TYPES`, `ANSWER_FORMATS`, `SKIP_MODES` e `FlowBranch` de `src/types/ai-agent-flow-builder.ts`, e o hook `useAgentTranslate`.
- Persistência nas colunas já existentes de `ai_agent_flow_steps` (`branches`, `next_step_code`, `validation`, `handoff`) — **sem migração de banco**.
- Motor `supabase/functions/_shared/flow-engine.ts`: sem mudança para ramificações e opções; será ajustado apenas se adotarmos a "etapa de fallback após reperguntas" (hoje o motor só repergunta, não desvia). Cobrirei isso com testes Deno.
