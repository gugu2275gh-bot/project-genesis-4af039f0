
# Plano: Aprimorar Lembretes Automáticos de Pagamento

## Situação Atual

A Edge Function `sla-automations` **já implementa** os lembretes automáticos conforme solicitado:

| Lembrete | Implementado | O que faz |
|----------|--------------|-----------|
| D-7 (7 dias antes) | ✅ Sim | Envia WhatsApp ao cliente |
| D-2 (48h antes) | ⚠️ Parcial | Envia WhatsApp, mas **não notifica o Financeiro** |
| D0 (no dia, às 9h) | ✅ Sim | Envia WhatsApp entre 9h-10h |

## Ajuste Necessário

Adicionar notificação interna para a equipe **FINANCEIRO** no lembrete de 48h (D-2), para que eles fiquem cientes do vencimento iminente e possam monitorar.

---

## Alteração na Edge Function

**Arquivo: `supabase/functions/sla-automations/index.ts`**

No bloco do lembrete de 48h (linhas 368-379), adicionar notificação para usuários FINANCEIRO:

```typescript
// 2 days before
if (daysUntilDue <= 2 && daysUntilDue > 0) {
  if (!(await reminderAlreadySent('payment_reminders', payment.id, 'PRE_48H'))) {
    await supabase.from('payment_reminders').insert({ 
      payment_id: payment.id, 
      reminder_type: 'PRE_48H' 
    })
    
    const msg = templateMap.template_payment_pre_reminder_48h
      .replace('{nome}', contact.full_name)
      .replace('{valor}', String(payment.amount))
      .replace('{data}', payment.due_date)
    await sendWhatsApp(contact.phone, msg, leadId)
    
    // NOVO: Notificar equipe Financeiro
    const { data: financeUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'FINANCEIRO')
    
    for (const user of financeUsers || []) {
      await supabase.from('notifications').insert({
        user_id: user.user_id,
        title: 'Parcela vence em 48h',
        message: `Pagamento de €${payment.amount} de ${contact.full_name} vence em ${payment.due_date}.`,
        type: 'payment_pending',
      })
    }
    
    results.paymentPreReminders++
  }
}
```

---

## Fluxo Completo de Lembretes (já implementado + ajuste)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LEMBRETES PRÉ-VENCIMENTO                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  D-7 (7 dias antes do vencimento)                                           │
│  ├─ WhatsApp → Cliente                                                      │
│  │  "Olá {nome}! 📅 Sua parcela de €{valor} vence em 7 dias ({data})..."    │
│  └─ Registra reminder em payment_reminders (PRE_7D)                         │
│                                                                             │
│  D-2 (48 horas antes)                                                       │
│  ├─ WhatsApp → Cliente                                                      │
│  │  "Olá {nome}! ⏰ Sua parcela de €{valor} vence em 2 dias ({data})..."    │
│  ├─ Notificação interna → Equipe FINANCEIRO  ← NOVO                         │
│  │  "Parcela vence em 48h: €{valor} de {nome} em {data}"                    │
│  └─ Registra reminder em payment_reminders (PRE_48H)                        │
│                                                                             │
│  D0 (no dia do vencimento, às 9h)                                           │
│  ├─ WhatsApp → Cliente                                                      │
│  │  "Olá {nome}! 🔔 Hoje vence sua parcela de €{valor}..."                  │
│  └─ Registra reminder em payment_reminders (DUE_TODAY)                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/sla-automations/index.ts` | Adicionar notificação para FINANCEIRO no lembrete D-2 |

---

## Seção Técnica

### Detalhes da Implementação

1. **Lógica de dias**: O cálculo `daysUntilDue <= 2 && daysUntilDue > 0` captura pagamentos que vencem em 1 ou 2 dias
2. **Prevenção de duplicatas**: A verificação `reminderAlreadySent()` garante que cada lembrete é enviado apenas uma vez
3. **Horário do D0**: O lembrete do dia do vencimento só é enviado entre 9h-10h (`now.getHours() >= 9 && now.getHours() < 10`)
4. **Cron Job**: A função é executada a cada 15 minutos via cron

### Templates de Mensagem Configuráveis

Os textos das mensagens podem ser personalizados via tabela `system_config`:
- `template_payment_pre_reminder_7d`
- `template_payment_pre_reminder_48h`
- `template_payment_due_today`

