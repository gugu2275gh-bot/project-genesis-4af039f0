

## Recriar e Resubmeter Todos os Templates no Twilio

### Problema
Os templates existentes no Twilio foram criados sem os sample values corretos e alguns têm status desatualizado. Precisamos deletar os content templates antigos, recriar com os dados de teste (`{{1}}=Jorge`, `{{2}}=9,99`, `{{3}}=31/12/2050`) e resubmeter todos para aprovação da Meta.

### Plano

#### 1. Edge Function — Nova action `force_resubmit`
Adicionar action `force_resubmit` em `submit-whatsapp-templates/index.ts` que para cada template:
1. Se tem `content_sid`, faz `DELETE /v1/Content/{SID}` no Twilio para remover o antigo
2. Limpa `content_sid` no banco
3. Cria novo Content Template com sample values corretos
4. Submete para aprovação da Meta (`POST /ApprovalRequests/whatsapp`)

Isso garante que todos passem pelo ciclo completo e apareçam como "under review" no Twilio (imagem 3).

#### 2. UI — Botão "Resubmeter Todos"
Adicionar botão na tela de templates que chama `force_resubmit`. O hook `useWhatsAppTemplates` ganha uma nova mutation `forceResubmit`.

### Detalhes Técnicos

**Edge Function — action `force_resubmit`:**
```text
Para cada template no banco:
  1. DELETE /v1/Content/{content_sid} (se existir)
  2. UPDATE whatsapp_templates SET content_sid = NULL
  3. POST /v1/Content (criar com body + variables com samples)
  4. POST /v1/Content/{newSID}/ApprovalRequests/whatsapp
  5. UPDATE whatsapp_templates SET content_sid = newSID, status = 'pending'
```

**Hook — nova mutation:**
- `forceResubmit`: invoca `submit-whatsapp-templates` com `{ action: 'force_resubmit' }`
- Invalida query de templates no sucesso

**UI — botão na página:**
- Botão "Resubmeter Todos" com confirmação (AlertDialog) avisando que todos os templates serão recriados
- Loading state durante a operação

### Arquivos modificados
- `supabase/functions/submit-whatsapp-templates/index.ts` (nova action)
- `src/hooks/useWhatsAppTemplates.ts` (nova mutation)
- `src/pages/settings/WhatsAppTemplatesSettings.tsx` (botão)

