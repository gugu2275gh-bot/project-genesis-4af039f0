

# Fix: Templates não aparecem no dropdown do chat

## Problema

Todos os 12 templates aprovados no banco de dados têm `template_category = 'sla'`. O filtro `operationalTemplates` no hook `useWhatsAppTemplates.ts` exige `template_category === 'operational'`, resultando em lista vazia.

## Solução

Alterar a lógica do `LeadChat.tsx` para mostrar **todos** os templates aprovados e ativos no dropdown quando a janela de 24h estiver expirada, independentemente da categoria (`sla` ou `operational`). O operador precisa reabrir o contato e qualquer template aprovado serve para isso.

### Alterações

**Arquivo: `src/components/crm/LeadChat.tsx`**

1. Extrair `templates` (lista completa) do hook `useWhatsAppTemplates` além de `operationalTemplates`
2. Criar uma lista `availableTemplates` que filtra todos os templates aprovados e ativos (ignorando categoria)
3. Usar `availableTemplates` no bloco da janela expirada (linhas 676-728) em vez de `operationalTemplates`
4. Manter `operationalTemplates` no popover de templates dentro da janela normal (linha 760)

**Lógica:**
```typescript
const { templates, operationalTemplates } = useWhatsAppTemplates();

const availableTemplates = useMemo(() => 
  (templates || []).filter(t => t.status === 'approved' && t.is_active),
  [templates]
);
```

Nenhuma alteração de banco de dados necessária.

