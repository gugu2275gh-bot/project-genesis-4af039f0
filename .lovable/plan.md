
# Plano: Pos-Atendimento da Cita de Huellas e Emissao do TIE

## Visao Geral

Implementar o fluxo completo de pos-atendimento apos a cita de huellas, incluindo:
- Upload do comprovante (resguardo) pelo cliente no portal
- Registro do numero de lote pelo tecnico
- Acompanhamento da producao do TIE
- Suporte para retirada com ou sem cita previa
- Transicao de status ate o encerramento do caso

---

## Fluxo Proposto

```text
HUELLAS_REALIZADO
       │
       ▼ (Cliente envia resguardo no portal)
  Upload Resguardo → Tecnico visualiza e extrai numero de lote
       │
       ▼ (Tecnico registra lote e data prevista)
DISPONIVEL_RETIRADA_TIE
       │
       ├─────────────────────┬──────────────────────┐
       │                     │                      │
  SEM CITA            COM CITA (opcional)     ACOMPANHAMENTO
  (Retirada direta)   (Agendar retirada)      (Lote/producao)
       │                     │                      │
       │                     ▼                      │
       │          AGUARDANDO_CITA_RETIRADA          │
       │                     │                      │
       └─────────────────────┴──────────────────────┘
                             │
                             ▼ (Cliente retira TIE)
                       TIE_RETIRADO
                             │
                             ▼
                    ENCERRADO_APROVADO
```

---

## Alteracoes no Banco de Dados

### Novos campos em `service_cases`

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `huellas_resguardo_url` | text | URL do comprovante de comparecimento enviado pelo cliente (ja existe) |
| `tie_resguardo_url` | text | URL do comprovante de retirada do TIE (ja existe) |
| `tie_lot_number` | text | Numero do lote do cartao TIE (ja existe) |
| `tie_validity_date` | date | Data de validade do TIE (ja existe) |
| `tie_pickup_date` | date | Data em que o TIE foi retirado (ja existe) |
| `tie_picked_up` | boolean | Se o TIE foi retirado (ja existe) |
| `tie_pickup_requires_appointment` | boolean | Se requer cita para retirada (NOVO) |
| `tie_pickup_appointment_date` | date | Data da cita para retirada (NOVO) |
| `tie_pickup_appointment_time` | time | Horario da cita (NOVO) |
| `tie_pickup_location` | text | Local de retirada (NOVO) |
| `tie_ready_notification_sent` | boolean | Se o cliente foi notificado que TIE esta pronto (NOVO) |
| `tie_estimated_ready_date` | date | Data estimada de disponibilidade do TIE (NOVO) |

### Migracao SQL

```sql
ALTER TABLE service_cases 
ADD COLUMN IF NOT EXISTS tie_pickup_requires_appointment boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tie_pickup_appointment_date date,
ADD COLUMN IF NOT EXISTS tie_pickup_appointment_time time,
ADD COLUMN IF NOT EXISTS tie_pickup_location text,
ADD COLUMN IF NOT EXISTS tie_ready_notification_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tie_estimated_ready_date date;
```

---

## Componentes Frontend

### 1. Novo Componente: `ResguardoUploadSection.tsx`

Componente para o tecnico visualizar o resguardo enviado pelo cliente e extrair informacoes:

**Funcionalidades:**
- Exibir link para visualizar resguardo enviado pelo cliente
- Campo para registrar numero de lote
- Campo para data estimada de disponibilidade
- Botao para notificar cliente quando TIE estiver pronto

**Localizacao:** `src/components/cases/ResguardoUploadSection.tsx`

### 2. Atualizar: `TiePickupSection.tsx`

Expandir para suportar os dois cenarios de retirada:

**Adicionar:**
- Toggle: "Requer agendamento para retirada?"
- Se SIM: Campos para data/hora/local da cita de retirada
- Se NAO: Mensagem indicando retirada direta no prazo
- Botao para enviar instrucoes de retirada ao cliente
- Card de acompanhamento do lote (status da producao)
- Botao para marcar TIE como retirado

### 3. Atualizar: `PortalDocuments.tsx`

Adicionar secao especial para upload do resguardo de huellas:

**Nova secao:**
- Card destacado apos status HUELLAS_REALIZADO
- Upload especifico para "Comprovante de Huellas (Resguardo)"
- Instrucoes sobre o que contem o documento
- Confirmacao visual apos envio

### 4. Atualizar: `PortalDashboard.tsx`

Adicionar cards de acompanhamento para:
- Status do TIE (quando disponivel)
- Instrucoes de retirada
- Data/hora da cita de retirada (se aplicavel)

---

## Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/cases/ResguardoUploadSection.tsx` | Criar | Nova secao para gerenciar resguardo |
| `src/components/cases/TiePickupSection.tsx` | Modificar | Adicionar fluxo com/sem cita |
| `src/pages/portal/PortalDocuments.tsx` | Modificar | Adicionar upload de resguardo |
| `src/pages/portal/PortalDashboard.tsx` | Modificar | Adicionar cards de status TIE |
| `src/hooks/useCases.ts` | Modificar | Adicionar mutations para TIE |
| `src/pages/cases/CaseDetail.tsx` | Modificar | Integrar nova secao de resguardo |
| `supabase/migrations/XXXXX_add_tie_pickup_fields.sql` | Criar | Adicionar novos campos |

---

## Hook `useCases.ts` - Novas Mutations

```typescript
// Registrar resguardo de huellas
const uploadHuellasResguardo = useMutation({
  mutationFn: async ({ id, resguardoUrl }: { id: string; resguardoUrl: string }) => {
    // Atualiza url do resguardo e transiciona status
  }
});

// Registrar TIE disponivel para retirada
const registerTieAvailable = useMutation({
  mutationFn: async ({ 
    id, 
    lotNumber, 
    validityDate,
    estimatedReadyDate,
    requiresAppointment 
  }: {...}) => {
    // Atualiza campos do TIE e transiciona para DISPONIVEL_RETIRADA_TIE
  }
});

// Agendar cita de retirada
const scheduleTiePickupAppointment = useMutation({
  mutationFn: async ({ 
    id, 
    date, 
    time, 
    location 
  }: {...}) => {
    // Registra cita e transiciona para AGUARDANDO_CITA_RETIRADA
  }
});

// Confirmar retirada do TIE
const confirmTiePickup = useMutation({
  mutationFn: async ({ id, pickupDate }: { id: string; pickupDate: string }) => {
    // Marca como retirado e transiciona para TIE_RETIRADO
  }
});

// Finalizar caso apos retirada
const finalizeCaseAfterTie = useMutation({
  mutationFn: async (id: string) => {
    // Transiciona para ENCERRADO_APROVADO
  }
});
```

---

## Portal do Cliente - Fluxo de Upload do Resguardo

### Nova secao em PortalDocuments

Quando `technical_status === 'HUELLAS_REALIZADO'`:

```text
┌─────────────────────────────────────────────────────────────┐
│  📄 Comprovante de Comparecimento (Resguardo)              │
│                                                             │
│  Apos comparecer a cita de huellas, voce recebeu um         │
│  comprovante da Policia. Envie-o para darmos continuidade.  │
│                                                             │
│  Este documento contem:                                      │
│  • Numero do lote do seu cartao TIE                         │
│  • Prazo estimado para retirada                             │
│                                                             │
│  [Selecionar arquivo]  [Enviar Resguardo]                   │
└─────────────────────────────────────────────────────────────┘
```

**Apos envio:**
- Salvar em `huellas_resguardo_url`
- Notificar tecnico responsavel
- Exibir mensagem de confirmacao

---

## Fluxo de Retirada - Duas Modalidades

### Modalidade 1: Sem Cita (Retirada Direta)

Alguns locais permitem retirada direta sem agendamento:

1. Tecnico marca `tie_pickup_requires_appointment = false`
2. Registra `tie_estimated_ready_date` com base no resguardo
3. Sistema envia WhatsApp ao cliente quando data chegar
4. Cliente comparece e retira
5. Tecnico marca `tie_picked_up = true`

### Modalidade 2: Com Cita (Requer Agendamento)

Locais que exigem agendamento previo:

1. Tecnico marca `tie_pickup_requires_appointment = true`
2. Solicita agendamento (similar ao fluxo de huellas)
3. Registra `tie_pickup_appointment_date/time/location`
4. Status transiciona para `AGUARDANDO_CITA_RETIRADA`
5. Sistema envia lembretes ao cliente (D-3, D-1)
6. Apos cita, tecnico marca como retirado

---

## Notificacoes e Mensagens WhatsApp

### Templates de Mensagem

**1. Resguardo Recebido:**
```
Ola {nome}! Recebemos seu comprovante de huellas. 
Estamos acompanhando a producao do seu TIE. 
Avisaremos assim que estiver disponivel para retirada.
```

**2. TIE Disponivel (Sem Cita):**
```
Otimas noticias, {nome}! Seu TIE ja esta disponivel para retirada.

Local: {local}
Documentos necessarios:
- Passaporte original
- Resguardo de huellas
- Comprovante Taxa 790

Voce pode retirar a qualquer momento no horario de atendimento.
```

**3. TIE Disponivel (Com Cita):**
```
Otimas noticias, {nome}! Seu TIE ja esta disponivel.

Para retirar, e necessario agendar uma cita previa.
Estamos providenciando o agendamento e informaremos a data/hora.
```

**4. Cita de Retirada Agendada:**
```
{nome}, sua cita para retirada do TIE foi agendada!

Data: {data}
Horario: {hora}
Local: {local}

Leve: Passaporte, Resguardo, Comprovante Taxa 790.
```

---

## Interface do Tecnico - Secao Expandida

### Card de Resguardo e Lote

Visivel apos `HUELLAS_REALIZADO`:

```text
┌─────────────────────────────────────────────────────────────┐
│  📋 Resguardo e Lote do TIE                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Resguardo do Cliente:                                       │
│  [📄 Ver Documento]  ✓ Enviado em 02/02/2026                │
│                                                              │
│  Numero do Lote: [_______________]                          │
│  Data Estimada de Disponibilidade: [__/__/____]             │
│                                                              │
│  Requer agendamento para retirada?                          │
│  ( ) Nao - Cliente pode retirar diretamente                 │
│  ( ) Sim - Sera necessario agendar cita                     │
│                                                              │
│  [Registrar TIE Disponivel]                                 │
└─────────────────────────────────────────────────────────────┘
```

### Card de Retirada (Com Cita)

Quando `tie_pickup_requires_appointment = true`:

```text
┌─────────────────────────────────────────────────────────────┐
│  🎫 Agendar Retirada do TIE                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Data da Cita: [__/__/____]                                 │
│  Horario: [__:__]                                           │
│  Local: [_______________________]                           │
│                                                              │
│  [Confirmar Agendamento]                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Secao Tecnica

### Tipos TypeScript

```typescript
// Novos campos no ServiceCase
interface ServiceCaseTieFields {
  huellas_resguardo_url?: string | null;
  tie_resguardo_url?: string | null;
  tie_lot_number?: string | null;
  tie_validity_date?: string | null;
  tie_pickup_date?: string | null;
  tie_picked_up?: boolean | null;
  tie_pickup_requires_appointment?: boolean | null;
  tie_pickup_appointment_date?: string | null;
  tie_pickup_appointment_time?: string | null;
  tie_pickup_location?: string | null;
  tie_ready_notification_sent?: boolean | null;
  tie_estimated_ready_date?: string | null;
}
```

### Transicoes de Status

| De | Para | Gatilho |
|----|------|---------|
| HUELLAS_REALIZADO | DISPONIVEL_RETIRADA_TIE | Tecnico registra lote |
| DISPONIVEL_RETIRADA_TIE | AGUARDANDO_CITA_RETIRADA | Cita agendada (se requer) |
| DISPONIVEL_RETIRADA_TIE | TIE_RETIRADO | Retirada confirmada (sem cita) |
| AGUARDANDO_CITA_RETIRADA | TIE_RETIRADO | Retirada confirmada |
| TIE_RETIRADO | ENCERRADO_APROVADO | Finalizacao do caso |

### Storage para Resguardo

Utilizar bucket `client-documents` existente:
- Path: `{userId}/{caseId}/resguardo/{timestamp}.pdf`
- RLS ja configurada para permitir upload pelo cliente

---

## Resumo de Implementacao

1. **Migracao SQL** - Adicionar novos campos para cita de retirada
2. **Hook useCases** - Adicionar 5 novas mutations
3. **ResguardoUploadSection** - Novo componente para tecnico
4. **TiePickupSection** - Expandir com fluxo com/sem cita
5. **PortalDocuments** - Adicionar upload de resguardo
6. **PortalDashboard** - Cards de status TIE
7. **CaseDetail** - Integrar nova secao

**Estimativa:** 1-2 iteracoes de desenvolvimento
