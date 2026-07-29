## O que está acontecendo

A configuração de campos obrigatórios vive na seção **Interpretação** da etapa do tipo "Pergunta geral" (componente `StepGeneralCaptureEditor`). Hoje ela só é renderizada no **editor visual de fluxo** (`StepInspector`, aba "Interpretação").

O diálogo que aparece nas suas telas — "Editar etapa", aberto pela **lista de etapas** — não renderiza esse componente em lugar nenhum. Por isso você não encontra a aba: nessa tela ela realmente não existe.

Além disso, nesse mesmo diálogo as seções "Base de conhecimento" e "Resposta diferente do esperado" só aparecem quando o tipo é `PERGUNTA` — etapas `PERGUNTA_GERAL` ficam sem elas também.

## O que vou fazer

1. **`FlowsManagement.tsx` (diálogo "Editar etapa")**
   - Quando o tipo da etapa for **Pergunta geral**, inserir logo abaixo de "Validação da resposta" um bloco **"Interpretação e campos obrigatórios"** com o `StepGeneralCaptureEditor` já existente (mesmo componente do editor visual, gravando em `validation.general_capture`).
   - Liberar as seções "Base de conhecimento" e "Resposta diferente do esperado" também para `PERGUNTA_GERAL` (hoje só `PERGUNTA`).

2. **Lista de etapas (tabela)**
   - Adicionar um badge "Obrigatórios: idade, cidade…" (ou "Sem obrigatórios") na linha das etapas do tipo Pergunta geral, para dar visibilidade sem precisar abrir a etapa.

3. **Editor visual (`StepInspector`)**
   - Renomear a aba "Interpretação" para **"Interpretação / obrigatórios"**, para ficar óbvio onde marcar os campos.

## Onde você vai ver depois

- Lista de etapas → badge com os campos obrigatórios de cada "Pergunta geral".
- "Editar etapa" (lista) → seção "Interpretação e campos obrigatórios", com o resumo no topo e um checkbox **"Obrigatório — perguntar antes de seguir/transferir"** em cada dado marcado.
- Editor visual → aba "Interpretação / obrigatórios" (mesmo conteúdo).

## Detalhes técnicos

- Nenhuma mudança de schema: `required` já existe em `StepGeneralCapture.fields[]` e o motor (`flow-required.ts` / `flow-turn.ts` / `visual-flow.ts`) já lê esse campo.
- Alterações apenas em: `src/components/ai-agents/FlowsManagement.tsx` e `src/components/ai-agents/flow-builder/StepInspector.tsx`.
