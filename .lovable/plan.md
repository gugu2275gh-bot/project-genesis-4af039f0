

## Correção P1 simplificada: Remover bootstrap completamente

Como o sistema já possui admins criados, a abordagem mais segura é **remover o modo bootstrap** em vez de movê-lo para um secret.

### Alterações

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/admin-create-user/index.ts` | Remover bloco `bootstrap_key` inteiro (linhas 36-41). Manter apenas autenticação via `admin_secret` e JWT |
| `supabase/config.toml` | Mudar `admin-create-user` para `verify_jwt = true` + adicionar entry `admin-delete-user` com `verify_jwt = true` |
| `src/contexts/AuthContext.tsx` | Adicionar SUPERVISOR, DIRETORIA, ATENDENTE_WHATSAPP a `isStaff()` + limpar comentários com referência ao domínio de preview |
| `src/components/layout/Sidebar.tsx` | Adicionar roles faltantes aos navItems |

### Detalhes P1 (admin-create-user)

Remover:
- A constante `BOOTSTRAP_KEY`
- O bloco `if (bootstrap_key === BOOTSTRAP_KEY)`
- O campo `bootstrap_key` do destructuring do JSON

Manter:
- Autenticação via `admin_secret` (usa últimos 16 chars da service role key)
- Autenticação via JWT (verifica role ADMIN/MANAGER)

Isso elimina a vulnerabilidade sem precisar configurar nenhum secret novo.

