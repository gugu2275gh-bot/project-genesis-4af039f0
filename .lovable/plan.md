

## Exibir Nome do Cliente nas Tarefas

### Objetivo
Quando uma tarefa estiver associada a um Lead, Oportunidade ou Caso de Serviço, exibir o nome do cliente correspondente na lista de tarefas.

### Estrutura de Dados

A tabela `tasks` possui 3 campos de relacionamento:
- `related_lead_id` → Lead
- `related_opportunity_id` → Oportunidade
- `related_service_case_id` → Caso de Serviço

Todos esses caminham para **contacts.full_name**:
- Lead → Contact (direto)
- Oportunidade → Lead → Contact
- Caso de Serviço → Oportunidade → Lead → Contact

### Alterações Necessárias

**1. Atualizar o hook `useTasks.ts`**

Modificar as queries para incluir joins com as tabelas relacionadas e buscar o nome do cliente:

```text
tasks
├── related_lead:leads(contact:contacts(full_name))
├── related_opportunity:opportunities(lead:leads(contact:contacts(full_name)))
└── related_service_case:service_cases(opportunity:opportunities(lead:leads(contact:contacts(full_name))))
```

- Criar um novo tipo `TaskWithClient` que inclua o campo `client_name` derivado
- Adicionar lógica para extrair o nome do cliente de qualquer uma das relações

**2. Atualizar a página `TasksList.tsx`**

- Adicionar uma nova coluna "Cliente" na tabela
- Exibir o nome do cliente quando disponível, ou "-" quando a tarefa não estiver vinculada a nenhum cliente
- Posicionar a coluna entre "Tarefa" e "Status"

### Resultado Visual

| Tarefa | Cliente | Status | Prazo | Ações |
|--------|---------|--------|-------|-------|
| Revisar documentos | João Silva | Pendente | 10/02/2026 | ✓ |
| Agendar reunião | Maria Santos | Em andamento | 12/02/2026 | ✓ |
| Tarefa interna | - | Pendente | 15/02/2026 | ✓ |

### Detalhes Técnicos

**Novo tipo no hook:**
```typescript
export type TaskWithClient = Task & {
  client_name?: string | null;
  related_lead?: {
    contact?: { full_name: string } | null;
  } | null;
  related_opportunity?: {
    lead?: {
      contact?: { full_name: string } | null;
    } | null;
  } | null;
  related_service_case?: {
    opportunity?: {
      lead?: {
        contact?: { full_name: string } | null;
      } | null;
    } | null;
  } | null;
};
```

**Função helper para extrair o nome do cliente:**
```typescript
function getClientName(task: TaskWithClient): string | null {
  // Prioridade: Lead direto > Oportunidade > Caso de Serviço
  return task.related_lead?.contact?.full_name
    || task.related_opportunity?.lead?.contact?.full_name
    || task.related_service_case?.opportunity?.lead?.contact?.full_name
    || null;
}
```

**Query Supabase atualizada:**
```typescript
.select(`
  *,
  related_lead:leads(contact:contacts(full_name)),
  related_opportunity:opportunities(lead:leads(contact:contacts(full_name))),
  related_service_case:service_cases(opportunity:opportunities(lead:leads(contact:contacts(full_name))))
`)
```

### Arquivos a Modificar

1. `src/hooks/useTasks.ts` - Atualizar queries e adicionar tipos
2. `src/pages/tasks/TasksList.tsx` - Adicionar coluna de cliente na tabela

