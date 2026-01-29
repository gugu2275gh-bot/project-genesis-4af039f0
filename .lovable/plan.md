
# Plano: Implementação do Acompanhamento Pós-Protocolo (Etapa 7)

## Resumo da Análise

Após análise detalhada do código existente, identifiquei que grande parte da infraestrutura já existe:

### O que já existe
| Funcionalidade | Status | Localização |
|----------------|--------|-------------|
| Tabela `requirements_from_authority` | ✅ | Supabase |
| Tabela `document_reminders` (para rastreio) | ✅ | Supabase |
| Hook `useRequirements` | ✅ | src/hooks/useRequirements.ts |
| Alertas de Exigência no SLA Monitoring | ✅ | sla-automations |
| UI de Exigências no CaseDetail | ✅ | CaseDetail.tsx (tab Exigências) |
| Seção REQUIREMENTS no sla-automations | ✅ | linhas 1130-1210 |
| Configuração `sla_post_protocol_followup_days` | ✅ | system_config ("14,21,35") |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Tracking de Documentos Pendentes Pós-Protocolo** | Flag `is_post_protocol_pending` na tabela `service_documents` |
| **Alertas Escalonados Pós-Protocolo** | 2 sem → Técnico, 3 sem → Coordenador, 5 sem → ADM |
| **UI para Marcar Documentos como Pendentes Pós-Protocolo** | Checkbox/toggle no CaseDetail |
| **Seção POST_PROTOCOL_DOCS no sla-automations** | Nova automação para documentos pendentes pós-protocolo |
| **Ação de "Enviar ao Jurídico" pós-protocolo** | Botão para encaminhar documento complementar |

---

## Alterações no Banco de Dados

### 1. Adicionar campo à tabela `service_documents`

```sql
ALTER TABLE service_documents 
ADD COLUMN IF NOT EXISTS is_post_protocol_pending BOOLEAN DEFAULT false;

ALTER TABLE service_documents 
ADD COLUMN IF NOT EXISTS post_protocol_pending_since TIMESTAMPTZ;
```

**Explicação dos campos:**
- `is_post_protocol_pending`: Flag indicando que o documento ainda precisa ser enviado após o protocolo
- `post_protocol_pending_since`: Data a partir da qual começou a contagem para alertas

---

## Arquivos a Modificar

### 1. **Modificar: supabase/functions/sla-automations/index.ts**

Adicionar nova seção `POST_PROTOCOL_DOCS`:

```typescript
// =====================================================
// 15. POST-PROTOCOL PENDING DOCUMENTS ALERTS
// =====================================================
if (shouldRun('POST_PROTOCOL_DOCS')) {
  console.log('Running POST_PROTOCOL_DOCS automation...')
  
  // Find documents marked as pending post-protocol
  const { data: pendingDocs } = await supabase
    .from('service_documents')
    .select(`
      id, service_case_id, document_type_id, post_protocol_pending_since,
      service_document_types!inner (name),
      service_cases!inner (
        assigned_to_user_id,
        opportunities!inner (leads!inner (contacts!inner (full_name)))
      )
    `)
    .eq('is_post_protocol_pending', true)
    .in('status', ['NAO_ENVIADO', 'ENVIADO', 'RECUSADO'])

  for (const doc of pendingDocs || []) {
    const pendingSince = new Date(doc.post_protocol_pending_since || doc.updated_at)
    const weeksPending = (now.getTime() - pendingSince.getTime()) / (7 * 24 * 60 * 60 * 1000)
    
    const caseData = doc.service_cases as any
    const docName = (doc.service_document_types as any)?.name || 'Documento'
    const clientName = caseData?.opportunities?.leads?.contacts?.full_name || 'Cliente'
    const caseShortId = doc.service_case_id.slice(0, 8)
    
    // Week 2 - Alert to Technician
    if (weeksPending >= 2 && weeksPending < 3) {
      if (!(await techDocReminderSent(doc.service_case_id, `POST_PROTO_W2_${doc.id}`))) {
        if (caseData.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: caseData.assigned_to_user_id,
            type: 'post_protocol_doc_pending',
            title: 'Documento Pendente Pós-Protocolo',
            message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 2 semanas.`
          })
        }
        await recordTechDocReminder(doc.service_case_id, `POST_PROTO_W2_${doc.id}`, 'TECH')
        results.postProtocolDocsAlerts++
      }
    }
    
    // Week 3 - Escalate to Coordinator
    if (weeksPending >= 3 && weeksPending < 5) {
      if (!(await techDocReminderSent(doc.service_case_id, `POST_PROTO_W3_${doc.id}`))) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'post_protocol_doc_escalated',
            title: 'Documento Pós-Protocolo Atrasado',
            message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 3 semanas.`
          })
        }
        await recordTechDocReminder(doc.service_case_id, `POST_PROTO_W3_${doc.id}`, 'COORD')
        results.postProtocolDocsAlerts++
      }
    }
    
    // Week 5 - Escalate to Admin
    if (weeksPending >= 5) {
      if (!(await techDocReminderSent(doc.service_case_id, `POST_PROTO_W5_${doc.id}`))) {
        const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
        for (const admin of admins || []) {
          await supabase.from('notifications').insert({
            user_id: admin.user_id,
            type: 'post_protocol_doc_critical',
            title: '🚨 Documento Pós-Protocolo Crítico',
            message: `${docName} de ${clientName} (caso ${caseShortId}) pendente há 5+ semanas!`
          })
        }
        await recordTechDocReminder(doc.service_case_id, `POST_PROTO_W5_${doc.id}`, 'ADMIN')
        results.postProtocolDocsAlerts++
      }
    }
  }
}
```

Adicionar tipo de automação:
```typescript
type AutomationType = 
  | 'ALL'
  | ...
  | 'POST_PROTOCOL_DOCS'  // Novo
```

Adicionar contador de resultados:
```typescript
postProtocolDocsAlerts: 0,
```

---

### 2. **Modificar: src/hooks/useDocuments.ts**

Adicionar mutação para marcar documento como pendente pós-protocolo:

```typescript
const markPostProtocolPending = useMutation({
  mutationFn: async ({ docId, isPending }: { docId: string; isPending: boolean }) => {
    const { data, error } = await supabase
      .from('service_documents')
      .update({
        is_post_protocol_pending: isPending,
        post_protocol_pending_since: isPending ? new Date().toISOString() : null,
      })
      .eq('id', docId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['service-documents'] });
    toast({ title: 'Documento atualizado' });
  },
});
```

---

### 3. **Modificar: src/pages/cases/CaseDetail.tsx**

Adicionar indicador visual e toggle para documentos pendentes pós-protocolo na tab de Documentos.

Na listagem de documentos, adicionar:
- Badge "Pós-Protocolo" para documentos marcados
- Toggle para marcar/desmarcar como pendente pós-protocolo (visível apenas após status PROTOCOLADO)
- Botão "Enviar ao Jurídico" para encaminhar documento complementar

---

### 4. **Modificar: src/hooks/useSLAMonitoring.ts**

Adicionar contagem de documentos pendentes pós-protocolo no painel de SLA:

```typescript
// Post-protocol pending documents
const { count: postProtocolDocsPending } = await supabase
  .from('service_documents')
  .select('id', { count: 'exact' })
  .eq('is_post_protocol_pending', true)
  .in('status', ['NAO_ENVIADO', 'ENVIADO', 'RECUSADO']);
```

---

## Fluxo Visual

```text
         PROTOCOLO REALIZADO
                │
                ▼
   ┌─────────────────────────────┐
   │ Técnico marca documento(s)  │
   │ como "Pendente Pós-Proto"   │
   └─────────────────────────────┘
                │
                ▼
   ┌─────────────────────────────┐
   │ Sistema inicia contagem     │
   │ post_protocol_pending_since │
   └─────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
  2 sem       3 sem       5 sem         Cliente
 (Técnico)  (Coord)     (Admin)        envia doc
    │           │           │              │
    ▼           ▼           ▼              ▼
 Notific.   Escalação   Alerta       Técnico aprova
 in-app     MANAGER     Crítico      e envia ao Jurídico
                                          │
                                          ▼
                                   Fluxo de Exigência
                                   (se necessário)
```

---

## Escalas de Alertas Pós-Protocolo

| Tempo | Destinatário | Tipo | Mensagem |
|-------|--------------|------|----------|
| 2 semanas | Técnico responsável | in-app | "Documento X pendente há 2 semanas" |
| 3 semanas | Coordenador (MANAGER) | in-app | "Documento X atrasado há 3 semanas" |
| 5 semanas | Administrador (ADMIN) | in-app | "🚨 Documento X crítico - 5+ semanas" |

---

## Integração com Exigências (Requerimientos)

O sistema de exigências já está implementado e funcionando:

| Funcionalidade | Status |
|----------------|--------|
| Cadastro de Exigência (requirements_from_authority) | ✅ |
| Prazos Oficial e Interno | ✅ |
| Alertas automáticos (2 dias interno, 5 dias oficial) | ✅ |
| Status (ABERTA, EM_ANDAMENTO, RESPONDIDA, EXPIRADA) | ✅ |
| UI no CaseDetail | ✅ |

**Não há necessidade de alterações** no sistema de exigências - ele já atende ao requisito de "Requerimiento" mencionado na documentação.

---

## Configurações SLA Existentes

A configuração `sla_post_protocol_followup_days` já existe com valor "14,21,35" (dias):
- 14 dias (2 semanas) → Alerta Técnico
- 21 dias (3 semanas) → Alerta Coordenador  
- 35 dias (5 semanas) → Alerta Admin

---

## Ordem de Implementação

1. **Migração do banco** (adicionar campos)
2. **Hook useDocuments** (adicionar mutação)
3. **CaseDetail.tsx** (UI de toggle e indicadores)
4. **useSLAMonitoring.ts** (contagem no painel)
5. **sla-automations** (nova seção POST_PROTOCOL_DOCS)
6. **Atualizar types.ts** (regenerar tipos)

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/new_migration.sql` | Adicionar campos à service_documents |
| `src/integrations/supabase/types.ts` | Regenerar tipos |
| `src/hooks/useDocuments.ts` | Adicionar markPostProtocolPending |
| `src/pages/cases/CaseDetail.tsx` | UI para marcar docs pós-protocolo |
| `src/hooks/useSLAMonitoring.ts` | Adicionar contagem |
| `supabase/functions/sla-automations/index.ts` | Seção POST_PROTOCOL_DOCS |

---

## Testes Recomendados

1. Marcar documento como pendente pós-protocolo
2. Verificar contagem no painel SLA
3. Simular passagem de tempo (ajustar post_protocol_pending_since)
4. Verificar alertas escalonados
5. Desmarcar documento e verificar que alertas param
6. Testar fluxo de envio ao jurídico
