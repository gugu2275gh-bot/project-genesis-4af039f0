

## Mesclar Leads - Abordagem Limpa

### Problema
O hook `mergeLeads` existe e funciona, mas a UI na página de Leads (`src/pages/crm/Leads.tsx`) nunca foi conectada a ele. A funcionalidade de mesclagem precisa ser exposta sem poluir a listagem principal.

### Abordagem Proposta: Mesclar a partir da Ficha do Cliente (LeadDetail)

Em vez de adicionar checkboxes na tabela principal (que polui a lista), a mesclagem será feita de forma contextual:

1. **Na página de detalhe do Lead (`LeadDetail`)**, quando o cliente tem mais de 1 lead ativo, exibir um alerta discreto com um botão "Mesclar Leads".
2. Ao clicar, abre um **Dialog** listando os outros leads do mesmo contato, com checkboxes para selecionar quais mesclar.
3. O lead atual é automaticamente incluido. O mais recente será o principal.
4. Confirmar e executar a mesclagem.

### Mudanças Técnicas

**1. `src/hooks/useLeads.ts`** - Adicionar query para buscar leads do mesmo contato:
- Criar hook `useContactLeads(contactId)` que retorna todos os leads ativos de um contato específico.

**2. `src/pages/crm/LeadDetail.tsx`** - Adicionar seção de mesclagem:
- Buscar leads do mesmo `contact_id` (excluindo status `MESCLADO`).
- Se houver 2+, mostrar um alerta/card com: "Este cliente tem X leads. Deseja mesclar?"
- Botão abre Dialog com lista de leads selecionáveis.
- Ao confirmar, chama `mergeLeads` do hook existente.

**3. `src/pages/crm/Leads.tsx`** - Indicador visual (opcional):
- Na coluna "Cliente", se o contato tiver 2+ leads, mostrar um badge discreto (ex: "2 leads") para que o usuário saiba que pode mesclar ao entrar no detalhe.

### Fluxo do Usuário

```text
Lista de Leads
  └─ Vê badge "2 leads" ao lado do nome
  └─ Clica no lead → LeadDetail
      └─ Alerta: "Este cliente tem 2 leads duplicados"
      └─ Botão "Mesclar" → Dialog com checkboxes
      └─ Confirma → Leads mesclados, página atualiza
```

### Vantagens
- Lista de leads permanece limpa, sem checkboxes ou modo de seleção.
- A ação de mesclar acontece no contexto certo (quando se está olhando um lead específico).
- O usuário é notificado proativamente sobre duplicatas.

