

## Atualizar número WhatsApp para +34654378464

Substituir o número `+553186262606` por `+34654378464` em todas as Edge Functions que enviam/recebem mensagens WhatsApp.

### Alterações

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `supabase/functions/send-whatsapp/index.ts` | 10 | `whatsapp:+553186262606` → `whatsapp:+34654378464` |
| `supabase/functions/sla-automations/index.ts` | 16 | `whatsapp:+553186262606` → `whatsapp:+34654378464` |
| `supabase/functions/whatsapp-webhook/index.ts` | 673 | `whatsapp:+553186262606` → `whatsapp:+34654378464` |

Três arquivos, uma linha cada. Após deploy automático, todas as mensagens serão enviadas/recebidas pelo novo número espanhol.

