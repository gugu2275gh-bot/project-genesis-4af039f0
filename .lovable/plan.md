

## Remover referências ao Lovable dos avisos visíveis ao usuário

### Problema

Os diálogos de confirmação usam `window.confirm()` nativo, que exibe a URL do projeto Lovable no cabeçalho do browser. Isso expõe a marca "Lovable" ao usuário final.

### Solução

Substituir todos os `confirm()` nativos por `AlertDialog` do Radix UI (já disponível em `src/components/ui/alert-dialog.tsx`), que renderiza um modal customizado sem exibir a URL do domínio.

### Arquivos a alterar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/settings/WhatsAppTemplatesSettings.tsx` | Substituir `confirm()` por `AlertDialog` com estado para controlar qual template será excluído |
| `src/components/contracts/ContractNotesSection.tsx` | Substituir `confirm()` por `AlertDialog` para exclusão de notas |
| `src/pages/settings/DocumentTypesManagement.tsx` | Substituir `confirm()` por `AlertDialog` para exclusão de tipos de documento |

### Padrão de implementação

Em cada arquivo:
1. Adicionar estado `deletingId` (`string | null`)
2. O botão de excluir seta `deletingId` em vez de chamar `confirm()`
3. Renderizar um `AlertDialog` controlado por `deletingId !== null`
4. No botão "Confirmar" do AlertDialog, executar a mutation e limpar o estado

### Nota sobre referências internas

As referências em edge functions (`connector-gateway.lovable.dev`, `LOVABLE_API_KEY`) e comentários de código são infraestrutura interna, não visíveis ao usuário final — não serão alteradas.

