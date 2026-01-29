
# Plano: Requerimentos e Recursos - Prazos e Procedimentos (Etapa 8)

## Resumo da Análise

Após análise detalhada do código existente, identifiquei a infraestrutura parcialmente implementada:

### O que já existe
| Funcionalidade | Status | Localização |
|----------------|--------|-------------|
| Tabela `requirements_from_authority` | ✅ | Supabase (id, service_case_id, description, official_deadline_date, internal_deadline_date, status) |
| Enum `requirement_status` (ABERTA, RESPONDIDA, ENCERRADA) | ✅ | types/database.ts |
| Hook `useRequirements` | ✅ | src/hooks/useRequirements.ts |
| UI de Nova Exigência no CaseDetail | ✅ | CaseDetail.tsx (dialog com prazo oficial e interno) |
| Tabela `document_reminders` (para rastrear alertas) | ✅ | Supabase |
| Seção REQUIREMENTS no sla-automations | ⚠️ Parcial | Alerta 2 dias (interno), 5 dias (oficial) |
| Status `EXIGENCIA_ORGAO` no enum | ✅ | technical_status |
| Status `DENEGADO` e `EM_RECURSO` | ✅ | technical_status |
| Campos `resource_deadline`, `resource_notes` | ✅ | service_cases |
| Dialog para iniciar Recurso | ✅ | CaseDetail.tsx |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Campos adicionais para Exigências** | `responded_at`, `extension_count`, `original_deadline_date`, `extension_requested_at`, `notified_coordinator` |
| **Status `EM_PRORROGACAO`** | Novo status para exigência com prorrogação solicitada |
| **Alertas escalonados (10 dias)** | Imediato, D-3, D-2 (ADM), confirmação ao coord |
| **Lógica de prorrogação (+5 dias)** | Novo prazo com alertas proporcionais |
| **UI para solicitar prorrogação** | Botão no CaseDetail que atualiza deadline e notifica |
| **Notificação de exigência recebida** | Alerta imediato para Técnico, Coord e ADM |
| **Alertas de recurso escalonados** | Similar a exigências, para prazos de recurso (ex: 1 mês) |
| **Botão "Enviar ao Jurídico"** | Para enviar resposta de exigência |
| **Histórico do processo denegado** | Link para novo processo mantendo histórico |

---

## Alterações no Banco de Dados

### 1. Adicionar campos à tabela `requirements_from_authority`

```sql
ALTER TABLE requirements_from_authority 
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS response_sent_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_deadline_date DATE,
ADD COLUMN IF NOT EXISTS extension_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extension_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS coordinator_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS response_file_url TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;
```

### 2. Adicionar novo valor ao enum `requirement_status`

```sql
ALTER TYPE requirement_status ADD VALUE IF NOT EXISTS 'EM_PRORROGACAO';
ALTER TYPE requirement_status ADD VALUE IF NOT EXISTS 'PRORROGADA';
```

### 3. Criar tabela `requirement_reminders` (se não existir)

```sql
CREATE TABLE IF NOT EXISTS requirement_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES requirements_from_authority(id),
  reminder_type TEXT NOT NULL, -- 'IMMEDIATE', 'D3', 'D2_ADM', 'RESPONSE_CONFIRMED', 'EXTENSION_REQUESTED'
  recipient_type TEXT NOT NULL, -- 'TECH', 'COORD', 'ADM', 'JURIDICO'
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_requirement_reminders ON requirement_reminders(requirement_id, reminder_type);
```

---

## Arquivos a Criar/Modificar

### 1. **Novo Componente: RequirementActionsPanel.tsx**

```text
src/components/cases/RequirementActionsPanel.tsx
```

Funcionalidades:
- Exibe exigência com contagem regressiva de dias
- Badge de urgência visual (vermelho se <= 3 dias)
- Botão "Responder Exigência" (upload de arquivo + marcar respondida)
- Botão "Solicitar Prorrogação" (adiciona +5 dias, notifica coord)
- Histórico de prorrogações (mostra `extension_count`)
- Indicador de que coord foi notificado

### 2. **Modificar: src/hooks/useRequirements.ts**

Adicionar mutações:
- `requestExtension`: Solicita +5 dias, incrementa `extension_count`, notifica
- `respondRequirement`: Marca respondida, upload arquivo, notifica coord
- `sendToLegal`: Encaminha resposta ao jurídico

### 3. **Modificar: src/pages/cases/CaseDetail.tsx**

Na tab "Exigências":
- Substituir listagem simples pelo `RequirementActionsPanel`
- Adicionar visualização de prazo com urgência
- Exibir histórico de prorrogações
- Botões de ação contextuais

### 4. **Modificar: supabase/functions/sla-automations/index.ts**

Reescrever seção REQUIREMENTS com:

```text
LÓGICA DE ALERTAS PARA PRAZO DE 10 DIAS:
├── Imediatamente ao registrar exigência:
│   ├── Notificar Técnico (in-app + WhatsApp opcional)
│   ├── Notificar Coordenador (in-app)
│   └── Registrar em requirement_reminders (type='IMMEDIATE')
│
├── 3 dias antes do prazo (D-3):
│   ├── Notificar Técnico (in-app)
│   ├── Notificar Jurídico (in-app)
│   ├── Notificar Coordenador (in-app)
│   └── Registrar em requirement_reminders (type='D3')
│
├── 2 dias antes do prazo (D-2):
│   ├── Notificar ADM (urgência máxima)
│   └── Registrar em requirement_reminders (type='D2_ADM')
│
└── Ao responder ou solicitar prorrogação:
    └── Notificar Coordenador (confirmação de ação tomada)

LÓGICA DE PRORROGAÇÃO (+5 DIAS):
├── Se prorrogação solicitada:
│   ├── Atualizar official_deadline_date += 5 dias
│   ├── Incrementar extension_count
│   ├── Salvar original_deadline_date (se primeira prorrogação)
│   └── Notificar imediatamente Técnico/Jurídico/Coord com novo prazo
│
├── Para prazo de 5 dias, alertas proporcionais:
│   ├── D-3: Alerta Técnico/Jurídico (pois são quase contínuos)
│   └── D-2: Alerta ADM
│
└── Limite recomendado: 3 prorrogações
    └── Após 3ª, enviar alerta especial ao Coord/ADM
```

### 5. **Modificar: src/pages/legal/LegalDashboard.tsx**

Adicionar tab ou seção "Exigências Urgentes":
- Lista de exigências com prazo < 5 dias
- Indicador de quantas prorrogações já foram solicitadas
- Filtro por status (ABERTA, EM_PRORROGACAO, RESPONDIDA)

### 6. **Modificar: src/types/database.ts**

Atualizar:
```typescript
export type RequirementStatus = 
  | 'ABERTA'
  | 'EM_PRORROGACAO'
  | 'PRORROGADA'
  | 'RESPONDIDA'
  | 'ENCERRADA';

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  ABERTA: 'Aberta',
  EM_PRORROGACAO: 'Prorrogação Solicitada',
  PRORROGADA: 'Prazo Estendido',
  RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada',
};
```

---

## Fluxo Visual - Exigência (Requerimiento)

```text
       ÓRGÃO EMITE EXIGÊNCIA (10 DIAS)
                    │
                    ▼
    ┌───────────────────────────────────┐
    │ Jurídico registra no sistema      │
    │ Status: ABERTA                    │
    │ ► Notifica Técnico + Coord + ADM  │
    └───────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
    D-3 (7 dias)          Cliente consegue
    ├─ Alerta Técnico     reunir documentos?
    ├─ Alerta Jurídico          │
    └─ Alerta Coord       ┌─────┴─────┐
         │                ▼           ▼
         │              SIM          NÃO
    D-2 (8 dias)          │           │
    ├─ Alerta ADM         │           ▼
    └─ Urgência máxima    │    ┌─────────────────┐
         │                │    │ Solicitar       │
         ▼                │    │ Prorrogação     │
    D-0 (Prazo vence)     │    │ (+5 dias)       │
         │                │    └─────────────────┘
         │                │           │
         ▼                ▼           ▼
    ┌────────────────────────────────────────┐
    │ Técnico envia docs ao Jurídico         │
    │ Jurídico protocola resposta            │
    │ Status: RESPONDIDA                     │
    │ ► Notifica Coord (ação tomada)         │
    └────────────────────────────────────────┘
```

---

## Fluxo Visual - Recurso (Apelação)

```text
        PROCESSO DENEGADO
              │
              ▼
   ┌──────────────────────────┐
   │ Jurídico altera status   │
   │ para DENEGADO            │
   │ ► Notifica todos         │
   └──────────────────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
  RECORRER        NÃO RECORRER
     │                 │
     ▼                 ▼
┌─────────────┐   ┌──────────────────┐
│ Status:     │   │ Arquivar processo│
│ EM_RECURSO  │   │ Iniciar novo     │
│ Prazo: 1 mês│   │ (mantém histórico)│
└─────────────┘   └──────────────────┘
     │
     ▼ (Alertas proporcionais)
┌────────────────────────────┐
│ D-7: Alerta Jurídico       │
│ D-5: Alerta Coord          │
│ D-3: Alerta ADM            │
└────────────────────────────┘
     │
     ▼
Jurídico protocola recurso
```

---

## Escalas de Alertas

### Exigência (10 dias oficiais)
| Momento | Destinatários | Mensagem |
|---------|---------------|----------|
| Imediato | Técnico, Coord | "Nova exigência recebida - prazo 10 dias" |
| D-3 | Técnico, Jurídico, Coord | "Prazo de exigência vence em 3 dias" |
| D-2 | ADM | "🚨 Urgência máxima - exigência vence em 2 dias" |
| Após resposta | Coord | "Exigência respondida/protocolada" |

### Prorrogação (5 dias)
| Momento | Destinatários | Mensagem |
|---------|---------------|----------|
| Imediato | Técnico, Jurídico, Coord | "Novo prazo: X dias (prorrogação N)" |
| D-3 | Técnico, Jurídico | "Prazo estendido vence em 3 dias" |
| D-2 | ADM | "🚨 Prazo de prorrogação vence em 2 dias" |

### Recurso (1 mês típico)
| Momento | Destinatários | Mensagem |
|---------|---------------|----------|
| Imediato | Jurídico | "Recurso iniciado - prazo até X" |
| D-7 | Jurídico | "Prazo de recurso vence em 7 dias" |
| D-5 | Coord | "Prazo de recurso vence em 5 dias" |
| D-3 | ADM | "🚨 Prazo de recurso vence em 3 dias" |

---

## Regra de Dias Úteis

A documentação menciona: "Caso o último dia caia em final de semana ou feriado, antecipar para dia útil anterior."

Implementar função helper:

```typescript
function adjustToBusinessDay(date: Date): Date {
  const day = date.getDay();
  if (day === 0) return addDays(date, -2); // Domingo → Sexta
  if (day === 6) return addDays(date, -1); // Sábado → Sexta
  return date;
}
```

Esta lógica será aplicada ao calcular alertas e ao definir prazos internos.

---

## Configurações SLA (system_config)

Adicionar:
```text
sla_requirement_immediate_alert = true
sla_requirement_d3_alert_days = 3
sla_requirement_d2_alert_days = 2
sla_requirement_extension_days = 5
sla_requirement_max_extensions = 3
sla_resource_d7_alert_days = 7
sla_resource_d5_alert_days = 5
sla_resource_d3_alert_days = 3
```

---

## Histórico de Processos

Para a funcionalidade de "iniciar novo processo mantendo histórico":

Adicionar campo à tabela `service_cases`:
```sql
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS previous_case_id UUID REFERENCES service_cases(id),
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closure_reason TEXT;
```

Na UI:
- Exibir "Processo anterior: #ID - Denegado em DD/MM/AAAA"
- Botão "Iniciar Novo Processo" que cria novo case com `previous_case_id`

---

## Ordem de Implementação

1. **Migração do banco** (campos em requirements_from_authority, tabela requirement_reminders, campos em service_cases)
2. **Atualizar enum requirement_status**
3. **Hook useRequirements** (novas mutações)
4. **Componente RequirementActionsPanel**
5. **CaseDetail.tsx** (integrar painel)
6. **LegalDashboard.tsx** (seção exigências urgentes)
7. **sla-automations** (reescrever seção REQUIREMENTS + adicionar RECURSOS)
8. **types/database.ts** (atualizar tipos e labels)
9. **Regenerar types.ts do Supabase**

---

## Testes Recomendados

1. Criar exigência e verificar notificações imediatas
2. Simular D-3 e verificar alertas
3. Simular D-2 e verificar alerta ADM
4. Solicitar prorrogação e verificar novo prazo
5. Responder exigência e verificar notificação ao coord
6. Testar limite de 3 prorrogações
7. Iniciar recurso após denegação
8. Verificar alertas de recurso
9. Iniciar novo processo mantendo histórico do denegado
