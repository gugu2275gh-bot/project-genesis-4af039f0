

## Alteração do Menu CRM na Sidebar

### O que será feito:
Atualizar a estrutura do menu CRM removendo a opção "Lead Intake" e reordenando os itens restantes.

### Mudanças no menu:

**Antes:**
- Lead Intake
- Leads
- Contatos
- Oportunidades

**Depois:**
- Leads
- Oportunidades
- Contatos

### Arquivo a ser modificado:
- `src/components/layout/Sidebar.tsx` - Atualizar o array `children` do item CRM

### Detalhes técnicos:

O array de children do CRM será alterado de:
```typescript
children: [
  { label: 'Lead Intake', href: '/crm/lead-intake' },
  { label: 'Leads', href: '/crm/leads' },
  { label: 'Contatos', href: '/crm/contacts' },
  { label: 'Oportunidades', href: '/crm/opportunities' },
]
```

Para:
```typescript
children: [
  { label: 'Leads', href: '/crm/leads' },
  { label: 'Oportunidades', href: '/crm/opportunities' },
  { label: 'Contatos', href: '/crm/contacts' },
]
```

Esta mudança é simples e afeta apenas a navegação lateral. A página de Lead Intake continuará existindo e acessível diretamente pela URL caso necessário.

