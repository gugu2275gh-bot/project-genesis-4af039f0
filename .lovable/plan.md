
# Plano: Notificacao Automatica e Lembretes de Retirada de TIE (Sem Cita)

## Visao Geral

Implementar o fluxo de notificacao automatica para retirada de TIE quando **NAO** e necessario agendamento previo:

1. Notificacao imediata ao cliente quando tecnico marca TIE como disponivel
2. Lembretes periodicos a cada 3 dias uteis ate confirmacao de retirada
3. Cessamento automatico dos lembretes quando cliente confirma retirada

---

## Componentes a Implementar

### 1. Notificacao Imediata ao Marcar TIE Disponivel

**Quando:** Tecnico clica em "Registrar TIE Disponivel" na `ResguardoUploadSection`

**Acao automatica:**
- Enviar WhatsApp ao cliente com instrucoes de retirada
- Marcar `tie_ready_notification_sent = true`
- Registrar mensagem no historico do CRM (`mensagens_cliente`)
- Criar notificacao interna no portal do cliente

**Template de mensagem:**
```
Ola {nome}! Otimas noticias! Seu TIE esta disponivel para retirada.

Local: Comisaria de Policia Nacional
Documentos necessarios: Passaporte, Resguardo de Huellas e Comprovante Taxa 790

Voce pode retirar a qualquer momento no horario de atendimento. Por favor, retire o mais breve possivel.
```

---

### 2. Tabela de Controle de Lembretes

**Nova tabela:** `tie_pickup_reminders`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | uuid | Chave primaria |
| service_case_id | uuid | Referencia ao caso |
| reminder_type | text | Tipo do lembrete (TIE_READY, TIE_D3, TIE_D6, etc.) |
| sent_at | timestamptz | Data/hora de envio |
| created_at | timestamptz | Data de criacao |

---

### 3. Lembretes Periodicos na Edge Function

**Localizacao:** `supabase/functions/sla-automations/index.ts` - secao TIE_PICKUP

**Logica atualizada:**

```text
Para cada caso com:
  - technical_status = 'DISPONIVEL_RETIRADA_TIE'
  - tie_pickup_requires_appointment = false
  - tie_picked_up = false

Calcular dias desde tie_estimated_ready_date (ou tie_lot_number registration)

A cada 3 dias uteis:
  - Verificar se lembrete deste ciclo ja foi enviado
  - Se nao: enviar WhatsApp + notificacao portal
  - Registrar em tie_pickup_reminders
```

**Ciclos de lembrete:**
- D+3: Primeiro lembrete
- D+6: Segundo lembrete  
- D+9: Terceiro lembrete
- D+12: Quarto lembrete (alerta interno ao tecnico)
- D+15+: Continua a cada 3 dias com alerta ao coordenador

**Template de lembrete:**
```
Ola {nome}! Lembramos que seu TIE esta disponivel para retirada na Comisaria. Por favor, retire o documento o mais breve possivel. Documentos: Passaporte, Resguardo e Taxa 790.
```

---

### 4. Integracao Frontend - Notificacao Automatica

**Modificar:** `ResguardoUploadSection.tsx` e `useCases.ts`

Quando `registerTieAvailable` for chamado com `requiresAppointment = false`:
1. Atualizar campos do caso no banco
2. Automaticamente chamar edge function `send-whatsapp`
3. Marcar `tie_ready_notification_sent = true`
4. Registrar lembrete inicial como TIE_READY

---

### 5. Cessamento de Lembretes

**Gatilho:** Quando `confirmTiePickup` e executado

**Acao:** 
- Marcar `tie_picked_up = true`
- Status transiciona para `TIE_RETIRADO`
- Lembretes automaticamente cessam (query ignora casos com `tie_picked_up = true`)

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/migrations/XXX_tie_pickup_reminders.sql` | Criar tabela de lembretes |
| `supabase/functions/sla-automations/index.ts` | Atualizar secao TIE_PICKUP |
| `src/hooks/useCases.ts` | Adicionar envio automatico de WhatsApp no registro |
| `src/components/cases/ResguardoUploadSection.tsx` | Integrar notificacao automatica |

---

## Fluxo Detalhado

```text
Tecnico registra TIE disponivel (sem cita)
              │
              ▼
┌─────────────────────────────────────┐
│  Sistema automaticamente:           │
│  1. Envia WhatsApp ao cliente       │
│  2. Cria notificacao no portal      │
│  3. Marca notification_sent = true  │
│  4. Registra lembrete TIE_READY     │
└─────────────────────────────────────┘
              │
              ▼ (3 dias depois)
┌─────────────────────────────────────┐
│  Cron job verifica:                 │
│  - TIE nao retirado?                │
│  - Lembrete D3 ja enviado?          │
│  Se nao: envia lembrete             │
└─────────────────────────────────────┘
              │
              ▼ (repete a cada 3 dias)
              ...
              │
              ▼
┌─────────────────────────────────────┐
│  Cliente confirma retirada          │
│  ou                                 │
│  Tecnico marca como retirado        │
│  → Lembretes cessam automaticamente │
└─────────────────────────────────────┘
```

---

## Secao Tecnica

### Migracao SQL

```sql
CREATE TABLE IF NOT EXISTS tie_pickup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id uuid NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tie_pickup_reminders_case ON tie_pickup_reminders(service_case_id);
CREATE UNIQUE INDEX idx_tie_pickup_reminders_unique ON tie_pickup_reminders(service_case_id, reminder_type);
```

### Edge Function - Logica Atualizada

```typescript
// TIE PICKUP REMINDERS (SEM CITA)
if (shouldRun('TIE_PICKUP')) {
  const { data: tieReady } = await supabase
    .from('service_cases')
    .select(`
      id, tie_estimated_ready_date, tie_lot_number, tie_picked_up,
      tie_pickup_requires_appointment, tie_ready_notification_sent, client_user_id,
      opportunities!inner (leads!inner (id, contacts!inner (full_name, phone)))
    `)
    .eq('technical_status', 'DISPONIVEL_RETIRADA_TIE')
    .eq('tie_pickup_requires_appointment', false)
    .eq('tie_picked_up', false)

  for (const sc of tieReady || []) {
    const referenceDate = sc.tie_estimated_ready_date || sc.updated_at
    const daysSinceReady = Math.floor((now - new Date(referenceDate)) / (24*60*60*1000))
    
    // Calcular ciclo de 3 dias
    const reminderCycle = Math.floor(daysSinceReady / 3)
    const reminderKey = `TIE_D${reminderCycle * 3}`
    
    if (!(await tieReminderSent(sc.id, reminderKey))) {
      // Enviar WhatsApp
      await sendWhatsApp(contact.phone, templateTieReminder, leadId)
      // Registrar lembrete
      await supabase.from('tie_pickup_reminders').insert({...})
      // Notificacao portal
      if (sc.client_user_id) {
        await supabase.from('notifications').insert({...})
      }
      // Alerta interno D+12+
      if (daysSinceReady >= 12) {
        // Notificar tecnico/coordenador
      }
    }
  }
}
```

### Hook useCases - Registro com Notificacao

```typescript
const registerTieAvailable = useMutation({
  mutationFn: async ({ id, lotNumber, validityDate, estimatedReadyDate, requiresAppointment }) => {
    // 1. Atualizar caso
    const { data, error } = await supabase.from('service_cases').update({...})
    
    // 2. Se NAO requer cita, enviar notificacao imediata
    if (!requiresAppointment) {
      // Buscar dados do cliente
      const { data: caseData } = await supabase
        .from('service_cases')
        .select('opportunities (leads (id, contacts (full_name, phone)))')
        .eq('id', id)
        .single()
      
      const contact = caseData.opportunities.leads.contacts
      const leadId = caseData.opportunities.leads.id
      
      // Enviar WhatsApp
      await supabase.functions.invoke('send-whatsapp', {
        body: { 
          mensagem: `Ola ${contact.full_name}! Seu TIE esta disponivel...`,
          numero: contact.phone 
        }
      })
      
      // Marcar como notificado
      await supabase.from('service_cases')
        .update({ tie_ready_notification_sent: true })
        .eq('id', id)
      
      // Registrar lembrete inicial
      await supabase.from('tie_pickup_reminders').insert({
        service_case_id: id,
        reminder_type: 'TIE_READY'
      })
    }
    
    return data
  }
})
```

---

## Configuracoes SLA (system_config)

| Chave | Valor Padrao | Descricao |
|-------|--------------|-----------|
| `sla_tie_pickup_reminder_days` | 3 | Intervalo entre lembretes |
| `sla_tie_pickup_tech_alert_days` | 12 | Dias ate alertar tecnico |
| `sla_tie_pickup_coord_alert_days` | 15 | Dias ate alertar coordenador |
| `template_tie_available_direct` | (texto) | Template para retirada direta |
| `template_tie_reminder_direct` | (texto) | Template para lembrete |

---

## Resumo de Implementacao

1. **Migracao SQL** - Criar tabela `tie_pickup_reminders`
2. **Edge Function** - Atualizar secao TIE_PICKUP com logica de lembretes ciclicos
3. **useCases.ts** - Adicionar envio automatico de WhatsApp ao registrar TIE
4. **ResguardoUploadSection** - Feedback visual de notificacao enviada

**Estimativa:** 1 iteracao de desenvolvimento
