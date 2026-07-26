## Diagnóstico (verificado no código)

O editor visual (`FlowCanvas.tsx`, `StepNode.tsx`, `StepInspector.tsx`, `useSaveFlowCanvas`) tem falhas estruturais que explicam as quebras — inclusive "mover uma etapa quebra":

1. **Posições guardadas pelo `step_code`, não pelo id** (`FlowCanvas.tsx:66,97,147`). Ao arrastar, o handler reconstrói o mapa inteiro de posições a cada evento; qualquer etapa com código vazio ou duplicado colide ou é perdida e o nó salta para `{0,0}`. Renomear o código no inspetor também apaga a posição.
2. **Nós recriados a cada movimento** — o `useMemo` de `nodes` depende de `positions`, que muda a cada pixel do arrasto; o React Flow perde estado interno (dimensões/seleção), gerando o "tremor"/salto observado.
3. **Estado local é sobrescrito por refetch** (`useEffect` em `FlowCanvas.tsx:75`): qualquer invalidação do React Query (salvar, voltar à aba, refoco da janela) recarrega `savedSteps` e **descarta as alterações não salvas** sem aviso.
4. **Renomear o código quebra as ligações**: as outras etapas continuam apontando para o código antigo, virando "etapa aponta para X que não existe".
5. **Códigos duplicados**: `etapa_${n}` é gerado por contagem; após excluir e criar de novo, gera código repetido → arestas erradas (o mapa de arestas é por código).
6. **Ramificações automáticas em loop** (`StepInspector.tsx:54-72`): para `SIM_NAO`/seleção, o efeito recria as ramificações apagadas ou renomeadas, tornando impossível excluir/editar uma opção.
7. **Salvar sem trava de erro** e sem aviso de alterações pendentes ao fechar a tela cheia; um erro no meio do laço de `update/insert` deixa o fluxo meio salvo.

## O que será feito

**A. Reescrever o núcleo de estado do canvas**
- Posições passam a ser indexadas pelo **id da etapa** (com migração automática das posições antigas por código na leitura, e regravação no formato novo).
- Usar o padrão oficial do React Flow (estado de nós mantido e atualizado por `applyNodeChanges`), aplicando só as mudanças recebidas em vez de recriar tudo; nós ficam estáveis durante o arrasto.
- `data` do nó com callbacks estáveis (ref) para o `memo` do `StepNode` voltar a funcionar.

**B. Não perder trabalho**
- Só sincronizar com os dados do servidor quando não houver alterações pendentes (ou ao trocar de fluxo); caso contrário manter o rascunho e mostrar aviso "há alterações não salvas".
- Confirmação ao fechar o editor em tela cheia com alterações pendentes.

**C. Integridade dos códigos e ligações**
- Renomear o código de uma etapa remapeia automaticamente `next_step_code` e `branches.next_step_code` de todas as outras etapas.
- Geração de código único (sufixo incremental) e bloqueio/normalização de código vazio ou duplicado (aviso no inspetor).
- Arestas passam a ser construídas de forma resiliente a códigos repetidos.

**D. Inspetor sem loops**
- Ramificações automáticas geradas **uma vez** por tipo de resposta (com marcação de "geradas automaticamente"), com botão "Gerar opções" manual; o usuário pode excluir/editar sem recriação.
- Correções de edição de mensagens múltiplas (remover a última mensagem, listas vazias) e de campos numéricos.

**E. Robustez geral**
- `ErrorBoundary` em volta do canvas: se algo falhar, mostra mensagem e botão "recarregar editor" em vez de tela branca.
- Salvamento em bloco mais seguro: normaliza etapas (código, order_index, mensagens), avisa quando há erros de validação antes de salvar e reporta a etapa exata em caso de falha.

**F. Verificação**
- Testes unitários para: layout automático, validação, remapeamento de código, aplicação de movimento de nó e normalização de mensagens/ramificações.
- Teste de interação no preview (arrastar etapa, criar, renomear código, excluir, importar Bizagi, salvar e reabrir) com capturas de tela.

## Observações técnicas

Arquivos afetados: `src/components/ai-agents/flow-builder/FlowCanvas.tsx` (reescrita do estado), `StepNode.tsx`, `StepInspector.tsx`, `src/types/ai-agent-flow-builder.ts` (helpers de remapeamento/códigos), `src/lib/flow-validation.ts`, `src/hooks/useAIAgents.ts` (`useSaveFlowCanvas`), `src/components/ai-agents/FlowsManagement.tsx` (guarda de fechamento). Sem mudanças de banco de dados: o formato novo de `canvas.positions` é retrocompatível com o antigo.
