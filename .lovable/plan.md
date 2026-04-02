

## Reformular Dialog de Edição para Espelhar o de Criação

### Problema
O dialog de edição atual (linhas 422-452) é minimalista — mostra apenas as variáveis e um textarea para o corpo. Precisa ter todos os campos do dialog de criação (linhas 454-646), com alerta de re-submissão obrigatória.

### O que será feito

Substituir o dialog de edição simples por um completo, igual ao de criação, com:

- **Nome do Template** (readonly, não editável)
- **Categoria** (SLA / Operacional)
- **Tipo de Automação** (dropdown ou input conforme categoria)
- **Idioma** (dropdown)
- **Categoria Meta** (UTILITY / MARKETING / AUTHENTICATION)
- **Corpo da Mensagem** (textarea com contador 0/1024)
- **Variáveis** (adicionar/remover com badges)
- **Preview** em tempo real (lado direito)
- **Dicas de aprovação Meta**

Ao clicar "Salvar", exibir um **AlertDialog de confirmação** com:
> "⚠️ Atenção: Ao alterar este template, ele deverá ser submetido novamente para aprovação da Meta. O prazo de retorno é de até 48 horas. Durante esse período, o template anterior deixará de funcionar. Deseja continuar?"

### Detalhes técnicos

- Adicionar estados de edição para todos os campos: `editCategory`, `editMetaCategory`, `editAutomationType`, `editLanguage`, `editVariables`, `editVariable`
- No `handleEdit`, popular todos os estados a partir do template selecionado
- No `handleSaveEdit`, mostrar AlertDialog antes de salvar; ao confirmar, chamar `updateTemplate.mutate` com todos os campos alterados e definir `status: 'draft'` para forçar re-submissão
- Reutilizar a mesma lógica de preview do dialog de criação
- Dialog de confirmação usa o `AlertDialog` já importado

### Arquivo modificado
- `src/pages/settings/WhatsAppTemplatesSettings.tsx`

