
# Plano: Implementação do Fluxo de Protocolo do Pedido (Etapa 6)

## Resumo da Análise

Após análise detalhada do código atual, identifiquei o que **já existe** e o que **precisa ser implementado**:

### O que já existe
| Funcionalidade | Status | Localização |
|----------------|--------|-------------|
| Campo `protocol_number` na tabela `service_cases` | ✅ | Supabase types |
| Campo `submission_date` | ✅ | Supabase types |
| Status `PROTOCOLADO` no enum | ✅ | types/database.ts |
| Automação de notificação pré-protocolo (D-3) | ✅ | sla-automations |
| Botão "Marcar Protocolado" no CaseDetail | ✅ | CaseDetail.tsx |
| Template de WhatsApp "Informação de Protocolo" | ✅ | SendWhatsAppButton.tsx |
| Dashboard Jurídico com lista de casos | ✅ | LegalDashboard.tsx |

### O que precisa ser implementado

| Funcionalidade | Descrição |
|----------------|-----------|
| **Comprovante de Protocolo (Documento Privado)** | Upload de documento pelo Jurídico com flag `is_visible_to_client = false` até aprovação do Técnico |
| **Número de Expediente** | Novo campo para armazenar o ID do processo na Extranjería (diferente do `protocol_number`) |
| **Fluxo de aprovação do comprovante** | Técnico deve aprovar antes de liberar para o cliente |
| **Notificação automática ao cliente** | Quando status muda para PROTOCOLADO |
| **Orientações de consulta do expediente** | Template WhatsApp + notificação com instruções de acompanhamento |
| **Exibição no Portal do Cliente** | Mostrar número de expediente como ID do processo |

---

## Alterações no Banco de Dados

### 1. Adicionar campos à tabela `service_cases`

```sql
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS expediente_number TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_url TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved BOOLEAN DEFAULT false;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved_by UUID REFERENCES profiles(id);
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS protocol_receipt_approved_at TIMESTAMPTZ;
```

**Explicação dos campos:**
- `expediente_number`: Número de expediente da Extranjería (ex: "E/2024/12345")
- `protocol_receipt_url`: URL do comprovante de protocolo (arquivo privado)
- `protocol_receipt_approved`: Flag indicando se o técnico aprovou
- `protocol_receipt_approved_by`: Quem aprovou o comprovante
- `protocol_receipt_approved_at`: Quando foi aprovado

---

## Arquivos a Criar/Modificar

### 1. **Novo Componente: ProtocolReceiptUpload.tsx**
Componente para o Jurídico fazer upload do comprovante de protocolo.

```text
src/components/cases/ProtocolReceiptUpload.tsx
```

**Funcionalidades:**
- Input de arquivo para upload do comprovante (PDF)
- Upload para bucket `signed-contracts` (já existe e é privado)
- Salvar URL no campo `protocol_receipt_url`
- Criar notificação para o técnico responsável

### 2. **Novo Componente: ExpedienteNumberInput.tsx**
Campo para inserir o número de expediente quando recebido.

```text
src/components/cases/ExpedienteNumberInput.tsx
```

**Funcionalidades:**
- Input para digitar o número de expediente
- Validação de formato (opcional, ex: E/YYYY/XXXXX)
- Botão de salvar com confirmação
- Ao salvar: enviar WhatsApp automático com instruções de consulta

### 3. **Modificar: src/pages/cases/CaseDetail.tsx**

Adicionar:
- Seção de "Protocolo" com:
  - Upload do comprovante (visível para JURIDICO)
  - Botão de aprovar comprovante (visível para TECNICO)
  - Campo de número de expediente (após protocolo)
  - Exibição do comprovante aprovado (link para download)

### 4. **Modificar: src/pages/legal/LegalDashboard.tsx**

Adicionar:
- Coluna "Comprovante" mostrando status (Pendente/Enviado/Aprovado)
- Ação rápida para upload de comprovante
- Ação rápida para inserir expediente

### 5. **Modificar: src/hooks/useCases.ts**

Adicionar mutações:
- `uploadProtocolReceipt`: Upload do comprovante
- `approveProtocolReceipt`: Aprovação pelo técnico
- `setExpedienteNumber`: Inserir número de expediente
- `markAsProtocolado`: Transição de status com notificações automáticas

### 6. **Modificar: src/pages/portal/PortalDashboard.tsx**

Alterar:
- Mostrar `expediente_number` como "ID do Processo" em vez de `protocol_number`
- Adicionar link para consulta no site da Extranjería
- Exibir comprovante de protocolo (se aprovado)

### 7. **Modificar: src/components/cases/SendWhatsAppButton.tsx**

Adicionar template:
```typescript
{
  id: 'expediente_instructions',
  label: 'Instruções do Expediente',
  message: `Olá {nome}! 📋

Seu processo de {servico} foi protocolado com sucesso!

📋 Número do Expediente: {expediente_number}

Para acompanhar o andamento, acesse:
🔗 https://sede.administracionespublicas.gob.es

Passo a passo:
1. Acesse o link acima
2. Clique em "Consulta del estado de expedientes"
3. Insira seu número de expediente: {expediente_number}
4. Preencha seus dados pessoais

Continuaremos acompanhando e avisaremos sobre qualquer atualização!`,
}
```

### 8. **Modificar: supabase/functions/sla-automations/index.ts**

Adicionar na seção PROTOCOL:
- Notificação ao técnico quando jurídico faz upload do comprovante
- Alerta ao coordenador se comprovante não for aprovado em 24h
- Envio automático de WhatsApp com instruções quando expediente é cadastrado

---

## Fluxo Visual

```text
JURÍDICO                       TÉCNICO                        CLIENTE
   │                              │                              │
   │  1. Protocola pedido         │                              │
   │  ─────────────────►          │                              │
   │                              │                              │
   │  2. Upload comprovante       │                              │
   │  (documento privado)         │                              │
   │  ─────────────────►          │                              │
   │                              │                              │
   │                    3. Notificação recebida                  │
   │                              │                              │
   │                    4. Revisa e aprova                       │
   │                              │                              │
   │                    5. Libera para cliente                   │
   │                    ──────────────────────────────►          │
   │                              │                              │
   │                              │         6. Visualiza no portal
   │                              │                              │
   │  7. Recebe expediente        │                              │
   │  por e-mail                  │                              │
   │  ─────────────────►          │                              │
   │                              │                              │
   │                    8. Cadastra expediente                   │
   │                              │                              │
   │                    9. Sistema envia WhatsApp                │
   │                    com instruções ────────────────────────► │
   │                              │                              │
   │                              │        10. Acompanha no site
   │                              │            da Extranjería
```

---

## Notificações Automáticas

| Evento | Destinatário | Tipo | Mensagem |
|--------|--------------|------|----------|
| Upload comprovante | Técnico responsável | in-app | "Comprovante de protocolo inserido para caso X" |
| Comprovante não aprovado em 24h | Coordenador | in-app | "Comprovante pendente de aprovação há 24h" |
| Comprovante aprovado | Cliente (via portal) | in-app | "Seu protocolo foi confirmado!" |
| Expediente cadastrado | Cliente (WhatsApp) | WhatsApp | Template com instruções de consulta |

---

## Templates de Mensagem (WhatsApp)

### Novo Template: Instruções de Acompanhamento do Expediente

Será adicionado ao `SendWhatsAppButton.tsx` e poderá ser disparado automaticamente quando o técnico cadastrar o número de expediente.

---

## Configurações SLA (system_config)

Novos parâmetros sugeridos:
```text
sla_protocol_receipt_approval_hours = 24
sla_expediente_reminder_days = 7
```

---

## Impacto nas Permissões (RLS)

O comprovante de protocolo será armazenado no bucket `signed-contracts` (já privado). A visibilidade será controlada pelo campo `protocol_receipt_approved` na tabela `service_cases`:
- `false`: Apenas staff pode visualizar
- `true`: Cliente também pode visualizar

---

## Ordem de Implementação

1. **Migração do banco** (adicionar campos)
2. **Hook useCases** (adicionar mutações)
3. **Componentes novos** (ProtocolReceiptUpload, ExpedienteNumberInput)
4. **CaseDetail.tsx** (integrar componentes)
5. **LegalDashboard.tsx** (ações rápidas)
6. **SendWhatsAppButton.tsx** (novo template)
7. **PortalDashboard.tsx** (exibir expediente)
8. **sla-automations** (notificações automáticas)

---

## Testes Recomendados

Após implementação, testar:
1. Upload de comprovante pelo Jurídico
2. Notificação chega ao Técnico
3. Aprovação do comprovante
4. Liberação para o cliente no portal
5. Cadastro do número de expediente
6. Envio automático de WhatsApp com instruções
7. Visualização correta no portal do cliente
