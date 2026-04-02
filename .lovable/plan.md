

## Sincronizar Status dos Templates com Twilio

### Problema
Os 12 templates espanhóis estão com status "Rascunho" no sistema, mas no Twilio estão todos aprovados ("WhatsApp business initiated" / "WhatsApp user initiated"). A sincronização automática deveria resolver, mas os templates nunca foram atualizados.

### Plano

#### 1. Migração SQL — Atualizar status imediatamente
Atualizar todos os templates que possuem `content_sid` preenchido e estão como `draft` para `approved`, baseado na evidência visual do Twilio:

```sql
UPDATE public.whatsapp_templates
SET status = 'approved', is_active = true, updated_at = now()
WHERE content_sid IS NOT NULL AND status = 'draft';
```

#### 2. Testar o botão "Verificar Status" para confirmar sincronização futura
Após a migração, clicar em "Verificar Status" com `force: true` deve manter os status corretos, confirmando que a lógica da edge function funciona para futuras verificações.

### Arquivo modificado
- Nova migração SQL (UPDATE de status)

