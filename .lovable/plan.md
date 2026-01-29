
# Plano: Agendamento da Tomada de Impressões Digitais (Etapa 10)

## Resumo da Análise

Após análise detalhada do código existente, identifiquei uma infraestrutura básica já implementada:

### O que já existe
| Funcionalidade | Status | Localização |
|----------------|--------|-------------|
| Componente `HuellasSection` | ✅ | Agendamento básico (data, hora, local) |
| Status `AGENDAR_HUELLAS` | ✅ | TechnicalStatus enum |
| Status `AGUARDANDO_CITA_HUELLAS` | ✅ | TechnicalStatus enum |
| Status `HUELLAS_REALIZADO` | ✅ | TechnicalStatus enum |
| Campos `huellas_date`, `huellas_time`, `huellas_location` | ✅ | service_cases |
| Campo `huellas_completed` | ✅ | service_cases |
| Geração de EX17 (PDF) | ✅ | lib/generate-ex17.ts |
| Geração de Taxa 790/012 (PDF) | ✅ | lib/generate-taxa790.ts |
| Template WhatsApp `template_huellas_scheduled` | ✅ | system_config |
| Template `huellas_reminder` | ✅ | SendWhatsAppButton |
| Tab de Huellas no CaseDetail | ✅ | CaseDetail.tsx |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Campo `empadronamiento_valid`** | Checkbox/flag indicando se empadronamento está OK |
| **Campo `empadronamiento_expected_date`** | Data prevista para obter empadronamento |
| **Campo `huellas_requested_at`** | Quando o agendamento foi solicitado |
| **Campo `huellas_scheduler_notified`** | Flag que o agendador foi notificado |
| **Campo `huellas_appointment_confirmation_url`** | Comprovante da cita |
| **Validação de antecedência mínima (7 dias)** | UI e lógica |
| **SLA de 48h para contato pós-aprovação** | Alertas escalonados |
| **Notificação ao agendador** | Email/notificação quando status muda para AGENDAR_HUELLAS |
| **Checklist de documentos para cliente** | Lista completa com itens do fluxo |
| **Template WhatsApp de instruções** | Mensagem detalhada com documentos e instruções |
| **Seção de pré-requisitos** | UI para verificar empadronamento |

---

## Alterações no Banco de Dados

### 1. Adicionar campos à tabela `service_cases`

```sql
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS empadronamiento_valid BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS empadronamiento_expected_date DATE,
ADD COLUMN IF NOT EXISTS empadronamiento_notes TEXT,
ADD COLUMN IF NOT EXISTS huellas_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS huellas_scheduler_notified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS huellas_appointment_confirmation_url TEXT,
ADD COLUMN IF NOT EXISTS huellas_client_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS huellas_instructions_sent BOOLEAN DEFAULT false;
```

### 2. Criar tabela `huellas_reminders` para rastrear alertas

```sql
CREATE TABLE IF NOT EXISTS huellas_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_case_id UUID NOT NULL REFERENCES service_cases(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'SCHEDULE_48H', 'D7_PREP', 'D3_PREP', 'D1_PREP', 'EMPAD_WAITING'
  recipient_type TEXT NOT NULL, -- 'TECH', 'SCHEDULER', 'CLIENT', 'COORD'
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_huellas_reminders ON huellas_reminders(service_case_id, reminder_type);
```

---

## Fluxo Visual

```text
     APROVADO_INTERNAMENTE → AGENDAR_HUELLAS
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Técnico entra em contato em até 48h         │
   │ ► Sistema monitora e alerta se não contatar │
   └─────────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    EMPAD OK?              EMPAD NÃO OK
       │                        │
       │                        ▼
       │              ┌────────────────────────┐
       │              │ Registrar data prevista │
       │              │ empadronamiento_        │
       │              │ expected_date           │
       │              └────────────────────────┘
       │                        │
       │                        ▼
       │              ┌────────────────────────┐
       │              │ Sistema monitora e     │
       │              │ aguarda data prevista  │
       │              │ ► Alertas semanais     │
       │              └────────────────────────┘
       │                        │
       ◄────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Cliente informa disponibilidade             │
   │ (mínimo 7 dias de antecedência)            │
   └─────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Técnico clica "Solicitar Agendamento"      │
   │ ► Status: AGUARDANDO_CITA_HUELLAS          │
   │ ► Sistema notifica AGENDADOR por email     │
   │ ► Registra huellas_requested_at            │
   └─────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Agendador registra cita (data, hora, local)│
   │ ► Sistema envia WhatsApp ao cliente        │
   │ ► Cliente recebe lista de documentos       │
   └─────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Lembretes automáticos:                     │
   │ • D-7: Enviar instruções completas         │
   │ • D-3: Lembrete + checklist                │
   │ • D-1: Lembrete final                      │
   └─────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │ Após cita, cliente envia resguardo         │
   │ ► Técnico marca "Huellas Realizado"        │
   │ ► Status: HUELLAS_REALIZADO                │
   └─────────────────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

### 1. **Modificar: src/components/cases/HuellasSection.tsx**

Expandir componente para incluir:

**Seção de Pré-requisitos:**
- Checkbox "Empadronamento Atualizado" (`empadronamiento_valid`)
- Campo de data "Data Prevista para Empadronamento" (se não válido)
- Campo de observações sobre empadronamento

**Validação de Agendamento:**
- Verificar que data selecionada é >= 7 dias no futuro
- Mostrar aviso se cliente não tem empadronamento válido
- Botão "Solicitar Agendamento" (diferente de "Confirmar Cita")

**Novo Fluxo:**
1. Técnico marca pré-requisitos OK
2. Técnico clica "Solicitar Agendamento" → notifica agendador
3. Agendador preenche data/hora/local → envia WhatsApp ao cliente
4. Após cita, técnico marca "Realizada"

**Checklist de Documentos Expandido:**
- Resolução Favorável original (ou visto no passaporte)
- Passaporte original válido
- Foto 3x4 colorida (fundo branco, recente)
- Certificado de Empadronamento (máx. 90 dias)
- Comprovante de pagamento Taxa 790/012
- Formulário EX17 impresso e assinado
- Comprovante da Cita (confirmação do agendamento)
- TIE anterior (se renovação)

**Instruções para o Dia:**
- Verificar dados pessoais nos formulários
- Pagar taxa antes da cita (instruções de pagamento via CaixaBank)
- Chegar com antecedência
- Levar caneta
- Tirar foto do resguardo após atendimento

### 2. **Novo Componente: src/components/cases/HuellasPreparationChecklist.tsx**

Checklist visual com todos os itens:

```text
┌─────────────────────────────────────────────────────────┐
│  📋 PREPARAÇÃO PARA TOMADA DE HUELLAS                  │
│                                                         │
│  PRÉ-REQUISITOS:                                       │
│  ☑ Empadronamento atualizado (máx. 90 dias)           │
│  ☐ Data confirmada com cliente (mín. 7 dias)          │
│  ☐ Agendamento solicitado                              │
│  ☐ Cita confirmada pelo agendador                     │
│                                                         │
│  DOCUMENTOS A GERAR:                                   │
│  [Gerar EX17]  [Gerar Taxa 790/012]                   │
│                                                         │
│  DOCUMENTOS PARA CLIENTE LEVAR:                        │
│  ☐ Resolução Favorável original                        │
│  ☐ Passaporte original válido                          │
│  ☐ Foto 3x4 colorida (fundo branco)                   │
│  ☐ Empadronamento (original, máx. 90 dias)            │
│  ☐ Taxa 790/012 paga + comprovante                    │
│  ☐ EX17 impresso e assinado                           │
│  ☐ Comprovante da Cita                                 │
│  ☐ TIE anterior (se renovação)                        │
│                                                         │
│  [Enviar Instruções ao Cliente via WhatsApp]          │
└─────────────────────────────────────────────────────────┘
```

### 3. **Modificar: src/components/cases/SendWhatsAppButton.tsx**

Adicionar novo template detalhado:

```typescript
{
  id: 'huellas_instructions',
  label: 'Instruções de Huellas',
  message: `📋 Instruções para sua Tomada de Huellas

📅 Data: {huellas_date}
⏰ Horário: {huellas_time}
📍 Local: {huellas_location}

📝 DOCUMENTOS QUE VOCÊ DEVE LEVAR:
1. Resolução Favorável original
2. Passaporte original válido
3. Foto 3x4 colorida (fundo branco, recente)
4. Certificado de Empadronamento (máx. 90 dias)
5. Comprovante de pagamento da Taxa 790/012
6. Formulário EX17 impresso e assinado
7. Comprovante do agendamento (esta confirmação)

💰 PAGAMENTO DA TAXA:
• Valor: €16,08
• Pague em agência CaixaBank ou terminal automático
• Guarde o comprovante carimbado

⚠️ IMPORTANTE:
• Chegue 15 minutos antes
• Leve caneta
• Após o atendimento, tire foto do resguardo e nos envie

A CB Asesoria não acompanha presencialmente, mas estamos à disposição para qualquer dúvida!

Boa sorte! 🍀`,
}
```

### 4. **Modificar: supabase/functions/sla-automations/index.ts**

Adicionar nova seção `HUELLAS`:

**Lógica de Alertas:**

```text
LÓGICA DE SLA PÓS-APROVAÇÃO (48H PARA CONTATO):
├── Casos em AGENDAR_HUELLAS sem huellas_requested_at
│   ├── 24h: Alerta interno ao técnico
│   ├── 48h: Escalação ao coordenador
│   └── 72h: Escalação ao ADM
│
LÓGICA DE EMPADRONAMENTO PENDENTE:
├── Casos com empadronamiento_valid = false e expected_date definida
│   ├── Semanal: Lembrete ao técnico
│   └── Quando data alcançada: Alerta para verificar
│
LÓGICA DE PREPARAÇÃO PRÉ-CITA:
├── Casos com huellas_date definida e não completed
│   ├── D-7: Enviar instruções completas ao cliente (WhatsApp)
│   ├── D-3: Lembrete com checklist
│   ├── D-1: Lembrete final
│   └── D+1 (se não marcado): Perguntar se foi realizado
│
LÓGICA DE NOTIFICAÇÃO AO AGENDADOR:
├── Quando status muda para AGUARDANDO_CITA_HUELLAS
│   └── Enviar notificação a usuários com função de AGENDADOR
```

### 5. **Modificar: src/hooks/useCases.ts**

Adicionar mutações:

```typescript
const requestHuellasSchedule = useMutation({
  mutationFn: async ({ 
    id, 
    preferredDate 
  }: { 
    id: string; 
    preferredDate?: string;
  }) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        technical_status: 'AGUARDANDO_CITA_HUELLAS',
        huellas_requested_at: new Date().toISOString(),
        huellas_scheduler_notified: false,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Notify schedulers/managers
    // ...
    
    return data;
  },
});

const confirmHuellasAppointment = useMutation({
  mutationFn: async ({ 
    id, 
    date, 
    time, 
    location,
    confirmationUrl 
  }: { 
    id: string; 
    date: string;
    time: string;
    location: string;
    confirmationUrl?: string;
  }) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        huellas_date: date,
        huellas_time: time,
        huellas_location: location,
        huellas_appointment_confirmation_url: confirmationUrl,
      })
      .eq('id', id)
      .select(`
        *,
        opportunities (leads (contacts (phone, full_name)))
      `)
      .single();
    
    if (error) throw error;
    
    // Send WhatsApp notification to client
    // ...
    
    return data;
  },
});

const updateEmpadronamiento = useMutation({
  mutationFn: async ({ 
    id, 
    valid, 
    expectedDate,
    notes 
  }: { 
    id: string; 
    valid: boolean;
    expectedDate?: string;
    notes?: string;
  }) => {
    const { data, error } = await supabase
      .from('service_cases')
      .update({
        empadronamiento_valid: valid,
        empadronamiento_expected_date: valid ? null : expectedDate,
        empadronamiento_notes: notes,
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
});
```

### 6. **Modificar: src/types/database.ts**

Adicionar descrição para statuses de huellas:

```typescript
export const TECHNICAL_STATUS_DESCRIPTIONS: Record<TechnicalStatus, string> = {
  ...
  AGENDAR_HUELLAS: 'Cliente notificado da aprovação, aguardando disponibilidade para huellas',
  AGUARDANDO_CITA_HUELLAS: 'Agendamento solicitado, aguardando confirmação de data/hora',
  HUELLAS_REALIZADO: 'Tomada de impressões digitais realizada com sucesso',
  ...
};
```

---

## Templates WhatsApp a Adicionar

### 1. Instruções Completas (D-7)

Já descrito acima em `huellas_instructions`.

### 2. Lembrete D-3

```text
Olá {nome}! 📅

Sua tomada de huellas é daqui a 3 dias:
📅 {huellas_date} às {huellas_time}
📍 {huellas_location}

Já organizou todos os documentos?
☐ Passaporte
☐ Foto 3x4
☐ Empadronamento
☐ Taxa paga (€16,08)
☐ EX17 assinado

Qualquer dúvida, estamos aqui! 💬
```

### 3. Lembrete D-1

```text
Olá {nome}! ⏰

AMANHÃ é sua tomada de huellas!
📅 {huellas_date} às {huellas_time}
📍 {huellas_location}

Chegue 15 minutos antes e não esqueça:
✅ Todos os documentos originais
✅ Taxa paga
✅ Caneta

Após o atendimento, envie-nos foto do resguardo!

Boa sorte! 🍀
```

---

## Configurações SLA (system_config)

Adicionar:
```text
sla_huellas_contact_hours = 48
sla_huellas_min_advance_days = 7
sla_huellas_d7_reminder = true
sla_huellas_d3_reminder = true
sla_huellas_d1_reminder = true
sla_empadronamiento_check_weekly = true
```

---

## Ordem de Implementação

1. **Migração do banco** (novos campos + tabela huellas_reminders)
2. **Atualizar types/database.ts**
3. **Hook useCases** (novas mutações)
4. **Componente HuellasPreparationChecklist** (novo)
5. **HuellasSection** (refatorar com pré-requisitos e novo fluxo)
6. **SendWhatsAppButton** (novos templates)
7. **sla-automations** (seção HUELLAS)
8. **Regenerar types.ts do Supabase**

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/new_migration.sql` | Novos campos + tabela |
| `src/integrations/supabase/types.ts` | Regenerar tipos |
| `src/types/database.ts` | Descrições de status |
| `src/components/cases/HuellasPreparationChecklist.tsx` | Novo componente |
| `src/components/cases/HuellasSection.tsx` | Refatorar com novo fluxo |
| `src/components/cases/SendWhatsAppButton.tsx` | Novos templates |
| `src/hooks/useCases.ts` | Novas mutações |
| `supabase/functions/sla-automations/index.ts` | Seção HUELLAS |

---

## Testes Recomendados

1. Verificar que não é possível solicitar agendamento sem empadronamento válido
2. Verificar validação de antecedência mínima de 7 dias
3. Solicitar agendamento e verificar notificação ao agendador
4. Confirmar cita e verificar WhatsApp ao cliente
5. Simular D-7, D-3, D-1 e verificar lembretes automáticos
6. Marcar huellas como realizado e verificar transição de status
7. Testar upload do resguardo pelo cliente
8. Verificar geração correta de EX17 e Taxa 790/012
