

## Corrigir Sincronização de Status — Forçar Verificação Real no Twilio

### Problema
A migração anterior fez `UPDATE SET status = 'approved'` para TODOS os templates com `content_sid`, sem consultar o Twilio. Resultado: templates rejeitados (como `cb_huellas_reminder_es`) aparecem como "Aprovado" no sistema.

### Plano

#### 1. SQL — Reverter todos os status para `pending` (forçar re-verificação)
Resetar o status de todos os templates que foram forçados a `approved` pela migração, para que a verificação real os atualize:

```sql
UPDATE public.whatsapp_templates
SET status = 'pending', updated_at = now()
WHERE content_sid IS NOT NULL;
```

#### 2. UI — Botão "Verificar Status" deve usar `force: true`
Alterar a chamada `checkStatus.mutate(false)` para `checkStatus.mutate(true)` para que SEMPRE verifique todos os templates (incluindo os já marcados como approved), garantindo sincronização real.

#### 3. Executar verificação automática após migração
Após a migração rodar, o usuário clica em "Verificar Status" e a edge function consulta `GET /v1/Content/{SID}/ApprovalRequests` para CADA template, atualizando o status com o valor real retornado pelo Twilio (approved, rejected, pending, etc.).

### Arquivos modificados
- Nova migração SQL (reset status para pending)
- `src/pages/settings/WhatsAppTemplatesSettings.tsx` (force: true no botão)

