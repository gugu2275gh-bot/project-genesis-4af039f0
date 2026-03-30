

## Adicionar indicadores coloridos por status nos templates

Alterar o `STATUS_CONFIG` para usar cores explícitas (verde/azul/vermelho) em vez dos variants genéricos do Badge, e adicionar um indicador visual circular colorido ao lado de cada template.

### Alteração em `src/pages/settings/WhatsAppTemplatesSettings.tsx`

1. **Atualizar `STATUS_CONFIG`** — adicionar classes de cor customizadas:
   - `approved` → fundo verde (`bg-green-100 text-green-700 border-green-300`)
   - `pending` → fundo azul (`bg-blue-100 text-blue-700 border-blue-300`)
   - `draft` → fundo azul claro (`bg-blue-50 text-blue-600 border-blue-200`)
   - `rejected` → fundo vermelho (`bg-red-100 text-red-700 border-red-300`)
   - `error` → fundo vermelho (`bg-red-100 text-red-700 border-red-300`)

2. **Adicionar bolinha colorida na linha** — um `div` circular (8x8px) com cor sólida à esquerda do nome do tipo:
   - Verde (`bg-green-500`) para aprovado
   - Azul (`bg-blue-500`) para pendente/rascunho
   - Vermelho (`bg-red-500`) para rejeitado/erro

3. **Substituir `<Badge variant={...}>`** por `<span className={customClasses}>` com as cores definidas acima para o badge de status.

### Arquivo afetado
| Arquivo | Mudança |
|---------|---------|
| `src/pages/settings/WhatsAppTemplatesSettings.tsx` | Cores customizadas no STATUS_CONFIG, bolinha indicadora na coluna Tipo, badge com classes de cor |

