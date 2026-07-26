## Plano

1. **Corrigir o estado visual da tradução**
   - Garantir que o botão de tradução sempre saia do estado “Traduzindo…”/carregando mesmo se o componente for fechado, o painel trocar de etapa ou a chamada retornar sem alterações visíveis.
   - Evitar atualizações com valores antigos do formulário depois que a chamada assíncrona termina.

2. **Aplicar tradução de forma confiável nas mensagens**
   - Ajustar `MultiLangField` para usar o valor mais recente no momento em que a tradução retorna.
   - Preservar o texto em português e preencher `Espanhol`, `Inglês` e `Francês` sem apagar alterações manuais já feitas durante a chamada.

3. **Corrigir tradução das respostas/opções**
   - No inspetor de etapa, trocar a atualização baseada em uma lista antiga de ramificações por atualização funcional/segura.
   - Adicionar proteção para não deixar a ramificação travada se a tradução falhar ou se a etapa mudar durante a tradução.

4. **Melhorar feedback de erro**
   - Se a função Edge retornar sucesso, mas nenhuma tradução aplicável ao campo atual, mostrar aviso claro em vez de parecer que “não traduziu”.
   - Manter o toast de erro atual para falhas reais da função.

5. **Validar**
   - Conferir via logs/rede que `ai-agent-translate` retorna `200` e que a UI aplica o resultado nas abas dos idiomas.
   - Testar o caso do print: texto em Português na mensagem da etapa e clique em “Traduzir para os outros idiomas”.

## Detalhes técnicos

- A rede mostra chamadas `POST /functions/v1/ai-agent-translate` com status `200` e traduções retornadas, então a correção deve focar na aplicação do resultado no estado do editor, não na função de tradução em si.
- Arquivos previstos:
  - `src/components/ai-agents/MultiLangField.tsx`
  - `src/components/ai-agents/flow-builder/StepInspector.tsx`
  - se necessário, pequeno ajuste em `src/hooks/useAgentTranslate.ts` para mensagens de erro mais claras.