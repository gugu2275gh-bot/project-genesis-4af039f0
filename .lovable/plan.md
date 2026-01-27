
# Plano: Cobrança Automática Diária de Pagamentos em Atraso

## Objetivo

Implementar automação que envia mensagens de cobrança via WhatsApp para todos os pagamentos em atraso, rodando automaticamente a cada 24 horas sem necessidade de usuário logado.

---

## Como Funcionará

1. O `sla-automations` Edge Function já roda periodicamente (via cron)
2. Adicionar nova seção que identifica TODOS os pagamentos em atraso
3. Para cada pagamento em atraso, envia cobrança diária (uma por dia)
4. Usa tabela `payment_reminders` com tipo `DAILY_COLLECTION` + data para evitar duplicatas no mesmo dia
5. Mensagem personalizada: "Olá {nome}! Identificamos que seu pagamento está em atraso. Favor providenciar o mais rápido possível ou entre em contato com a CB Asesoria."

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Adicionar seção de cobrança diária automática |

---

## Detalhes Técnicos

### Lógica da Cobrança Diária

```typescript
// =====================================================
// NEW: DAILY COLLECTION - Send collection message every 24h
// =====================================================
const { data: allOverduePayments } = await supabase
  .from('payments')
  .select(`
    id, due_date, amount, currency,
    opportunities!inner (
      lead_id,
      leads!inner (id, contacts!inner (full_name, phone))
    )
  `)
  .eq('status', 'PENDENTE')
  .lt('due_date', today)

for (const payment of allOverduePayments || []) {
  const oppData = payment.opportunities as unknown as { 
    lead_id: string;
    leads: { id: string; contacts: { full_name: string; phone: number | null } } 
  }
  const contact = oppData?.leads?.contacts
  const leadId = oppData?.leads?.id
  if (!contact?.phone) continue

  // Check if already sent today using reminder_type with date
  const dailyReminderType = `DAILY_COLLECTION_${today}`
  if (await reminderAlreadySent('payment_reminders', payment.id, dailyReminderType)) {
    continue
  }

  // Send collection message
  const message = `Olá ${contact.full_name}! Identificamos que seu pagamento está em atraso. Favor providenciar o mais rápido possível ou entre em contato com a CB Asesoria.`
  
  await supabase.from('payment_reminders').insert({ 
    payment_id: payment.id, 
    reminder_type: dailyReminderType 
  })
  
  await sendWhatsApp(contact.phone, message, leadId)
  results.dailyCollections++
}
```

### Rastreamento de Lembretes

- Tipo de lembrete: `DAILY_COLLECTION_YYYY-MM-DD` (ex: `DAILY_COLLECTION_2026-01-27`)
- Isso permite enviar exatamente 1 mensagem por dia para cada pagamento em atraso
- A tabela `payment_reminders` já existe e será reutilizada

### Cron Job

Para garantir execução a cada 24 horas, será necessário:
1. Habilitar extensões `pg_cron` e `pg_net` no Supabase
2. Criar cron job que executa a cada 24h às 09:00

```sql
select cron.schedule(
  'daily-sla-automations',
  '0 9 * * *',  -- Todos os dias às 9h
  $$
  select net.http_post(
    url:='https://xdnliyuogkoxckbesktx.supabase.co/functions/v1/sla-automations',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## Fluxo Visual

```text
+------------------+     +----------------------+     +------------------+
| Cron Job (24h)   | --> | sla-automations      | --> | N8N Webhook      |
| (pg_cron)        |     | Edge Function        |     | (WhatsApp)       |
+------------------+     +----------------------+     +------------------+
                                    |
                                    v
                         +----------------------+
                         | payment_reminders    |
                         | DAILY_COLLECTION_*   |
                         +----------------------+
                                    |
                                    v
                         +----------------------+
                         | mensagens_cliente    |
                         | (histórico CRM)      |
                         +----------------------+
```

---

## Resultado Esperado

| Contador | Descrição |
|----------|-----------|
| `dailyCollections` | Número de cobranças diárias enviadas |

---

## Primeira Execução

Como o usuário quer começar agora (20:35), após implementar a alteração:
1. Deploy automático da Edge Function
2. Testar manualmente chamando a função uma vez
3. Configurar cron para execução diária às 09:00

---

## Considerações

- Mensagem padronizada igual à do botão manual
- Evita duplicatas no mesmo dia via `payment_reminders`
- Registra todas as mensagens em `mensagens_cliente` para histórico no CRM
- Usa mesma infraestrutura de WhatsApp já existente (N8N webhook)
- Não requer usuário logado - usa SUPABASE_SERVICE_ROLE_KEY
