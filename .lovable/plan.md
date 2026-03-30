

## Correção dos problemas P1, P2, P3, P4, M1, M2

### P1 - Bootstrap key hardcoded
**Arquivo:** `supabase/functions/admin-create-user/index.ts`
Remover a constante hardcoded `BOOTSTRAP_KEY = "innovatia-bootstrap-2026"` e ler de `Deno.env.get("BOOTSTRAP_KEY")`. Se a variavel nao existir, o modo bootstrap fica desabilitado automaticamente (mais seguro). Adicionar o secret `BOOTSTRAP_KEY` via tool.

### P2 - admin-create-user sem verify_jwt
**Arquivo:** `supabase/config.toml`
Manter `verify_jwt = false` (necessario para bootstrap), mas reforcar a validacao JWT em codigo — ja existe parcialmente. Adicionar reject explicito quando nenhum metodo de auth e fornecido (bootstrap_key, admin_secret, JWT). O codigo atual ja faz isso.

Na verdade, o mais seguro: mudar para `verify_jwt = true` e deixar o bootstrap funcionar apenas via `admin_secret` (que usa service role key). Remover o modo bootstrap completamente, ja que o sistema ja tem admins criados.

### P3 - isStaff() incompleto
**Arquivo:** `src/contexts/AuthContext.tsx` (linha 171)
Adicionar `'SUPERVISOR'`, `'DIRETORIA'`, `'ATENDENTE_WHATSAPP'` ao array de roles em `isStaff()`.

### P4 - Sidebar exclui roles
**Arquivo:** `src/components/layout/Sidebar.tsx` (linhas 31-63)
Adicionar `'SUPERVISOR'`, `'DIRETORIA'`, `'ATENDENTE_WHATSAPP'` aos arrays de `roles` dos itens de navegacao relevantes:
- CRM: + SUPERVISOR, DIRETORIA, ATENDENTE_WHATSAPP
- Ficha do Cliente: + SUPERVISOR, DIRETORIA
- Financeiro: + SUPERVISOR, DIRETORIA
- Casos Tecnicos: + SUPERVISOR, DIRETORIA
- Juridico: + SUPERVISOR, DIRETORIA
- Relatorios: + SUPERVISOR, DIRETORIA
- Configuracoes: + SUPERVISOR

### M1 - Referencia "lovable" no reset de senha
**Arquivo:** `src/contexts/AuthContext.tsx` (linhas 141-149)
A URL publicada `cbasesoria.lovable.app` contem "lovable" no dominio. Quando o usuario tiver um dominio customizado, o codigo deve usar esse dominio. Por agora, remover os comentarios que mencionam "Lovable" e simplificar: usar sempre a `publishedOrigin` como fallback, renomeando a variavel para `productionOrigin`. Os comentarios em codigo nao sao visiveis ao usuario, mas o dominio publicado e. Como o dominio customizado nao existe ainda, manter a logica mas limpar os comentarios.

### M2 - admin-delete-user sem entrada no config.toml
**Arquivo:** `supabase/config.toml`
Adicionar entrada `[functions.admin-delete-user]` com `verify_jwt = true` (a funcao ja valida JWT em codigo).

### Resumo de alteracoes

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/admin-create-user/index.ts` | Ler BOOTSTRAP_KEY de env, remover hardcode |
| `supabase/config.toml` | Adicionar admin-delete-user entry |
| `src/contexts/AuthContext.tsx` | Adicionar 3 roles a isStaff(), limpar comentarios M1 |
| `src/components/layout/Sidebar.tsx` | Adicionar roles faltantes aos navItems |

