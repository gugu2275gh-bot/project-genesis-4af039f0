
# Plano: Liberação da Lista de Documentos no Primeiro Contato

## Contexto

Após o primeiro contato com o cliente, o técnico deve "liberar" a lista de documentos necessários para que o cliente possa visualizá-los no portal e fazer o upload. Atualmente, os documentos não são criados automaticamente quando um caso é criado.

---

## Situação Atual

| Item | Status |
|------|--------|
| Tipos de documentos por serviço (`service_document_types`) | Cadastrados |
| Documentos do caso (`service_documents`) | Vazio por padrão |
| Portal mostra documentos | Sim, quando existem |
| Provisão automática de documentos | Não existe |
| Botão de liberar documentos | Não existe |

---

## Fluxo Proposto

```text
+-------------------+     +--------------------+     +----------------------+
| Técnico faz       |     | Clica em           |     | Sistema cria         |
| contato inicial   | --> | "Liberar           | --> | service_documents    |
|                   |     |  Documentos"       |     | baseado no           |
+-------------------+     +--------------------+     | service_type         |
                                                     +----------------------+
                                                              |
                                                              v
                          +--------------------+     +----------------------+
                          | Cliente vê lista   | <-- | Status muda para     |
                          | no portal          |     | AGUARDANDO_DOCUMENTOS|
                          +--------------------+     +----------------------+
```

---

## Regras de Negócio

1. **Quando liberar**: Ao fazer contato inicial ou quando técnico decidir
2. **O que criar**: Um registro em `service_documents` para cada `service_document_types` que corresponda ao `service_type` do caso
3. **Status inicial**: `NAO_ENVIADO`
4. **Atualização de status**: Automaticamente muda para `AGUARDANDO_DOCUMENTOS`
5. **Notificação**: Enviar mensagem WhatsApp informando sobre os documentos (pode usar o template existente)

---

## Implementação

### 1. Novo Hook: `useDocuments` - Adicionar Provisão

Adicionar função `provisionDocuments` no hook existente:

```typescript
const provisionDocuments = useMutation({
  mutationFn: async (serviceCaseId: string, serviceType: string) => {
    // 1. Buscar tipos de documento para o service_type
    const { data: docTypes } = await supabase
      .from('service_document_types')
      .select('id')
      .eq('service_type', serviceType);
    
    // 2. Criar um service_document para cada tipo
    const documents = docTypes.map(dt => ({
      service_case_id: serviceCaseId,
      document_type_id: dt.id,
      status: 'NAO_ENVIADO',
    }));
    
    const { error } = await supabase
      .from('service_documents')
      .insert(documents);
    
    if (error) throw error;
    return documents;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    toast({ title: 'Documentos liberados para o cliente' });
  },
});
```

---

### 2. Novo Componente: `ReleaseDocumentsButton`

Botão que:
- Verifica se documentos já foram liberados
- Se não, mostra diálogo de confirmação
- Ao confirmar, provisiona documentos e atualiza status

```typescript
interface ReleaseDocumentsButtonProps {
  serviceCaseId: string;
  serviceType: ServiceInterest;
  currentStatus: string;
  documentsCount: number;
  onSuccess: () => void;
}
```

---

### 3. Atualização do `CaseDetail.tsx`

Adicionar o botão de liberar documentos:
- Mostrar quando `documents.length === 0`
- Mostrar no topo da aba de documentos
- Integrar com o fluxo de contato inicial

---

### 4. Integração com Contato Inicial

Opção 1 - **Automático**: Ao clicar em "Iniciar Contato" via WhatsApp, também libera documentos
Opção 2 - **Manual**: Técnico decide quando liberar (mais flexível)

Recomendação: **Opção 2** - Liberar manualmente, pois:
- Nem todos os serviços têm tipos de documentos cadastrados
- Técnico pode querer personalizar antes de liberar

---

### 5. Mensagem WhatsApp Atualizada

Adicionar template específico para liberação de documentos:

```typescript
{
  id: 'documents_released',
  label: 'Documentos Liberados',
  message: `Olá {nome}! 📄

A lista de documentos necessários para o seu processo de {servico} já está disponível no Portal do Cliente!

🔗 {portal_link}

Por favor, acesse e comece a enviar seus documentos. Cada documento possui instruções específicas sobre:
• Se precisa de apostilamento
• Se precisa de tradução juramentada

Estamos à disposição para ajudar!`,
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useDocuments.ts` | Adicionar mutação `provisionDocuments` |
| `src/pages/cases/CaseDetail.tsx` | Adicionar botão "Liberar Documentos" na aba Documents |
| `src/components/cases/SendWhatsAppButton.tsx` | Adicionar template de documentos liberados |

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/components/cases/ReleaseDocumentsButton.tsx` | Botão com diálogo de confirmação |

---

## Interface Visual

Na aba de Documentos do CaseDetail:

**Antes de liberar:**
```
┌─────────────────────────────────────────────────┐
│ 📄 Documentos                                   │
├─────────────────────────────────────────────────┤
│                                                 │
│   ⚠️ Nenhum documento vinculado a este caso    │
│                                                 │
│   Os documentos serão liberados após o          │
│   contato inicial com o cliente.                │
│                                                 │
│           [📋 Liberar Documentos]               │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Após liberar:**
```
┌─────────────────────────────────────────────────┐
│ 📄 Documentos (8 itens)          [Ver no Portal]│
├─────────────────────────────────────────────────┤
│ 📄 Passaporte                    ⬜ Não Enviado │
│ 📄 Foto 3x4                      ⬜ Não Enviado │
│ 📄 Certidão de Nascimento        🟡 Obrigatório │
│ ...                                             │
└─────────────────────────────────────────────────┘
```

---

## Validações

1. **Não liberar duplicado**: Verificar se já existem documentos antes de provisionar
2. **Tipos cadastrados**: Alertar se não houver tipos de documento para o serviço
3. **Status do caso**: Atualizar automaticamente para `AGUARDANDO_DOCUMENTOS`

---

## Notificação ao Cliente

Ao liberar documentos, opcionalmente:
1. Enviar email de notificação (se implementado)
2. Criar notificação no portal (se implementado)
3. Sugerir envio de WhatsApp com template específico

---

## Considerações Técnicas

### Performance
- Uma única inserção em batch para todos os documentos
- Índice em `service_case_id` já existe

### Segurança
- RLS: Apenas staff pode provisionar documentos
- Cliente só pode fazer upload, não criar documentos

---

## Resultado Esperado

1. Técnico pode liberar documentos com 1 clique
2. Cliente vê imediatamente a lista no portal
3. Sistema registra quem liberou e quando
4. Status do caso avança automaticamente
5. Possibilidade de enviar WhatsApp informando

---

## Próximos Passos

Após implementar, continuaremos com:
- SLA de lembretes de documentação (a cada 48h)
- Notificação automática quando documento é rejeitado
- Conferência e aprovação em lote
