
# Plano: Superusuários para Abas Exportar e ERD

## Objetivo

Criar uma tabela de **superusuários** no banco de dados para controlar a visibilidade das abas "Exportar" e "ERD" em Configurações. Apenas os 4 emails especificados terão acesso.

---

## Emails Autorizados (Superusuários)

| Email | Acesso |
|-------|--------|
| paulohpl@icloud.com | ERD + Exportar |
| rvbarros@gmail.com | ERD + Exportar |
| brenoluizsales@gmail.com | ERD + Exportar |
| gustavohb16@outlook.com | ERD + Exportar |

---

## Arquitetura

Para outros administradores, esses usuários aparecerão como "Administrador" normal. A distinção de SUPERUSUÁRIO será invisível na interface - apenas controla funcionalidades ocultas.

---

## Implementação

### 1. Migração: Criar Tabela `superusers`

```sql
-- Tabela de superusuários
CREATE TABLE public.superusers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(email)
);

-- Habilitar RLS
ALTER TABLE public.superusers ENABLE ROW LEVEL SECURITY;

-- Função para verificar se usuário é superusuário
CREATE OR REPLACE FUNCTION public.is_superuser(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.superusers
    WHERE user_id = _user_id
  )
$$;

-- Política: Apenas superusuários podem ver a tabela
CREATE POLICY "Superusers can view superusers table"
ON public.superusers
FOR SELECT
TO authenticated
USING (public.is_superuser(auth.uid()));

-- Inserir os 4 superusuários (será feito via INSERT separado após usuários existirem)
```

### 2. Inserir Superusuários

Após a migração, inserir os emails na tabela vinculando aos user_ids correspondentes:

```sql
-- Inserir superusuários baseado no email dos profiles
INSERT INTO public.superusers (user_id, email)
SELECT p.id, p.email 
FROM profiles p 
WHERE p.email IN (
  'paulohpl@icloud.com',
  'rvbarros@gmail.com', 
  'brenoluizsales@gmail.com',
  'gustavohb16@outlook.com'
);
```

### 3. Criar Hook: `src/hooks/useSuperuser.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useSuperuser() {
  const { user } = useAuth();

  const { data: isSuperuser = false, isLoading } = useQuery({
    queryKey: ['superuser', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      const { data, error } = await supabase
        .from('superusers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking superuser status:', error);
        return false;
      }
      
      return !!data;
    },
    enabled: !!user?.id,
  });

  return { isSuperuser, isLoading };
}
```

### 4. Atualizar: `src/pages/settings/Settings.tsx`

```typescript
import { useSuperuser } from '@/hooks/useSuperuser';

export default function Settings() {
  const { hasRole } = useAuth();
  const { isSuperuser } = useSuperuser();
  
  // ... resto do código
  
  return (
    <Tabs>
      <TabsList>
        {/* Abas normais visíveis para ADMIN/MANAGER */}
        <TabsTrigger value="users">Usuários</TabsTrigger>
        <TabsTrigger value="sla">SLAs</TabsTrigger>
        {/* ... outras abas normais */}
        
        {/* Abas visíveis APENAS para superusuários */}
        {isSuperuser && (
          <>
            <TabsTrigger value="erd">ERD</TabsTrigger>
            <TabsTrigger value="export">Exportar</TabsTrigger>
          </>
        )}
      </TabsList>
      
      {/* TabsContent também condicionais */}
      {isSuperuser && (
        <>
          <TabsContent value="erd">
            <DatabaseERD />
          </TabsContent>
          <TabsContent value="export">
            <ExportDocumentation />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| **Migração SQL** | **Criar** - Tabela `superusers` + função `is_superuser` + RLS |
| **INSERT SQL** | **Executar** - Inserir os 4 emails como superusuários |
| `src/hooks/useSuperuser.ts` | **Criar** - Hook para verificar status de superusuário |
| `src/pages/settings/Settings.tsx` | **Modificar** - Condicionar abas ERD/Exportar ao superusuário |

---

## Fluxo de Verificação

```text
Usuário logado
      │
      ▼
┌─────────────────┐
│ É ADMIN/MANAGER?│
└────────┬────────┘
         │ Sim
         ▼
┌─────────────────┐
│ Acessa Settings │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ É SUPERUSUÁRIO?     │
│ (consulta tabela)   │
└────────┬────────────┘
    Sim  │  Não
    ┌────┴────┐
    ▼         ▼
Vê ERD    Não vê
e Export  ERD/Export
```

---

## Segurança

- A verificação é feita **no servidor** via query ao banco
- RLS protege a tabela `superusers` (apenas superusuários veem)
- Função `is_superuser` usa `SECURITY DEFINER` para evitar recursão
- Nenhum dado sensível exposto no frontend

---

## Resultado Final

| Tipo de Usuário | Abas Visíveis em Configurações |
|-----------------|-------------------------------|
| ADMIN normal | Usuários, Tabelas, SLAs, Documentos, Notificações, Sistema |
| SUPERUSUÁRIO | Todas acima + **ERD** + **Exportar** |
| MANAGER | Usuários, Tabelas, SLAs, Documentos, Notificações, Sistema |
| Outros | Sem acesso a /settings |

