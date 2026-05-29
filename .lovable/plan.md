# Corrigir refresh/redirect da página Configurações

## Causa raiz

`src/pages/settings/Settings.tsx` (linhas 32-40) verifica `hasRole('ADMIN')` e `hasRole('MANAGER')` imediatamente. Como `AuthContext` inicia com `roles = []` e `loading = true`, na primeira renderização `hasRole` retorna `false` e o `<Navigate to="/dashboard" replace />` dispara antes dos roles terminarem de carregar do Supabase. Quando a query termina, você já foi redirecionado — daí a sensação de "carrega e volta pro dashboard".

O `AuthContext` já expõe `loading: boolean`, mas a página não o consome.

## Mudanças

### 1. `src/pages/settings/Settings.tsx`
- Ler `loading` de `useAuth()` (e `loading` de `useSuperuser()` se existir).
- Enquanto `loading === true`, renderizar um estado de carregamento (skeleton/spinner consistente com o resto do app) em vez de avaliar `hasRole`.
- Só executar a verificação de role + `<Navigate>` depois que `loading` for `false`.

```tsx
const { hasRole, loading } = useAuth();
if (loading) return <LoadingState />;
if (!hasRole('ADMIN') && !hasRole('MANAGER')) {
  return <Navigate to="/dashboard" replace />;
}
```

### 2. Verificar outras páginas com o mesmo padrão
Buscar `hasRole(` seguido de `<Navigate` em `src/pages/**` para identificar páginas com a mesma race (ex.: outras páginas restritas por role) e aplicar o mesmo guard. Corrigir apenas onde o padrão se repete — sem mudanças de comportamento, só o guard de loading.

## Fora de escopo
- Nenhuma mudança em backend, edge functions, RLS ou no fluxo de roles em si.
- Sem mexer no WhatsApp webhook nem em qualquer outra área não relacionada.

## Validação
- Acessar `/settings` como ADMIN: deve abrir normalmente.
- Acessar como usuário sem role admin/manager: deve redirecionar pra `/dashboard` (comportamento atual preservado).
- Refresh em `/settings` não deve mais voltar pro dashboard.
