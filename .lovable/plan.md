
# Plano: Aprovação do Pedido e Etapas Finais (Etapa 9)

## Resumo da Análise

Após análise detalhada do código existente, identifiquei que a maior parte da infraestrutura para as etapas finais já existe:

### O que já existe
| Funcionalidade | Status | Localização |
|----------------|--------|-------------|
| Status `AGENDAR_HUELLAS` | ✅ | TechnicalStatus enum |
| Status `AGUARDANDO_CITA_HUELLAS` | ✅ | TechnicalStatus enum |
| Status `HUELLAS_REALIZADO` | ✅ | TechnicalStatus enum |
| Status `DISPONIVEL_RETIRADA_TIE` | ✅ | TechnicalStatus enum |
| Status `AGUARDANDO_CITA_RETIRADA` | ✅ | TechnicalStatus enum |
| Status `TIE_RETIRADO` | ✅ | TechnicalStatus enum |
| Status `ENCERRADO_APROVADO` | ✅ | TechnicalStatus enum |
| Componente `HuellasSection` | ✅ | Agendamento e marcação de huellas |
| Componente `TiePickupSection` | ✅ | Registro de lote, validade e retirada |
| Campo `tie_validity_date` | ✅ | service_cases |
| Campo `decision_date` | ✅ | service_cases |
| Notificação NPS após aprovação | ✅ | useCases.closeCase |
| WhatsApp templates (protocolo, huellas) | ✅ | SendWhatsAppButton |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Status `APROVADO_INTERNAMENTE`** | Novo status intermediário antes de contatar o cliente |
| **Campo `approval_date`** | Data da resolução favorável |
| **Campo `residencia_validity_date`** | Validade do status de residente (além do TIE) |
| **Notificação de aprovação interna** | Alertar Técnico, Coord e ADM quando jurídico marca aprovação |
| **Template WhatsApp de parabéns** | Mensagem automática após contato com cliente |
| **Ação "Registrar Aprovação"** | Dialog com campos para data e validade |
| **Seção de Aprovação no CaseDetail** | Card com informações de validade e próximas etapas |
| **Automação APPROVAL** no sla-automations | Notificações após aprovação interna |

---

## Alterações no Banco de Dados

### 1. Adicionar novo valor ao enum `technical_status`

```sql
ALTER TYPE technical_status ADD VALUE IF NOT EXISTS 'APROVADO_INTERNAMENTE' 
  BEFORE 'AGENDAR_HUELLAS';
```

### 2. Adicionar campos à tabela `service_cases`

```sql
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS approval_date DATE,
ADD COLUMN IF NOT EXISTS residencia_validity_date DATE,
ADD COLUMN IF NOT EXISTS approval_notified_client BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approval_whatsapp_sent_at TIMESTAMPTZ;
```

**Explicação dos campos:**
- `approval_date`: Data em que a resolução favorável foi recebida
- `residencia_validity_date`: Até quando o status de residente está concedido
- `approval_notified_client`: Flag indicando que o cliente já foi contatado
- `approval_whatsapp_sent_at`: Quando a mensagem automática de parabéns foi enviada

---

## Fluxo Visual

```text
     RESOLUÇÃO FAVORÁVEL RECEBIDA
                │
                ▼
   ┌────────────────────────────────┐
   │ Jurídico muda status para      │
   │ APROVADO_INTERNAMENTE          │
   │ ► Registra approval_date       │
   │ ► Registra residencia_validity │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ Sistema notifica:              │
   │ • Técnico responsável          │
   │ • Coordenador                  │
   │ • ADM                          │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ Técnico entra em contato       │
   │ com cliente (dar a notícia!)   │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ Técnico clica "Cliente         │
   │ Contactado"                    │
   │ ► Status: AGENDAR_HUELLAS      │
   │ ► Sistema envia WhatsApp auto  │
   │   de parabéns + instruções     │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ Fluxo de Huellas existente     │
   │ (já implementado)              │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ Fluxo de TIE existente         │
   │ (já implementado)              │
   └────────────────────────────────┘
                │
                ▼
   ┌────────────────────────────────┐
   │ TIE_RETIRADO → Encerrar Caso   │
   │ ► NPS survey (já implementado) │
   └────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

### 1. **Novo Componente: ApprovalSection.tsx**

```text
src/components/cases/ApprovalSection.tsx
```

Funcionalidades:
- Exibe informações da aprovação (data, validade)
- Card visual destacado (verde/celebração)
- Botão "Registrar Aprovação" (para status anterior)
- Botão "Cliente Contactado" (para APROVADO_INTERNAMENTE)
- Exibe data de validade da residência
- Checklist de próximas etapas

### 2. **Modificar: src/types/database.ts**

Adicionar novo status:

```typescript
export type TechnicalStatus = 
  | ...
  | 'APROVADO_INTERNAMENTE'  // Novo - antes de AGENDAR_HUELLAS
  | 'AGENDAR_HUELLAS'
  | ...

export const TECHNICAL_STATUS_LABELS: Record<TechnicalStatus, string> = {
  ...
  APROVADO_INTERNAMENTE: 'Aprovado (Aguardando Contato)',
  ...
};
```

### 3. **Modificar: src/hooks/useCases.ts**

Adicionar mutações:

```typescript
const registerApproval = useMutation({
  mutationFn: async ({ 
    id, 
    approvalDate, 
    residenciaValidityDate 
  }: { 
    id: string; 
    approvalDate: string;
    residenciaValidityDate?: string;
  }) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        technical_status: 'APROVADO_INTERNAMENTE',
        approval_date: approvalDate,
        residencia_validity_date: residenciaValidityDate,
        decision_result: 'APROVADO',
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Notificar equipe interna
    // ... criar notificações para tech, coord, admin
    
    return data;
  },
});

const confirmClientContact = useMutation({
  mutationFn: async (id: string) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        technical_status: 'AGENDAR_HUELLAS',
        approval_notified_client: true,
      })
      .eq('id', id)
      .select(`
        *,
        opportunities (leads (contacts (phone, full_name)))
      `)
      .single();
    
    if (error) throw error;
    
    // Enviar WhatsApp automático de parabéns
    // ...
    
    return data;
  },
});
```

### 4. **Modificar: src/pages/cases/CaseDetail.tsx**

Na seção de ações disponíveis:
- Adicionar botão "Registrar Aprovação" (para status PROTOCOLADO/EM_ACOMPANHAMENTO)
- Adicionar botão "Cliente Contactado" (para status APROVADO_INTERNAMENTE)

Adicionar `ApprovalSection` visível quando status é:
- APROVADO_INTERNAMENTE
- AGENDAR_HUELLAS
- AGUARDANDO_CITA_HUELLAS
- HUELLAS_REALIZADO
- DISPONIVEL_RETIRADA_TIE
- AGUARDANDO_CITA_RETIRADA
- TIE_RETIRADO
- ENCERRADO_APROVADO

### 5. **Modificar: src/components/cases/SendWhatsAppButton.tsx**

Adicionar novo template:

```typescript
{
  id: 'approval_congratulations',
  label: 'Parabéns pela Aprovação',
  message: `🎉 Parabéns {nome}! 🎉

Temos uma ÓTIMA notícia! Seu processo de {servico} foi APROVADO!

✅ Resolução favorável recebida
📅 Validade da residência: {residencia_validity}

Próximos passos:
1️⃣ Agendaremos sua tomada de impressões digitais (huellas)
2️⃣ Após as huellas, aguardaremos a emissão do seu TIE
3️⃣ Quando o TIE estiver pronto, avisaremos para retirada

Qualquer dúvida, estamos à disposição!

Equipe CB Asesoria 🙌`,
}
```

### 6. **Modificar: supabase/functions/sla-automations/index.ts**

Adicionar seção `APPROVAL`:

```typescript
type AutomationType = 
  | ...
  | 'APPROVAL'  // Novo

// =====================================================
// XX. APPROVAL NOTIFICATIONS
// =====================================================
if (shouldRun('APPROVAL')) {
  console.log('Running APPROVAL automation...')
  
  // Find cases that just moved to APROVADO_INTERNAMENTE
  // and haven't notified the team yet
  const { data: approvedCases } = await supabase
    .from('service_cases')
    .select(`
      id, assigned_to_user_id, approval_date,
      opportunities!inner (leads!inner (contacts!inner (full_name)))
    `)
    .eq('technical_status', 'APROVADO_INTERNAMENTE')
    .is('approval_notified_client', false)
  
  for (const caseData of approvedCases || []) {
    const clientName = caseData.opportunities?.leads?.contacts?.full_name || 'Cliente'
    
    // Notify assigned technician
    if (caseData.assigned_to_user_id) {
      await supabase.from('notifications').insert({
        user_id: caseData.assigned_to_user_id,
        type: 'case_approved',
        title: '🎉 Processo Aprovado!',
        message: `O processo de ${clientName} foi aprovado! Entre em contato para dar a boa notícia.`
      })
    }
    
    // Notify coordinators
    const { data: managers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'MANAGER')
    
    for (const mgr of managers || []) {
      await supabase.from('notifications').insert({
        user_id: mgr.user_id,
        type: 'case_approved',
        title: '🎉 Aprovação Registrada',
        message: `Processo de ${clientName} aprovado!`
      })
    }
    
    // Notify admins
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'ADMIN')
    
    for (const admin of admins || []) {
      await supabase.from('notifications').insert({
        user_id: admin.user_id,
        type: 'case_approved',
        title: '🎉 Aprovação Registrada',
        message: `Processo de ${clientName} aprovado!`
      })
    }
    
    results.approvalNotifications++
  }
}
```

---

## Componente ApprovalSection - Detalhes

```text
┌─────────────────────────────────────────────────────────┐
│  🎉 PROCESSO APROVADO                                   │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ Data da Aprovação   │  │ Validade Residência │      │
│  │ 15/01/2026          │  │ 15/01/2028          │      │
│  └─────────────────────┘  └─────────────────────┘      │
│                                                         │
│  Status: ✅ Cliente contactado em 16/01/2026            │
│                                                         │
│  Próximas etapas:                                       │
│  □ Agendar tomada de huellas                            │
│  □ Aguardar emissão do TIE                              │
│  □ Retirar TIE                                          │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │     [Cliente Contactado - Avançar]          │       │
│  └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Validação de Renovações

O campo `residencia_validity_date` será usado para:
1. Exibir na UI a data até quando o cliente está regular
2. Futuramente: alertas de renovação (ex: 6 meses antes do vencimento)

---

## Ordem de Implementação

1. **Migração do banco** (novo status + campos)
2. **Atualizar types/database.ts** (adicionar status)
3. **Componente ApprovalSection**
4. **Hook useCases** (novas mutações)
5. **CaseDetail.tsx** (integrar seção + botões)
6. **SendWhatsAppButton** (novo template)
7. **sla-automations** (seção APPROVAL)
8. **Regenerar types.ts do Supabase**

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/new_migration.sql` | Novo status + campos |
| `src/integrations/supabase/types.ts` | Regenerar tipos |
| `src/types/database.ts` | Adicionar status e labels |
| `src/components/cases/ApprovalSection.tsx` | Novo componente |
| `src/hooks/useCases.ts` | registerApproval + confirmClientContact |
| `src/pages/cases/CaseDetail.tsx` | Integrar ApprovalSection |
| `src/components/cases/SendWhatsAppButton.tsx` | Template de parabéns |
| `supabase/functions/sla-automations/index.ts` | Seção APPROVAL |

---

## Testes Recomendados

1. Registrar aprovação de um caso em acompanhamento
2. Verificar notificações para técnico, coord e admin
3. Clicar "Cliente Contactado" e verificar:
   - Status muda para AGENDAR_HUELLAS
   - WhatsApp de parabéns é enviado (se configurado)
4. Verificar que dados de validade aparecem no card
5. Seguir fluxo completo: Huellas → TIE → Encerramento
6. Verificar que NPS é enviado ao final (já implementado)
