

## Atualizar Templates com SIDs do Twilio e Corrigir Verificacao de Status

### Problema
Os 12 templates ES estao aprovados no Twilio mas no banco estao como `draft` sem `content_sid`. A verificacao de status (`check_status`) so busca templates com status `pending`, entao nunca vai pegar os que estao como `draft`.

### Plano

#### 1. SQL — Atualizar content_sid e status dos 12 templates ES
Update direto com os SIDs extraidos das screenshots do Twilio:

```sql
UPDATE whatsapp_templates SET content_sid = 'HXd882763fd17c5c2f9802a5420c31374c', status = 'approved', is_active = true WHERE template_name = 'cb_welcome_es';
UPDATE whatsapp_templates SET content_sid = 'HX06ad87c416e5eb2b9f283cf44b2fc978', status = 'approved', is_active = true WHERE template_name = 'cb_reengagement_es';
UPDATE whatsapp_templates SET content_sid = 'HX60a121229da869875ce534162c4a801b', status = 'approved', is_active = true WHERE template_name = 'cb_contract_reminder_es';
UPDATE whatsapp_templates SET content_sid = 'HX2ff98da4e5048288f928ffda7d8166c8', status = 'approved', is_active = true WHERE template_name = 'cb_payment_pre_7d_es';
UPDATE whatsapp_templates SET content_sid = 'HXee91f2efdadbe9df2b2ec28f5d848f31', status = 'approved', is_active = true WHERE template_name = 'cb_payment_pre_48h_es';
UPDATE whatsapp_templates SET content_sid = 'HX5e4c6aa5bed1177d2e8e1a6d76c74244', status = 'approved', is_active = true WHERE template_name = 'cb_payment_due_today_es';
UPDATE whatsapp_templates SET content_sid = 'HX49931df11fb38d7e15ff43535bf75eb7', status = 'approved', is_active = true WHERE template_name = 'cb_payment_post_d1_es';
UPDATE whatsapp_templates SET content_sid = 'HX14fbe686aadb5cc8b59413bbfda3ccbc', status = 'approved', is_active = true WHERE template_name = 'cb_payment_post_d3_es';
UPDATE whatsapp_templates SET content_sid = 'HX811bf0637897f918b9631519ba89baaa', status = 'approved', is_active = true WHERE template_name = 'cb_document_reminder_es';
UPDATE whatsapp_templates SET content_sid = 'HXc41df87e6ff875ebdc6f004edbc7acfa', status = 'approved', is_active = true WHERE template_name = 'cb_onboarding_reminder_es';
UPDATE whatsapp_templates SET content_sid = 'HXf6499a023f1a6b1ec722f2ba77f56720', status = 'approved', is_active = true WHERE template_name = 'cb_tie_pickup_es';
UPDATE whatsapp_templates SET content_sid = 'HX3d03ac8855b5081d22b9770b913251ce', status = 'approved', is_active = true WHERE template_name = 'cb_huellas_reminder_es';
```

#### 2. Edge Function — Melhorar `check_status`
Alterar a action `check_status` em `submit-whatsapp-templates/index.ts` para:
- Buscar templates com `content_sid` nao nulo em **qualquer status** (nao apenas `pending`), permitindo re-verificacao
- Aceitar parametro opcional `force` para verificar todos, incluindo aprovados

#### 3. Adicionar action `sync_from_twilio`
Nova action que lista todos os Content Templates da Twilio (`GET /v1/Content`), cruza pelo `friendly_name` com `template_name` no banco, e atualiza `content_sid` + busca status de aprovacao automaticamente. Isso permite sincronizacao futura sem precisar copiar SIDs manualmente.

### Arquivos modificados
- Nova migracao SQL (UPDATE dos 12 templates com SIDs)
- `supabase/functions/submit-whatsapp-templates/index.ts` (melhorar check_status + adicionar sync_from_twilio)

