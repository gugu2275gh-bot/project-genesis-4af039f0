## Causa da quebra ao traduzir (confirmada no código)

`src/hooks/useAgentTranslate.ts:17` chama `supabase.auth.refreshSession()` antes de invocar a edge function. Isso dispara `TOKEN_REFRESHED` no `AuthContext` (`src/contexts/AuthContext.tsx:59-72`), que faz `setLoading(true)`. Com `loading = true`, tanto `ProtectedRoute` (`src/App.tsx:76-81`) quanto `AIAgents` (`src/pages/ai-agents/AIAgents.tsx:44`) substituem a árvore por um spinner — o editor é desmontado no meio da tradução e o rascunho não salvo (etapas, ligações, posições) se perde.

O mesmo padrão existe em `useAIAgents.ts`, `KnowledgeBaseManager.tsx` e `ContractGroupsSection.tsx`.

## Correção

1. **AuthContext** — só `loading = true` na carga inicial/login. Em `TOKEN_REFRESHED` e `USER_UPDATED`, atualizar sessão em segundo plano, sem recarregar perfil/papéis se o usuário for o mesmo.
2. **Guardas de rota** — `ProtectedRoute` e `AIAgents` mostram spinner apenas quando ainda não há usuário conhecido; revalidações não desmontam a tela.
3. **Hook de tradução** — remover o `refreshSession()` obrigatório (o cliente renova sozinho); renovar só se o token estiver realmente expirado. Mesmo ajuste nos demais pontos que chamam `refreshSession()` antes de `functions.invoke`.
4. **MultiLangField** — ignorar chaves não-string vindas do modelo, preservar o texto base em caso de falha, ignorar resposta se o componente foi desmontado, erro só via toast.
5. **Tradução das opções de resposta** — adicionar tradução automática também para rótulos de ramificações e para a lista de "Opções oferecidas", gravando por idioma sem quebrar o casamento de resposta (o valor de comparação continua sendo o do idioma base, com os sinônimos traduzidos aceitos no runtime).

## Validação completa do editor

Auditar e testar cada opção do editor visual, corrigindo o que falhar:

- **Canvas**: criar etapa, mover (posições por id), auto-organizar, zoom/minimapa, selecionar/desselecionar, excluir por ícone e por tecla Delete, desfazer ligações.
- **Ligações**: conectar saída padrão e saídas por ramificação, reapontar, destino inexistente, remoção em cascata ao excluir etapa.
- **Inspetor**: renomear código (remapeia referências), código duplicado/vazio, nome, tipo de etapa, tipo de resposta, múltiplas mensagens (adicionar/remover/reordenar), reperguntas, validações (obrigatório, formato, min/max, tentativas, modo de pular), comportamento (handoff, pergunta paralela, resposta livre), geração de ramificações.
- **Multi-idioma**: abas pt-BR/es/en/fr, tradução por campo, campos vazios, texto com emojis e marcadores `{{VAR}}`.
- **Importação Bizagi**: modos substituir e acrescentar, códigos duplicados, posições.
- **Salvamento**: novas etapas (`tmp_` → id real), atualização, exclusão, posições, aviso de alterações não salvas, fechar diálogo, alternar canvas/tabela, salvar com erros de validação.
- **Resiliência**: `FlowErrorBoundary` ativo; nenhuma ação assíncrona (tradução, salvar, importar) pode fechar o editor ou zerar o rascunho.

## Como verifico

- Typecheck do projeto.
- Testes unitários (Vitest) para os helpers de fluxo: código único, renomeio com remapeamento, posições, mensagens multi-idioma, ramificações e validação do grafo.
- Testes de componente do inspetor cobrindo tradução (sucesso e falha) e edição de opções.
- Execução no preview com Playwright para o que depender de interação real; o login automatizado não está disponível neste projeto (Supabase externo), então os pontos que exigem sessão ficam para sua conferência final, listados explicitamente no fim.
