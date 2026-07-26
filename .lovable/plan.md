## Problema

Ao clicar em **Etapas**, o editor visual até é montado, mas ele é renderizado em um card **no final da página**, abaixo dos cards "Pré-handoff" e "Handoff". Como a página não rola nem dá qualquer sinal visual, parece que "nada acontece". O lápis abre o diálogo de dados do fluxo (nome/descrição/fase/status) — esse é o comportamento correto, mas hoje é o único retorno visível.

## O que vou fazer

1. **Editor em tela cheia**: clicar em "Etapas" passa a abrir o editor visual em um painel full-screen (dialog de largura total, ~90% da altura), com cabeçalho mostrando o nome e a fase do fluxo e botão de fechar. Sem depender de rolagem.
2. **Botão mais claro**: renomear "Etapas" para "Abrir editor" (com ícone de fluxo) e manter uma opção "Ver em tabela" dentro do editor.
3. **Altura garantida do canvas**: o React Flow recebe altura explícita dentro do painel, evitando canvas de 0px (caso em branco).
4. **Estado vazio útil**: quando o fluxo não tiver etapas, o canvas mostra uma chamada "Criar primeira etapa" em vez de área vazia.
5. **Atalho no diálogo de edição**: no diálogo "Editar fluxo", adicionar um botão "Editar etapas" que fecha o diálogo e abre o editor visual.

## Detalhes técnicos

- `src/components/ai-agents/FlowsManagement.tsx`: mover `<FlowSteps flow={current} />` para dentro de um `Dialog`/`Sheet` full-screen controlado por `selected`; ajustar rótulos dos botões.
- `src/components/ai-agents/flow-builder/FlowCanvas.tsx`: container com `h-full min-h-[520px]` e empty-state com CTA de criar etapa.
- Nenhuma mudança de banco de dados ou de runtime do agente.
