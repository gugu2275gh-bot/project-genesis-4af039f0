

## Submeter Templates de WhatsApp Automaticamente via Twilio Content API

### O que será feito

Criar uma Edge Function que submete automaticamente os templates de mensagem do WhatsApp para aprovação da Meta, usando a **Twilio Content API** via gateway. Também criar a tabela para armazenar os templates e uma UI de gerenciamento.

### Como funciona a Twilio Content API

- Endpoint: `POST /Content` (via gateway)
- O template é criado e automaticamente submetido para aprovação da Meta/WhatsApp
- Aprovação leva 24-48h
- Status pode ser consultado via `GET /Content/{sid}`

### Templates necessários (baseados nas automações SLA)

| Tipo | Descrição | Variáveis |
|------|-----------|-----------|
| `welcome` | Boas-vindas a novo lead | `{nome}` |
| `reengagement` | Reengajamento de lead inativo | `{nome}` |
| `contract_reminder` | Lembrete de assinatura de contrato | `{nome}` |
| `payment_pre_7d` | Lembrete pré-vencimento 7 dias | `{nome}`, `{valor}`, `{data}` |
| `payment_pre_48h` | Lembrete pré-vencimento 48h | `{nome}`, `{valor}`, `{data}` |
| `payment_post_d1` | Cobrança D+1 | `{nome}`, `{valor}` |
| `payment_post_d3` | Cobrança D+3 | `{nome}`, `{valor}` |
| `document_reminder` | Lembrete de documento pendente | `{nome}`, `{documento}` |
| `onboarding_reminder` | Lembrete de onboarding | `{nome}` |
| `tie_pickup` | Lembrete de retirada TIE | `{nome}`, `{data}` |
| `huellas_reminder` | Lembrete de huellas | `{nome}`, `{data}` |

### Alterações

#### 1. Migração — Tabela `whatsapp_templates`

Criar tabela para armazenar os templates submetidos com campos: `automation_type`, `content_sid`, `status` (pending/approved/rejected), `template_name`, `body_text`, `variables`, timestamps. RLS com acesso admin.

#### 2. Nova Edge Function — `submit-whatsapp-templates`

- Recebe o tipo de automação ou "ALL" para submeter todos
- Para cada template, chama `POST /Content` no gateway Twilio com:
  - `friendly_name`, `language`, `types.twilio/text.body`
- Salva o `content_sid` retornado na tabela `whatsapp_templates`
- Pode também consultar status via `GET /Content/{sid}` para verificar aprovação

#### 3. Atualizar `sla-automations`

- No início, carregar templates aprovados da tabela `whatsapp_templates`
- Substituir chamadas `sendWhatsApp(phone, message)` por `sendWhatsAppTemplate(phone, contentSid, variables)` quando o template estiver aprovado
- Manter fallback com freeform para conversas dentro da janela de 24h

#### 4. UI — Tab "WhatsApp Templates" em Settings

- Lista todos os templates com status (pendente/aprovado/rejeitado)
- Botão "Submeter para Aprovação" que chama a Edge Function
- Botão "Verificar Status" para atualizar o status de aprovação
- Edição do texto do template antes de submeter

#### 5. Atualizar `send-whatsapp`

- Se freeform falhar com erro 63016, tentar reenviar usando template genérico aprovado

### Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/xxx_whatsapp_templates.sql` | Criar tabela |
| `supabase/functions/submit-whatsapp-templates/index.ts` | Nova Edge Function |
| `supabase/functions/sla-automations/index.ts` | Usar templates aprovados |
| `supabase/functions/send-whatsapp/index.ts` | Fallback com template |
| `src/pages/settings/WhatsAppTemplatesSettings.tsx` | Nova UI |
| `src/pages/settings/Settings.tsx` | Adicionar tab |
| `src/hooks/useWhatsAppTemplates.ts` | Novo hook |

