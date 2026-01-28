
# Plano: Sistema de Acompanhamento de Entrega de Documentos

## Contexto

O sistema precisa monitorar ativamente a entrega de documentos pelos clientes e:
1. Enviar lembretes automáticos baseados na prioridade do caso
2. Alertar a equipe interna sobre casos com documentos pendentes
3. Confirmar quando a documentação está completa

---

## Situação Atual

| Item | Status |
|------|--------|
| Campo `is_urgent` em `service_cases` | Existe |
| Campo `case_priority` em `service_cases` | Existe (texto livre) |
| Campo `documents_completed_at` | Existe |
| Campo `expected_protocol_date` | Existe |
| Tabela de rastreamento de lembretes de documentos | Não existe |
| Lógica de lembrete no Edge Function | Básica (urgent vs normal) |
| SLA configs para documentos | `sla_document_reminder_normal_days: 5`, `sla_document_reminder_urgent_hours: 24` |

---

## Fluxo Proposto

```text
+-------------------+     +--------------------+     +----------------------+
| Documentos        |     | Sistema verifica   |     | Baseado na           |
| liberados pelo    | --> | diariamente        | --> | prioridade:          |
| técnico           |     | pendências         |     |                      |
+-------------------+     +--------------------+     +----------------------+
                                                              |
              +-----------------------------------------------+
              |                   |                           |
              v                   v                           v
     +----------------+  +------------------+  +------------------------+
     | URGENTE        |  | NORMAL           |  | EM ESPERA              |
     | Lembrete 24h   |  | Lembrete 5 dias  |  | Lembrete 1 mês antes   |
     | para cliente   |  | para cliente     |  | da data prevista       |
     +----------------+  +------------------+  | + lembretes a cada 5d  |
              |                   |            +------------------------+
              |                   |                           |
              v                   v                           |
     +----------------+  +------------------+                 |
     | Técnico:       |  | Técnico: D+2     |                 |
     | Alerta interno |  | Coord: D+5       |                 |
     | a cada 24h     |  | ADM: D+2 (48h)   |                 |
     +----------------+  +------------------+                 |
              |                   |                           |
              +---------+---------+---------------------------+
                        |
                        v
     +-----------------------------------------------+
     | Documentação Completa                          |
     | - Notificar técnico                           |
     | - Enviar WhatsApp de confirmação ao cliente   |
     | - Marcar documents_completed_at               |
     +-----------------------------------------------+
```

---

## Regras de Negócio Detalhadas

### Lembretes para o Cliente (WhatsApp)

| Prioridade | Condição | Frequência | Início |
|------------|----------|------------|--------|
| URGENTE | `is_urgent = true` | A cada 24h | Imediato |
| NORMAL | `is_urgent = false` AND `case_priority != 'EM_ESPERA'` | A cada 5 dias | D+5 |
| EM_ESPERA | `case_priority = 'EM_ESPERA'` | 1 mês antes + a cada 5 dias | Baseado em `expected_protocol_date` |

### Alertas para Equipe Interna (Notificações)

| Prioridade | Destinatário | Condição |
|------------|--------------|----------|
| URGENTE | Técnico atribuído | Alerta contínuo a cada 24h |
| NORMAL | Técnico atribuído | D+2 (48h) após liberação |
| NORMAL | Coordenador/Manager | D+5 após liberação |
| NORMAL | Admin | D+2 (48h) após liberação |

---

## Implementação

### 1. Criar Tabela de Rastreamento de Lembretes

```sql
CREATE TABLE document_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_case_id, reminder_type)
);

-- Índice para consultas
CREATE INDEX idx_document_reminders_case ON document_reminders(service_case_id);
```

Tipos de lembrete:
- `CLIENT_D5`, `CLIENT_D10`, `CLIENT_D15`, etc.
- `TECH_D2`, `COORD_D5`, `ADMIN_D2`
- `URGENT_CLIENT_1`, `URGENT_CLIENT_2`, etc.
- `WAITING_30D`, `WAITING_25D`, etc.

---

### 2. Adicionar Novos Configs de SLA

```sql
INSERT INTO system_config (key, value, description) VALUES
  ('sla_document_tech_alert_hours', '48', 'Horas para alertar técnico sobre documentos pendentes (casos normais)'),
  ('sla_document_coord_alert_days', '5', 'Dias para alertar coordenador sobre documentos pendentes'),
  ('sla_document_admin_alert_hours', '48', 'Horas para alertar admin sobre documentos pendentes'),
  ('sla_document_waiting_first_reminder_days', '30', 'Dias antes da data prevista para primeiro lembrete (casos em espera)'),
  ('template_document_confirmation', 'Olá {nome}! ✅ Recebemos toda a sua documentação, que agora está em fase de revisão pelo técnico responsável. O processo de análise pode levar até 5 dias úteis.', 'Mensagem de confirmação de documentação completa');
```

---

### 3. Refatorar Lógica de Document Reminders no Edge Function

Substituir a seção 7 (DOCUMENT_REMINDERS) por uma lógica muito mais robusta:

```typescript
// =====================================================
// 7. DOCUMENT REMINDERS (ENHANCED)
// =====================================================
if (shouldRun('DOCUMENT_REMINDERS')) {
  console.log('Running DOCUMENT_REMINDERS automation (enhanced)...')
  
  // Fetch cases with pending documents
  const { data: casesWithPendingDocs } = await supabase
    .from('service_cases')
    .select(`
      id, is_urgent, case_priority, expected_protocol_date,
      assigned_to_user_id, client_user_id, first_contact_at,
      technical_status, documents_completed_at,
      opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
    `)
    .eq('technical_status', 'AGUARDANDO_DOCUMENTOS')
    .is('documents_completed_at', null);
  
  for (const sc of casesWithPendingDocs || []) {
    // Check pending documents count
    const { count: pendingCount } = await supabase
      .from('service_documents')
      .select('*', { count: 'exact', head: true })
      .eq('service_case_id', sc.id)
      .in('status', ['NAO_ENVIADO', 'REJEITADO']);
    
    if (!pendingCount || pendingCount === 0) {
      // All docs submitted - trigger completion flow
      await handleDocumentsComplete(sc);
      continue;
    }
    
    const contact = sc.opportunities?.leads?.contacts;
    const leadId = sc.opportunities?.leads?.id;
    const firstContactAt = new Date(sc.first_contact_at || sc.created_at);
    const daysSinceRelease = Math.floor((now.getTime() - firstContactAt.getTime()) / (24 * 60 * 60 * 1000));
    
    // Determine priority type
    const priorityType = sc.is_urgent ? 'URGENT' 
      : sc.case_priority === 'EM_ESPERA' ? 'WAITING' 
      : 'NORMAL';
    
    // Handle each priority type...
  }
}
```

---

### 4. Lógica de Documentação Completa

Quando todos os documentos forem enviados (status != NAO_ENVIADO e != REJEITADO):

```typescript
async function handleDocumentsComplete(serviceCase) {
  // 1. Update case
  await supabase.from('service_cases').update({
    documents_completed_at: new Date().toISOString(),
    technical_status: 'DOCUMENTOS_EM_CONFERENCIA'
  }).eq('id', serviceCase.id);
  
  // 2. Notify technician
  if (serviceCase.assigned_to_user_id) {
    await supabase.from('notifications').insert({
      user_id: serviceCase.assigned_to_user_id,
      type: 'documents_complete',
      title: 'Documentação Completa',
      message: `O cliente enviou todos os documentos. Caso pronto para conferência.`
    });
  }
  
  // 3. Send confirmation to client
  const contact = serviceCase.opportunities?.leads?.contacts;
  if (contact?.phone) {
    const msg = templateMap.template_document_confirmation.replace('{nome}', contact.full_name);
    await sendWhatsApp(contact.phone, msg, serviceCase.opportunities?.leads?.id);
  }
  
  results.documentsCompleted++;
}
```

---

### 5. Atualização do `useCases` Hook

Adicionar função para verificar e atualizar status de documentação:

```typescript
const checkDocumentsComplete = useMutation({
  mutationFn: async (caseId: string) => {
    // Check if all required docs are submitted
    const { data: docs } = await supabase
      .from('service_documents')
      .select('id, status, service_document_types!inner(is_required)')
      .eq('service_case_id', caseId);
    
    const allRequiredSubmitted = docs?.every(d => 
      !d.service_document_types?.is_required || 
      ['ENVIADO', 'EM_CONFERENCIA', 'APROVADO'].includes(d.status)
    );
    
    if (allRequiredSubmitted) {
      // Update case status
      await supabase.from('service_cases')
        .update({ 
          documents_completed_at: new Date().toISOString(),
          technical_status: 'DOCUMENTOS_EM_CONFERENCIA'
        })
        .eq('id', caseId);
    }
    
    return allRequiredSubmitted;
  }
});
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Refatorar seção DOCUMENT_REMINDERS completamente |
| `src/hooks/useCases.ts` | Adicionar `checkDocumentsComplete` |
| `src/hooks/useDocuments.ts` | Verificar completude ao aprovar documento |

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| Migração SQL | Tabela `document_reminders` + configs SLA |

---

## Templates de Mensagem

### Lembrete Normal (existente)
> Olá {nome}! 📄 Ainda estamos aguardando alguns documentos para dar continuidade ao seu processo. Por favor, envie-os pelo portal.

### Lembrete Urgente (existente)
> Olá {nome}! ⚠️ URGENTE: Precisamos dos documentos pendentes para seu processo. Por favor, envie hoje pelo portal.

### Lembrete Em Espera (novo)
> Olá {nome}! 📅 Faltam {dias} dias para a data prevista do seu protocolo. Por favor, comece a reunir os documentos pendentes e envie pelo portal.

### Confirmação de Documentação Completa (novo)
> Olá {nome}! ✅ Recebemos toda a sua documentação, que agora está em fase de revisão pelo técnico responsável. O processo de análise pode levar até 5 dias úteis.

---

## Tabela de Lembretes por Prioridade

### Caso URGENTE

| Dia | Para | Ação |
|-----|------|------|
| D+1 | Cliente | WhatsApp lembrete urgente |
| D+1 | Técnico | Notificação interna |
| D+2 | Cliente | WhatsApp lembrete urgente |
| D+2 | Técnico | Notificação interna |
| ... | ... | Continua diariamente |

### Caso NORMAL

| Dia | Para | Ação |
|-----|------|------|
| D+2 | Técnico | Notificação: "Documentos pendentes há 48h" |
| D+2 | Admin | Notificação: "Caso com documentos pendentes" |
| D+5 | Cliente | WhatsApp lembrete normal |
| D+5 | Coordenador | Notificação: "Documentos pendentes há 5 dias" |
| D+10 | Cliente | WhatsApp lembrete normal |
| D+15 | Cliente | WhatsApp lembrete normal |
| ... | ... | Continua a cada 5 dias |

### Caso EM_ESPERA

| Quando | Para | Ação |
|--------|------|------|
| D-30 | Cliente | WhatsApp: "Faltam 30 dias para protocolo" |
| D-25 | Cliente | WhatsApp lembrete |
| D-20 | Cliente | WhatsApp lembrete |
| ... | ... | Continua a cada 5 dias |
| D-5 | Cliente | WhatsApp urgente |

---

## Migração SQL Completa

```sql
-- 1. Create document reminders tracking table
CREATE TABLE IF NOT EXISTS document_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'CLIENT',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_document_reminders_case_type 
  ON document_reminders(service_case_id, reminder_type);

-- 2. Add new SLA configurations
INSERT INTO system_config (key, value, description) VALUES
  ('sla_document_tech_alert_hours', '48', 'Horas para alertar técnico sobre documentos pendentes'),
  ('sla_document_coord_alert_days', '5', 'Dias para alertar coordenador sobre documentos pendentes'),
  ('sla_document_admin_alert_hours', '48', 'Horas para alertar admin sobre documentos pendentes'),
  ('sla_document_waiting_first_reminder_days', '30', 'Dias antes da data prevista para primeiro lembrete'),
  ('template_document_waiting', 'Olá {nome}! 📅 Faltam {dias} dias para a data prevista do seu protocolo. Por favor, comece a reunir os documentos pendentes e envie pelo portal.', 'Lembrete para casos em espera'),
  ('template_document_confirmation', 'Olá {nome}! ✅ Recebemos toda a sua documentação, que agora está em fase de revisão pelo técnico responsável. O processo de análise pode levar até 5 dias úteis.', 'Confirmação de documentação completa')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 3. Enable RLS
ALTER TABLE document_reminders ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy - Staff can read/write
CREATE POLICY "Staff can manage document reminders" 
  ON document_reminders 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('ADMIN', 'MANAGER', 'TECNICO', 'ATENCAO_CLIENTE')
    )
  );
```

---

## Resultado Esperado

1. Clientes recebem lembretes automáticos baseados na prioridade do caso
2. Equipe interna é alertada sobre casos com documentos pendentes
3. Sistema detecta automaticamente quando documentação está completa
4. Mensagem de confirmação é enviada ao cliente
5. Rastreamento evita lembretes duplicados
6. SLAs configuráveis via `system_config`

---

## Próximos Passos Após Implementação

1. Adicionar indicador visual no CasesList mostrando "documentos pendentes há X dias"
2. Dashboard com métricas de documentação pendente por prioridade
3. Relatório de tempo médio de entrega de documentos

