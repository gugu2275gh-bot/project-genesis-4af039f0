

## Plano: Tipo de Usuário (Administrador / Comum) no Cadastro e Controle de Acesso

### Conceito

Adicionar um campo "Tipo de Usuário" na criação e edição de usuários com duas opções:
- **Administrador**: Acesso total a todos os módulos (recebe automaticamente o role ADMIN)
- **Comum**: Acesso restrito apenas aos módulos correspondentes aos perfis (roles) atribuídos

### Como Funciona Hoje

O sistema já usa roles (ADMIN, MANAGER, JURIDICO, etc.) para filtrar itens do menu na Sidebar e RLS no banco. O role ADMIN já concede acesso total. A mudança é tornar isso explícito e visível na interface de gestão.

### Alterações

**1. Interface de Criação de Usuário (`src/pages/settings/UsersManagement.tsx`)**
- Adicionar seletor "Tipo de Usuário" (Administrador / Comum) antes do campo de papel
- Se "Administrador": atribuir automaticamente o role ADMIN, ocultar seletor de papel individual (já que tem acesso total)
- Se "Comum": exibir seletor de papel normalmente (excluindo ADMIN da lista)
- Mesma lógica no diálogo de edição

**2. Interface de Edição de Usuário (`src/pages/settings/UsersManagement.tsx`)**
- Adicionar campo "Tipo de Usuário" no diálogo de edição
- Ao mudar de Comum para Administrador: adicionar role ADMIN
- Ao mudar de Administrador para Comum: remover role ADMIN, exigir seleção de pelo menos um papel

**3. Tabela de Usuários (`src/pages/settings/UsersManagement.tsx`)**
- Adicionar indicador visual de "Administrador" ou "Comum" na coluna de perfis ou como badge separado

**4. Sidebar (`src/components/layout/Sidebar.tsx`)**
- Já funciona corretamente: se o usuário tem ADMIN, todos os itens aparecem. Nenhuma alteração necessária.

**5. RLS e Backend**
- Nenhuma alteração necessária no banco. O role ADMIN já é utilizado em todas as policies RLS para conceder acesso total. Usuários comuns terão acesso filtrado pelos seus roles específicos.

**6. Validação na criação via Edge Function (`supabase/functions/admin-create-user/index.ts`)**
- Nenhuma alteração necessária. A function já recebe o role e o atribui.

### Detalhes Técnicos

- O campo "Tipo de Usuário" é derivado da presença do role ADMIN na lista de roles do usuário (não é um campo novo no banco)
- Administrador = usuário que possui role ADMIN
- Comum = usuário que NÃO possui role ADMIN
- Ao selecionar "Administrador" na criação, o role enviado é ADMIN
- Ao selecionar "Comum", o usuário escolhe entre os roles disponíveis (MANAGER, JURIDICO, FINANCEIRO, etc.)
- A Sidebar e todo o sistema já respeitam os roles via `hasRole`/`hasAnyRole`, garantindo consistência

