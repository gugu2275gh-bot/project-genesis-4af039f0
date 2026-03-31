

## Configurar domínio customizado `cb.innovatia.com.br`

### 1. Configuração DNS (no registrador do domínio innovatia.com.br)

Como `cb.innovatia.com.br` é um **subdomínio**, adicionar:

| Tipo | Nome | Valor |
|------|------|-------|
| A | cb | 185.158.133.1 |
| TXT | _lovable.cb | (valor fornecido pelo Lovable no setup) |

### 2. Conectar domínio no Lovable

- Ir em **Project Settings → Domains → Connect Domain**
- Inserir `cb.innovatia.com.br`
- Aguardar verificação DNS e provisão SSL

### 3. Atualizar referências hardcoded no código (3 arquivos)

**`src/contexts/AuthContext.tsx`** — Trocar `productionOrigin`:
```
'https://cbasesoria.lovable.app' → 'https://cb.innovatia.com.br'
```

**`supabase/functions/create-payment-link/index.ts`** — Trocar fallback URLs (3 ocorrências):
```
'https://cb-asesoria.lovable.app' → 'https://cb.innovatia.com.br'
```

### 4. Configurar Supabase Dashboard

No painel do Supabase (Authentication → URL Configuration):
- **Site URL**: `https://cb.innovatia.com.br`
- **Redirect URLs**: adicionar `https://cb.innovatia.com.br/**`

Isso garante que e-mails de reset de senha e confirmação redirecionem para o domínio correto.

### 5. Secret SITE_URL

Adicionar/atualizar o secret `SITE_URL` no Lovable Cloud (Settings → Secrets):
```
SITE_URL=https://cb.innovatia.com.br
```

Isso faz com que as Edge Functions usem o domínio correto automaticamente via `Deno.env.get('SITE_URL')`.

