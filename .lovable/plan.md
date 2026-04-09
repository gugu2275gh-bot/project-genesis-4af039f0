

# Fix: Template WhatsApp realmente executado pelo Twilio

## Problemas Identificados

### Bug 1: Campo errado no frontend
`handleSendTemplate` (LeadChat.tsx linha 333) envia `{ to: contactPhone }` mas a Edge Function espera `{ numero }`. Resultado: `numero` é `undefined` → erro 400.

### Bug 2: Edge Function ignora `contentSid` no envio Twilio
A Edge Function (send-whatsapp) extrai `contentSid` do body mas nunca o usa nos parâmetros do Twilio. Sempre envia `Body: rawMessage` (que é vazio no caso de template). O Twilio recebe uma mensagem vazia em vez do template.

## Correções

### Arquivo 1: `src/components/crm/LeadChat.tsx`

Corrigir `handleSendTemplate` (linha 331-337) para enviar `numero` em vez de `to`:

```typescript
const { error } = await supabase.functions.invoke('send-whatsapp', {
  body: {
    numero: String(contactPhone),
    contentSid: template.content_sid,
    contact_id: contactId,
  },
});
```

Adicionar novo fluxo com Select dropdown + Textarea read-only + botão Enviar conforme solicitado anteriormente.

### Arquivo 2: `supabase/functions/send-whatsapp/index.ts`

Quando `contentSid` estiver presente, usar `ContentSid` nos parâmetros Twilio em vez de `Body`:

```typescript
const twilioParams: Record<string, string> = {
  To: `whatsapp:+${phoneStr}`,
  From: TWILIO_FROM_NUMBER,
}

if (contentSid) {
  // Template send - use ContentSid instead of Body
  twilioParams.ContentSid = contentSid
  twilioParams.ContentVariables = JSON.stringify({ "1": "Cliente" })
} else {
  twilioParams.Body = rawMessage
}
```

### Resultado

- Template selecionado pelo operador será realmente enviado via Twilio usando `ContentSid`
- Campo `numero` chegará corretamente na Edge Function
- Interface com Select dropdown + texto read-only + confirmação antes do envio

