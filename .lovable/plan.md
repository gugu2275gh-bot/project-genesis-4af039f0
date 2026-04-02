

## Corrigir Fluxo Completo de Templates WhatsApp

### Problema Identificado
Existem **dois bugs críticos** no fluxo atual:

1. **Submissão incompleta**: A Edge Function cria o template na Twilio Content API (`POST /v1/Content`) mas **nunca envia para aprovação da Meta** (`POST /v1/Content/{SID}/ApprovalRequests/whatsapp`). Os templates ficam em "Draft" na Twilio eternamente.

2. **Verificação de status quebrada**: O `check_status` busca `GET /v1/Content/{SID}` e procura `data.approval_requests` — mas esse campo não existe no recurso Content. O endpoint correto é `GET /v1/Content/{SID}/ApprovalRequests` (endpoint separado).

### Fluxo Correto (o que será implementado)

```text
SUBMISSÃO (action: submit)
├─ Template sem content_sid (novo):
│   1. POST /v1/Content → cria template, recebe SID
│   2. POST /v1/Content/{SID}/ApprovalRequests/whatsapp
│      Body: { name: template_name, category: "UTILITY"|"MARKETING" }
│   3. Se ambos OK → status = "pending"
│   4. Se passo 1 OK mas passo 2 falha → status = "draft" (content_sid salvo)
│
├─ Template com content_sid mas status draft/error (resubmissão):
│   1. Pula criação do Content (já tem SID)
│   2. POST /v1/Content/{SID}/ApprovalRequests/whatsapp
│   3. Se OK → status = "pending"
│
└─ Template aprovado → skip

VERIFICAÇÃO (action: check_status)
├─ Para cada template com status "pending":
│   1. GET /v1/Content/{SID}/ApprovalRequests  ← endpoint CORRETO
│   2. Parsear response.data[0].status (array de approval requests)
│   3. Atualizar DB: approved/rejected/pending
```

### Alterações

#### 1. Migração SQL — coluna `meta_category`
```sql
ALTER TABLE whatsapp_templates 
ADD COLUMN meta_category text NOT NULL DEFAULT 'UTILITY' 
CHECK (meta_category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION'));
```

#### 2. Edge Function `submit-whatsapp-templates/index.ts`
Reescrever a lógica de submit e check_status:

**Submit**: Após criar Content Template com sucesso, fazer segunda chamada:
```
POST /v1/Content/{SID}/ApprovalRequests/whatsapp
Headers: Basic Auth
Body: { "name": template_name, "category": meta_category }
```
- Se o template já tem `content_sid` mas não está aprovado, pular criação e tentar apenas o ApprovalRequest
- Logar ambos os passos separadamente

**Check Status**: Endpoint correto:
```
GET /v1/Content/{SID}/ApprovalRequests
```
A resposta é `{ data: [{ status: "approved"|"rejected"|"pending", ... }] }` — parsear o primeiro item do array.

#### 3. Frontend — `WhatsAppTemplatesSettings.tsx`
- Adicionar dropdown "Categoria Meta" (UTILITY/MARKETING) no formulário de criação
- Mostrar coluna `meta_category` na tabela principal
- Passar `meta_category` na criação

#### 4. Hook — `useWhatsAppTemplates.ts`
- Adicionar `meta_category` à interface e às mutations de create/update

### Arquivos modificados
- Nova migração SQL (coluna `meta_category`)
- `supabase/functions/submit-whatsapp-templates/index.ts`
- `src/hooks/useWhatsAppTemplates.ts`
- `src/pages/settings/WhatsAppTemplatesSettings.tsx`

