

# Plano: Adicionar Funcionalidade de Exclusao de Lead

## Visao Geral

Implementar a opcao de excluir leads, com confirmacao de seguranca e tratamento adequado de registros relacionados.

---

## Consideracoes Importantes

Antes de excluir um lead, e necessario considerar os registros relacionados:

| Tabela Relacionada | Impacto |
|--------------------|---------|
| `interactions` | Historico de interacoes com o lead |
| `opportunities` | Oportunidades criadas a partir do lead |
| `tasks` | Tarefas relacionadas ao lead |
| `mensagens_cliente` | Mensagens do WhatsApp |

**Opcoes de implementacao:**
1. **Soft Delete**: Marcar como "arquivado/excluido" sem remover do banco (recomendado)
2. **Hard Delete**: Remover permanentemente (com CASCADE ou bloqueio se houver dados relacionados)

---

## Implementacao Proposta

### 1. Hook `useLeads.ts` - Adicionar Mutacao de Exclusao

Adicionar funcao `deleteLead` que:
- Verifica se o lead tem oportunidades/contratos ativos
- Se tiver dados criticos, impede exclusao e informa usuario
- Se nao tiver, permite exclusao com confirmacao

```typescript
const deleteLead = useMutation({
  mutationFn: async (leadId: string) => {
    // Verificar se tem oportunidades
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select('id')
      .eq('lead_id', leadId)
      .limit(1);
    
    if (opportunities && opportunities.length > 0) {
      throw new Error('Este lead possui oportunidades vinculadas e nao pode ser excluido.');
    }
    
    // Excluir interacoes relacionadas
    await supabase.from('interactions').delete().eq('lead_id', leadId);
    
    // Excluir lead
    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast({ title: 'Lead excluido com sucesso' });
  },
  onError: (error) => {
    toast({ 
      title: 'Erro ao excluir lead', 
      description: error.message, 
      variant: 'destructive' 
    });
  },
});
```

---

### 2. Pagina `LeadDetail.tsx` - Botao de Exclusao

Adicionar botao de exclusao no cabecalho com dialogo de confirmacao:

- Icone de lixeira no canto superior direito
- Ao clicar, abre AlertDialog pedindo confirmacao
- Se confirmado, executa exclusao e redireciona para lista

---

### 3. Opcional: Lista de Leads com Acao de Exclusao

Adicionar coluna de acoes na tabela com opcao de exclusao rapida (com confirmacao).

---

## Fluxo de Usuario

```text
Usuario na pagina de detalhe do lead
              │
              ▼
Clica no botao "Excluir Lead"
              │
              ▼
┌─────────────────────────────────────┐
│  AlertDialog de Confirmacao:        │
│  "Tem certeza que deseja excluir    │
│  este lead? Esta acao nao pode      │
│  ser desfeita."                     │
│  [Cancelar] [Confirmar Exclusao]    │
└─────────────────────────────────────┘
              │
              ▼ (Se confirmar)
┌─────────────────────────────────────┐
│  Verifica se tem oportunidades      │
│  - Se sim: Erro + Mensagem          │
│  - Se nao: Exclui + Redireciona     │
└─────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/useLeads.ts` | Adicionar mutacao `deleteLead` |
| `src/pages/crm/LeadDetail.tsx` | Adicionar botao e AlertDialog de exclusao |

---

## Secao Tecnica

### Verificacao de Dados Relacionados

Antes de excluir, verificar:
1. Oportunidades (`opportunities.lead_id`)
2. Contratos via oportunidades
3. Casos de servico via oportunidades

Se houver qualquer dado critico, bloquear exclusao com mensagem explicativa.

### Exclusao em Cascata Segura

Ordem de exclusao:
1. `interactions` onde `lead_id = X`
2. `tasks` onde `related_lead_id = X`
3. `mensagens_cliente` onde `id_lead = X`
4. `leads` onde `id = X`

**Nota:** O contato (`contacts`) nao sera excluido, pois pode estar vinculado a outros registros.

---

## Estimativa

1 iteracao de desenvolvimento

