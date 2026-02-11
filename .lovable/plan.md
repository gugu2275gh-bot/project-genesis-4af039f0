
# Corrigir Tela de Redefinicao de Senha

## Problema

Quando o usuario clica no link de redefinicao de senha enviado por e-mail, a pagina mostra "Link Invalido" porque:

1. O Supabase redireciona para `/reset-password#access_token=...`
2. O codigo executa `getSession()` imediatamente -- nao encontra sessao (o token do hash ainda nao foi processado)
3. `checking` vira `false` e a tela de erro aparece
4. O evento `PASSWORD_RECOVERY` dispara depois, mas ja e tarde demais

## Solucao

Modificar o `useEffect` em `src/pages/ResetPassword.tsx` para:

1. Detectar se ha um token/hash fragment na URL (indicando que o usuario veio do link do e-mail)
2. Se houver hash, **aguardar** o evento `PASSWORD_RECOVERY` do `onAuthStateChange` antes de marcar `checking` como `false`
3. Usar um timeout de seguranca (5 segundos) para nao deixar o usuario esperando indefinidamente caso algo falhe

## Arquivo Envolvido

| Arquivo | Acao |
|---------|------|
| `src/pages/ResetPassword.tsx` | Corrigir logica do useEffect para aguardar processamento do token |

## Mudanca no Codigo

O `useEffect` sera reescrito para:

```text
useEffect:
  1. Configurar onAuthStateChange PRIMEIRO
     - Se evento = PASSWORD_RECOVERY -> setIsValidSession(true), setChecking(false)
     - Se evento = SIGNED_IN (e ha hash na URL) -> setIsValidSession(true), setChecking(false)
  2. Verificar se ha hash fragment na URL
     - Se SIM: aguardar o evento do listener (com timeout de 5s como fallback)
     - Se NAO: chamar getSession() normalmente e definir checking = false
```

Isso garante que o token do hash seja processado pelo Supabase antes de decidir se a sessao e valida ou nao.

## Resultado Esperado

1. Usuario clica no link do e-mail
2. Pagina mostra loading (spinner) por 1-2 segundos enquanto o token e processado
3. Formulario de nova senha aparece corretamente
4. Usuario define a nova senha com sucesso
