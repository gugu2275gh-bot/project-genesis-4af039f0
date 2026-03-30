

## Correção de M2, M3, M4, R4, R5, R6, R8

### Resumo dos problemas

| ID | Descrição | Arquivo |
|----|-----------|---------|
| M2 | `ROLE_LABELS` em `useLeadMessages.ts` falta EXPEDIENTE e DIRETORIA | `src/hooks/useLeadMessages.ts` |
| M3 | IA não pausa automaticamente após completar handoff (Etapa 8) | `supabase/functions/whatsapp-webhook/index.ts` |
| M4 | DAILY_COLLECTION envia lembretes diários infinitamente | `supabase/functions/sla-automations/index.ts` |
| R4 | Limitar frequência do DAILY_COLLECTION após X dias | `supabase/functions/sla-automations/index.ts` |
| R5 | Mecanismo de auto-pausa pós-handoff | `supabase/functions/whatsapp-webhook/index.ts` |
| R6 | Adicionar EXPEDIENTE e DIRETORIA ao ROLE_LABELS (igual M2) | `src/hooks/useLeadMessages.ts` |
| R8 | Rate limiting no whatsapp-webhook | `supabase/functions/whatsapp-webhook/index.ts` |

### Alterações

#### 1. `src/hooks/useLeadMessages.ts` — M2/R6

Adicionar ao `ROLE_LABELS`:
```typescript
EXPEDIENTE: 'Expediente',
DIRETORIA: 'Diretoria',
```

#### 2. `supabase/functions/sla-automations/index.ts` — M4/R4

Na seção DAILY_COLLECTION, adicionar filtro de dias em atraso:
- Até D+14: lembrete diário (como hoje)
- D+15 a D+30: lembrete a cada 3 dias (usando `day_of_year % 3`)
- Após D+30: parar de enviar (escalar para gerente via notificação interna)

Calcular `daysOverdue` a partir de `due_date` e aplicar a lógica antes do envio.

#### 3. `supabase/functions/whatsapp-webhook/index.ts` — M3/R5

Após a IA gerar e enviar a resposta (linha ~1530), detectar se a resposta contém padrões de handoff (etapa 8): frases como "encaminhar para um especialista", "encaminhar para um atendente", "vou te encaminhar". Se detectado:
- Inserir uma mensagem marcadora com `origem: 'SISTEMA'` e texto "🤖 Handoff automático — IA pausada após encaminhamento ao atendente"
- Isso faz com que na próxima mensagem do cliente, o check existente (`lastOutgoing?.origem === 'SISTEMA'`) pause a IA automaticamente

#### 4. `supabase/functions/whatsapp-webhook/index.ts` — R8

Adicionar rate limiting por número de telefone usando a tabela `message_dedup` (já existente) ou um check in-memory simples:
- Contar mensagens recebidas do mesmo número nos últimos 60 segundos via query na `mensagens_cliente`
- Se mais de 10 mensagens em 60s, retornar early sem chamar a IA (ainda salva a mensagem)
- Logar "Rate limit exceeded" para monitoramento

### Detalhes técnicos

**Auto-pausa (M3/R5):**
```typescript
// Após enviar a resposta da IA com sucesso
const handoffPatterns = [
  'encaminhar para um especialista',
  'encaminhar para um atendente',
  'vou te encaminhar',
  'transfer you to',
  'te voy a transferir',
  'derivar tu caso',
];
const isHandoff = handoffPatterns.some(p => aiResponse.toLowerCase().includes(p));
if (isHandoff) {
  await supabase.from('mensagens_cliente').insert({
    id_lead: lead.id,
    mensagem_IA: '🤖 Handoff automático — IA pausada após encaminhamento.',
    origem: 'SISTEMA',
  });
  console.log('Auto-pause: AI handoff detected, inserting SISTEMA marker');
}
```

**Rate limiting (R8):**
```typescript
// Antes da seção AI AGENT
const { count: recentMsgCount } = await supabase
  .from('mensagens_cliente')
  .select('id', { count: 'exact', head: true })
  .eq('id_lead', lead.id)
  .not('mensagem_cliente', 'is', null)
  .gte('created_at', new Date(Date.now() - 60000).toISOString());

if ((recentMsgCount || 0) > 10) {
  console.warn('Rate limit: >10 messages in 60s, skipping AI');
  skipAIAgent = true;
}
```

**DAILY_COLLECTION com limite (M4/R4):**
```typescript
const dueDate = new Date(payment.due_date);
const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);
if (daysOverdue > 30) {
  // Escalar internamente, não enviar mais WhatsApp
  continue;
}
if (daysOverdue > 14) {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  if (dayOfYear % 3 !== 0) continue; // A cada 3 dias
}
```

