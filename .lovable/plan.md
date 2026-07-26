## O que está acontecendo

Existem hoje **dois editores de etapa** no módulo de Fluxos:

1. **Editor visual (canvas)** → painel lateral `StepInspector`, que **já tem** a aba **Base** com "Validar a resposta na base de conhecimento" e o switch "Resposta humanizada gerada pela IA" (na aba Validação).
2. **Ver em tabela → botão de lápis** → abre o diálogo antigo `StepDialog`, que **não tem** esses campos.

Se você está editando pelo lápis da tabela, a opção realmente não aparece. Além disso, no painel do canvas a barra tem 6 abas espremidas em coluna estreita, o que faz "Base" e "Resposta inesperada" ficarem cortadas e difíceis de notar.

## O que será feito

1. **Adicionar a checagem na base de conhecimento ao editor em tabela**
   - No diálogo de edição de etapa (visão tabela), incluir o mesmo bloco `StepKnowledgeCheckEditor`: ativar/desativar a validação na base, nº de tentativas, ação quando inválida (explicar e repergunta / seguir mesmo assim / encaminhar) e a mensagem multilíngue de resposta inválida.
   - Incluir também o switch **"Resposta humanizada gerada pela IA"** (`ack_ai`) nesse diálogo, salvando no mesmo campo `validation` já usado pelo canvas — assim os dois editores ficam equivalentes e o backend não muda.
   - Ambos os blocos só aparecem quando o tipo da etapa é **Pergunta** (com aviso explicativo caso contrário).

2. **Melhorar a visibilidade das abas no editor visual**
   - Trocar o `grid-cols-6` da barra de abas do `StepInspector` por uma lista com rolagem horizontal e rótulos legíveis, para "Base" não ficar truncada.
   - Renomear o rótulo para **"Base de conhecimento"** (abreviado quando o espaço for curto), deixando claro o propósito.

## Detalhes técnicos

- Arquivos afetados: `src/components/ai-agents/FlowsManagement.tsx` (componente `StepDialog`) e `src/components/ai-agents/flow-builder/StepInspector.tsx`.
- Reutiliza `StepKnowledgeCheckEditor` e a normalização `normalizeKbCheck` de `src/types/ai-agent-flow-builder.ts`.
- Sem alteração de schema, edge functions ou do `flow-engine` — a persistência continua no JSON `validation` da etapa (`validation.kb_check` e `validation.ack_ai`), já lido pelo runtime.
