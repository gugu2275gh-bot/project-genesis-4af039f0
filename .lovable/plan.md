

# Plano: CRUD Completo de Usuarios com Setor Obrigatorio

## Estado Atual

A pagina `UsersManagement.tsx` ja possui:
- Listagem de usuarios com roles e setores
- Criacao de usuario via edge function `admin-create-user`
- Edicao de nome/telefone/setores
- Adicao/remocao de roles
- Ativar/desativar usuario
- Exclusao via edge function `admin-delete-user`
- Busca por nome/email

**O que falta:**
- Validacao obrigatoria de pelo menos 1 setor na criacao e edicao
- O role tambem deveria ser obrigatorio na criacao (atualmente opcional)

## Alteracoes

### 1. Validacao de setor obrigatorio na criacao (`handleCreateUser`)
- Adicionar validacao: se `createUserForm.sectorIds.length === 0`, exibir toast de erro e bloquear envio
- Tambem validar que `role` nao esta vazio (cada usuario deve ter pelo menos 1 papel)

### 2. Validacao de setor obrigatorio na edicao (`handleEditUser`)
- Adicionar validacao: se `editUserForm.sectorIds.length === 0`, exibir toast de erro e bloquear envio

### 3. Indicacao visual de obrigatoriedade
- Adicionar asterisco (*) nos labels de Setor e Papel nos dialogs de criacao e edicao
- Destacar visualmente a secao de setores quando vazia (borda vermelha ou mensagem)

### 4. Validacao na remocao de role
- Ao remover um role, verificar se o usuario ficaria sem roles. Se sim, bloquear e avisar.

## Arquivos afetados

| Arquivo | Acao |
|---|---|
| `src/pages/settings/UsersManagement.tsx` | Adicionar validacoes de setor e role obrigatorios |

## Escopo
Mudancas apenas no frontend (validacao). O backend (`admin-create-user`) ja aceita `sector_ids` -- nao precisa de alteracao.

