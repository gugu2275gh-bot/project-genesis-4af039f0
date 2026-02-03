

# Plano: Corrigir Atualização do Chat WhatsApp Após Envio

## Problema Identificado

A mensagem é enviada com sucesso (WhatsApp recebido + salva no banco), mas a interface não atualiza para mostrar a nova mensagem na conversa.

## Causa Raiz

1. **Timing da invalidação**: O `invalidateQueries` pode estar sendo chamado antes do banco confirmar o INSERT
2. **Problema de closure**: O `leadId` usado no `onSuccess` vem do escopo do hook, não dos dados retornados

## Solução Proposta

Modificar o hook `useLeadMessages.ts` para:

1. Usar o callback `onSuccess` com os dados retornados para garantir consistência
2. Adicionar atualização otimista para feedback imediato ao usuário
3. Garantir que a invalidação ocorra após o sucesso confirmado

---

## Alterações

### Hook `useLeadMessages.ts`

```typescript
const sendMessage = useMutation({
  mutationFn: async ({ leadId, message }: { leadId: string; message: string }) => {
    // ... código existente do webhook ...
    
    const { data, error } = await supabase
      .from('mensagens_cliente')
      .insert({
        id_lead: leadId,
        mensagem_IA: message,
        origem: 'SISTEMA',
      })
      .select()
      .single();

    if (error) throw error;
    return { data, leadId }; // Retornar leadId junto com data
  },
  onSuccess: (result) => {
    // Usar leadId do resultado para garantir consistência
    queryClient.invalidateQueries({ queryKey: ['lead-messages', result.leadId] });
    toast.success('Mensagem enviada');
  },
  onError: (error: Error) => {
    console.error('Erro ao enviar mensagem:', error);
    toast.error('Erro ao enviar mensagem: ' + error.message);
  },
});
```

### Adicionar Atualização Otimista (Opcional mas Recomendado)

Para feedback imediato, adicionar a mensagem localmente antes de salvar:

```typescript
onMutate: async ({ leadId, message }) => {
  // Cancelar queries pendentes
  await queryClient.cancelQueries({ queryKey: ['lead-messages', leadId] });
  
  // Snapshot do estado atual
  const previousMessages = queryClient.getQueryData(['lead-messages', leadId]);
  
  // Adicionar mensagem otimisticamente
  const optimisticMessage = {
    id: Date.now(), // ID temporário
    created_at: new Date().toISOString(),
    id_lead: leadId,
    mensagem_IA: message,
    mensagem_cliente: null,
    origem: 'SISTEMA',
    phone_id: null,
  };
  
  queryClient.setQueryData(['lead-messages', leadId], (old: LeadMessage[] = []) => [
    ...old,
    optimisticMessage,
  ]);
  
  return { previousMessages };
},
onError: (err, variables, context) => {
  // Reverter em caso de erro
  if (context?.previousMessages) {
    queryClient.setQueryData(['lead-messages', variables.leadId], context.previousMessages);
  }
  toast.error('Erro ao enviar mensagem: ' + err.message);
},
onSettled: (data, error, variables) => {
  // Sempre revalidar após mutação
  queryClient.invalidateQueries({ queryKey: ['lead-messages', variables.leadId] });
},
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useLeadMessages.ts` | Corrigir callback `onSuccess` e adicionar atualização otimista |

---

## Benefícios

1. **Feedback imediato**: Usuário vê a mensagem instantaneamente
2. **Consistência**: Invalidação usa o `leadId` correto do contexto da mutação
3. **Resiliência**: Se houver erro, o estado é revertido automaticamente

---

## Estimativa

Correção simples - 1 iteração

