
# Plano: Revisão Técnica de Documentos e Preparação para Jurídico

## Contexto

Após o cliente entregar todos os documentos, o técnico tem 5 dias úteis para revisar e aprovar a documentação. Este fluxo cria um sistema completo de alertas SLA e automação para garantir que:
1. Técnicos sejam alertados sobre pendências de revisão
2. Coordenadores e Admins sejam escalados quando prazos estourarem
3. O envio ao jurídico ocorra dentro de 5 dias após aprovação técnica

---

## Situação Atual

| Item | Status |
|------|--------|
| Campo `documents_completed_at` | ✅ Existe |
| Campo `technical_approved_at` | ✅ Existe |
| Campo `sent_to_legal_at` | ✅ Existe |
| Tabela `document_reminders` | ✅ Existe (pode ser reutilizada) |
| Status `DOCUMENTOS_EM_CONFERENCIA` | ✅ Existe |
| Status `DOCUMENTACAO_PARCIAL_APROVADA` | ✅ Existe |
| Status `EM_ORGANIZACAO` | ✅ Existe |
| Status `ENVIADO_JURIDICO` | ✅ Existe |
| SLA config para revisão técnica | ✅ Parcial (`sla_technical_review_alert_days: 2,5,7`) |
| Lógica de alertas no Edge Function | ⚠️ Básica - precisa refatoração |

---

## Fluxo Proposto

```text
+---------------------+     +---------------------+     +--------------------+
| DOCUMENTOS EM       |     | Técnico revisa em   |     | Resultado:         |
| CONFERENCIA         | --> | até 5 dias úteis    | --> |                    |
+---------------------+     +---------------------+     +--------------------+
                                                                |
           +----------------------------------------------------+
           |                        |                           |
           v                        v                           v
  +----------------+     +---------------------+     +------------------+
  | APROVADO       |     | PARCIAL APROVADO    |     | REJEITADO        |
  | (docs OK)      |     | (docs incompletos)  |     | (problemas)      |
  +----------------+     +---------------------+     +------------------+
           |                        |                           |
           |                        |                           |
           v                        v                           v
  +-----------------------------------------------------+   Cliente
  | EM_ORGANIZACAO / ENVIADO_JURIDICO                   |   corrige e
  | (5 dias para enviar ao Jurídico)                    |   reenvia
  +-----------------------------------------------------+
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
   D+3: Alerta        D+5: Alerta          D+8: Alerta
   Técnico (diário)   Coordenador          ADM
```

---

## Alertas SLA - Revisão Técnica

### Fase 1: Revisão da Documentação (status: DOCUMENTOS_EM_CONFERENCIA)

| Tempo | Destinatário | Ação |
|-------|--------------|------|
| D+2 (48h) | Técnico atribuído | Notificação: "Documentos aguardam revisão há 48h" |
| D+2+ | Técnico | Alertas diários até conclusão |
| D+5 | Coordenador/Manager | Notificação: "Revisão técnica atrasada 5 dias" |
| D+7 | Admin | Notificação: "Revisão técnica crítica - 7 dias" |

### Fase 2: Envio ao Jurídico (status: EM_ORGANIZACAO ou DOCUMENTACAO_PARCIAL_APROVADA)

| Tempo | Destinatário | Ação |
|-------|--------------|------|
| D+3 após aprovação | Técnico | Alerta diário: "Faltam 2 dias para enviar ao Jurídico" |
| D+5 | Coordenador | Notificação: "Prazo de envio ao Jurídico estourado" |
| D+8 | Admin | Notificação: "Atraso crítico - 3 dias após prazo" |

---

## Implementação

### 1. Novas Configurações SLA (system_config)

```sql
INSERT INTO system_config (key, value, description) VALUES
  -- Revisão Técnica
  ('sla_tech_review_tech_alert_hours', '48', 'Horas após documentos completos para alertar técnico'),
  ('sla_tech_review_coord_alert_days', '5', 'Dias para alertar coordenador sobre revisão pendente'),
  ('sla_tech_review_admin_alert_days', '7', 'Dias para alertar admin sobre revisão pendente'),
  
  -- Envio ao Jurídico
  ('sla_send_legal_tech_alert_days', '3', 'Dias após aprovação para alertar técnico sobre envio'),
  ('sla_send_legal_coord_alert_days', '5', 'Dias para alertar coordenador sobre envio ao jurídico'),
  ('sla_send_legal_admin_alert_days', '8', 'Dias para alertar admin sobre envio ao jurídico')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

### 2. Nova Tabela de Rastreamento (ou reutilizar document_reminders)

Vamos reutilizar a tabela `document_reminders` já existente, adicionando novos tipos:
- `TECH_REVIEW_D2`, `TECH_REVIEW_D3`, ... (alertas de revisão técnica)
- `SEND_LEGAL_D3`, `SEND_LEGAL_D4`, ... (alertas de envio ao jurídico)

---

### 3. Atualização do Edge Function (sla-automations)

#### Seção 10: TECHNICAL REVIEW ALERTS (Refatoração Completa)

```typescript
// =====================================================
// 10. TECHNICAL REVIEW ALERTS (Enhanced)
// =====================================================
if (shouldRun('TECHNICAL')) {
  console.log('Running TECHNICAL automation (enhanced)...')
  
  // Cases in DOCUMENTOS_EM_CONFERENCIA with documents_completed_at
  const { data: casesInReview } = await supabase
    .from('service_cases')
    .select(`
      id, documents_completed_at, assigned_to_user_id, client_user_id,
      opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
    `)
    .eq('technical_status', 'DOCUMENTOS_EM_CONFERENCIA')
    .not('documents_completed_at', 'is', null)
  
  for (const sc of casesInReview || []) {
    const completedAt = new Date(sc.documents_completed_at)
    const hoursSinceComplete = (now.getTime() - completedAt.getTime()) / (60 * 60 * 1000)
    const daysSinceComplete = hoursSinceComplete / 24
    const caseShortId = sc.id.slice(0, 8)
    const clientName = sc.opportunities?.leads?.contacts?.full_name
    
    // D+2 (48h) - Daily alerts to technician
    if (hoursSinceComplete >= slaMap.sla_tech_review_tech_alert_hours) {
      const dayKey = Math.floor(daysSinceComplete)
      const reminderKey = `TECH_REVIEW_D${dayKey}`
      
      if (!(await docReminderSent(sc.id, reminderKey))) {
        if (sc.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: sc.assigned_to_user_id,
            type: 'tech_review_pending',
            title: 'Revisão Técnica Pendente',
            message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias.`
          })
        }
        await recordDocReminder(sc.id, reminderKey, 'TECH')
        results.technicalReviewAlerts++
      }
    }
    
    // D+5 - Coordinator alert
    if (daysSinceComplete >= slaMap.sla_tech_review_coord_alert_days) {
      if (!(await docReminderSent(sc.id, 'TECH_REVIEW_COORD'))) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'tech_review_overdue_coord',
            title: 'Revisão Técnica Atrasada',
            message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias.`
          })
        }
        await recordDocReminder(sc.id, 'TECH_REVIEW_COORD', 'COORD')
        results.technicalReviewAlerts++
      }
    }
    
    // D+7 - Admin alert
    if (daysSinceComplete >= slaMap.sla_tech_review_admin_alert_days) {
      if (!(await docReminderSent(sc.id, 'TECH_REVIEW_ADMIN'))) {
        const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
        for (const admin of admins || []) {
          await supabase.from('notifications').insert({
            user_id: admin.user_id,
            type: 'tech_review_critical',
            title: '🚨 Revisão Técnica Crítica',
            message: `Caso ${caseShortId} de ${clientName} aguarda revisão há ${Math.floor(daysSinceComplete)} dias!`
          })
        }
        await recordDocReminder(sc.id, 'TECH_REVIEW_ADMIN', 'ADMIN')
        results.technicalReviewAlerts++
      }
    }
  }
}
```

#### Seção 11: SEND TO LEGAL ALERTS (Refatoração Completa)

```typescript
// =====================================================
// 11. SEND TO LEGAL ALERTS (Enhanced)
// =====================================================
if (shouldRun('LEGAL')) {
  console.log('Running LEGAL automation (enhanced)...')
  
  // Cases approved but not sent to legal
  const { data: approvedCases } = await supabase
    .from('service_cases')
    .select(`
      id, technical_approved_at, assigned_to_user_id,
      opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
    `)
    .in('technical_status', ['EM_ORGANIZACAO', 'PRONTO_PARA_SUBMISSAO', 'DOCUMENTACAO_PARCIAL_APROVADA'])
    .not('technical_approved_at', 'is', null)
    .is('sent_to_legal_at', null)
  
  for (const sc of approvedCases || []) {
    const approvedAt = new Date(sc.technical_approved_at)
    const daysSinceApproval = (now.getTime() - approvedAt.getTime()) / (24 * 60 * 60 * 1000)
    const caseShortId = sc.id.slice(0, 8)
    const clientName = sc.opportunities?.leads?.contacts?.full_name
    
    // D+3 - Daily alerts to technician (2 days before deadline)
    if (daysSinceApproval >= slaMap.sla_send_legal_tech_alert_days) {
      const dayKey = Math.floor(daysSinceApproval)
      const reminderKey = `SEND_LEGAL_D${dayKey}`
      
      if (!(await docReminderSent(sc.id, reminderKey))) {
        if (sc.assigned_to_user_id) {
          const daysRemaining = Math.max(0, 5 - Math.floor(daysSinceApproval))
          await supabase.from('notifications').insert({
            user_id: sc.assigned_to_user_id,
            type: 'send_to_legal_reminder',
            title: 'Enviar ao Jurídico',
            message: daysRemaining > 0 
              ? `Caso ${caseShortId} de ${clientName}: faltam ${daysRemaining} dias para enviar ao Jurídico.`
              : `Caso ${caseShortId} de ${clientName}: prazo de envio ao Jurídico estourado!`
          })
        }
        await recordDocReminder(sc.id, reminderKey, 'TECH')
        results.sendToLegalAlerts++
      }
    }
    
    // D+5 - Coordinator alert
    if (daysSinceApproval >= slaMap.sla_send_legal_coord_alert_days) {
      if (!(await docReminderSent(sc.id, 'SEND_LEGAL_COORD'))) {
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER')
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'send_to_legal_overdue_coord',
            title: 'Prazo de Envio ao Jurídico Estourado',
            message: `Caso ${caseShortId} de ${clientName} aprovado há ${Math.floor(daysSinceApproval)} dias e não foi enviado ao Jurídico.`
          })
        }
        await recordDocReminder(sc.id, 'SEND_LEGAL_COORD', 'COORD')
        results.sendToLegalAlerts++
      }
    }
    
    // D+8 - Admin alert
    if (daysSinceApproval >= slaMap.sla_send_legal_admin_alert_days) {
      if (!(await docReminderSent(sc.id, 'SEND_LEGAL_ADMIN'))) {
        const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN')
        for (const admin of admins || []) {
          await supabase.from('notifications').insert({
            user_id: admin.user_id,
            type: 'send_to_legal_critical',
            title: '🚨 Atraso Crítico - Envio ao Jurídico',
            message: `Caso ${caseShortId} de ${clientName} com ${Math.floor(daysSinceApproval)} dias desde aprovação técnica!`
          })
        }
        await recordDocReminder(sc.id, 'SEND_LEGAL_ADMIN', 'ADMIN')
        results.sendToLegalAlerts++
      }
    }
  }
}
```

---

### 4. Atualização do Hook useCases.ts

Adicionar funções para aprovar documentação e enviar ao jurídico com timestamps:

```typescript
const approveDocumentation = useMutation({
  mutationFn: async ({ id, partial = false }: { id: string; partial?: boolean }) => {
    const status = partial ? 'DOCUMENTACAO_PARCIAL_APROVADA' : 'EM_ORGANIZACAO';
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        technical_status: status,
        technical_approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['service-cases'] });
    toast({ title: 'Documentação aprovada com sucesso' });
  },
});

const sendToLegal = useMutation({
  mutationFn: async (id: string) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        technical_status: 'ENVIADO_JURIDICO',
        sent_to_legal_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['service-cases'] });
    queryClient.invalidateQueries({ queryKey: ['legal-cases'] });
    toast({ title: 'Caso enviado ao Jurídico' });
  },
});
```

---

### 5. Atualização do CaseDetail.tsx

Modificar os handlers de aprovação para usar os novos métodos:

```typescript
// Approvar documentação completa
const handleApproveDocumentation = async () => {
  await updateCase.mutateAsync({
    id: serviceCase.id,
    technical_status: 'EM_ORGANIZACAO' as any,
    technical_approved_at: new Date().toISOString(),
  });
};

// Aprovar documentação parcial
const handleApprovePartialDocumentation = async () => {
  await updateCase.mutateAsync({
    id: serviceCase.id,
    technical_status: 'DOCUMENTACAO_PARCIAL_APROVADA' as any,
    technical_approved_at: new Date().toISOString(),
  });
};

// Enviar ao Jurídico
const handleSendToJuridico = async () => {
  await updateCase.mutateAsync({
    id: serviceCase.id,
    technical_status: 'ENVIADO_JURIDICO' as any,
    sent_to_legal_at: new Date().toISOString(),
  });
};
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Refatorar seções 10 (TECHNICAL) e 11 (LEGAL) |
| `src/hooks/useCases.ts` | Adicionar `approveDocumentation` e `sendToLegal` mutations |
| `src/pages/cases/CaseDetail.tsx` | Atualizar handlers para gravar timestamps |

---

## Migração SQL

```sql
-- Adicionar novas configurações SLA
INSERT INTO system_config (key, value, description) VALUES
  ('sla_tech_review_tech_alert_hours', '48', 'Horas para alertar técnico sobre revisão pendente'),
  ('sla_tech_review_coord_alert_days', '5', 'Dias para alertar coordenador sobre revisão pendente'),
  ('sla_tech_review_admin_alert_days', '7', 'Dias para alertar admin sobre revisão pendente'),
  ('sla_send_legal_tech_alert_days', '3', 'Dias para alertar técnico sobre envio ao jurídico'),
  ('sla_send_legal_coord_alert_days', '5', 'Dias para alertar coordenador sobre envio ao jurídico'),
  ('sla_send_legal_admin_alert_days', '8', 'Dias para alertar admin sobre envio ao jurídico')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

## Resultado Esperado

1. Técnicos recebem alertas diários após 48h de documentos completos
2. Coordenadores são escalados após 5 dias sem revisão
3. Admins são alertados após 7 dias (situação crítica)
4. Após aprovação técnica, alertas diários a partir de D+3 para enviar ao Jurídico
5. Escalação para Coordenador em D+5 e Admin em D+8
6. Todos os alertas são rastreados para evitar duplicação
7. Timestamps são gravados automaticamente nas transições de status

---

## Fluxo de Status Atualizado

```text
DOCUMENTOS_EM_CONFERENCIA
         |
    +----+----+
    |         |
    v         v
EM_ORGANIZACAO    DOCUMENTACAO_PARCIAL_APROVADA
    |                       |
    +----------+------------+
               |
               v
        ENVIADO_JURIDICO
               |
               v
        PRONTO_PARA_SUBMISSAO
               |
               v
           PROTOCOLADO
```

