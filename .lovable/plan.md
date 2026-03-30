

## Log detalhado de envio de templates WhatsApp

### O que será feito

Criar uma tabela `whatsapp_template_logs` para registrar cada ação de submissão/verificação de templates, e exibir esses logs na UI da página de templates com detalhes completos para diagnóstico.

### Alterações

#### 1. Nova tabela `whatsapp_template_logs` (migration)

```sql
create table public.whatsapp_template_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  template_name text not null,
  action text not null, -- 'submit', 'check_status', 'submit_approval'
  status text not null, -- 'success', 'error', 'skipped'
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  twilio_status_code int,
  content_sid text,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.whatsapp_template_logs enable row level security;

create policy "Admins can view template logs"
  on public.whatsapp_template_logs for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['ADMIN','MANAGER']::app_role[]));
```

#### 2. Atualizar `supabase/functions/submit-whatsapp-templates/index.ts`

Para cada template processado (submit e check_status), inserir um registro na tabela de logs com:
- `request_payload`: o body enviado ao Twilio
- `response_payload`: a resposta completa do Twilio
- `twilio_status_code`: HTTP status code
- `error_message`: mensagem de erro se houver
- `user_id`: quem executou a ação
- `content_sid`: SID retornado

#### 3. Atualizar `src/hooks/useWhatsAppTemplates.ts`

- Adicionar query `templateLogs` para buscar logs da tabela ordenados por `created_at desc`

#### 4. Atualizar `src/pages/settings/WhatsAppTemplatesSettings.tsx`

- Adicionar seção "Logs de Envio" abaixo da tabela de templates
- Tabela com colunas: Data/Hora, Template, Ação, Status, Status HTTP, Content SID, Erro
- Expandir linha para ver payload completo (request + response) em JSON formatado
- Filtro por status (todos/sucesso/erro)
- Limite de 50 logs mais recentes

### Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/xxx_whatsapp_template_logs.sql` | Nova tabela + RLS |
| `supabase/functions/submit-whatsapp-templates/index.ts` | Inserir logs a cada operação |
| `src/hooks/useWhatsAppTemplates.ts` | Nova query de logs |
| `src/pages/settings/WhatsAppTemplatesSettings.tsx` | Seção de logs na UI |

