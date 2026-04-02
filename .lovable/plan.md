

## Expandir Formulário de Criação para Espelhar o Twilio Console

### Problema
O formulário atual de criação/edição de templates só suporta o tipo `twilio/text` (corpo de texto simples). O Twilio Console permite configurar cabeçalho (header), rodapé (footer), botões de ação (quick reply, call-to-action com URL/telefone), e mídia — campos que a Meta exige para aprovação de templates mais ricos.

### O que será feito

#### 1. UI — Campos adicionais nos dialogs de criação e edição (`WhatsAppTemplatesSettings.tsx`)

Adicionar os seguintes campos ao formulário, organizados em seções:

**Tipo de Conteúdo** (novo select):
- `twilio/text` (padrão) — Texto simples
- `twilio/media` — Texto + imagem/vídeo/documento
- `twilio/call-to-action` — Texto + botões URL/telefone
- `twilio/quick-reply` — Texto + respostas rápidas (até 3)
- `twilio/card` — Card com título, subtítulo, mídia e botões

**Header / Cabeçalho** (opcional, max 60 chars):
- Input de texto para cabeçalho (visível quando tipo suporta)

**Footer / Rodapé** (opcional, max 60 chars):
- Input de texto para rodapé

**Media URL** (condicional):
- Input para URL de mídia (visível em `twilio/media` e `twilio/card`)

**Botões** (condicional, até 3):
- Tipo: `QUICK_REPLY`, `URL`, `PHONE_NUMBER`
- Título (max 25 chars)
- URL ou Telefone (conforme o tipo)
- Adicionar/remover botões dinamicamente

**Novos state variables**:
- `newContentType`, `newHeader`, `newFooter`, `newMediaUrl`, `newButtons[]`
- Equivalentes `edit*` para o dialog de edição

**Preview atualizado**: O preview WhatsApp mostrará header, corpo, footer e botões renderizados visualmente.

#### 2. Banco de dados — Novos campos na tabela `whatsapp_templates`

Migração SQL para adicionar:
```sql
ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'twilio/text',
  ADD COLUMN IF NOT EXISTS header_text text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS buttons jsonb DEFAULT '[]'::jsonb;
```

#### 3. Edge Function — Construir payload correto por tipo de conteúdo

Atualizar `submit-whatsapp-templates/index.ts` para montar o payload `types` conforme o `content_type` do template:

- **twilio/text**: `{ body }` (atual)
- **twilio/media**: `{ body, media: [url] }`
- **twilio/quick-reply**: `{ body, actions: [{ type: 'QUICK_REPLY', title, id }] }`
- **twilio/call-to-action**: `{ body, actions: [{ type: 'URL'|'PHONE_NUMBER', title, url|phone }] }`
- **twilio/card**: `{ title, subtitle, body, media: [url], actions: [...] }`

Incluir `header_text` e `footer_text` quando presentes (o Twilio aceita via corpo com formatação ou via tipo card).

#### 4. Hook — Atualizar interface `WhatsAppTemplate`

Adicionar os novos campos à interface em `useWhatsAppTemplates.ts`.

### Arquivos modificados
- `src/pages/settings/WhatsAppTemplatesSettings.tsx` (campos no formulário + preview)
- `src/hooks/useWhatsAppTemplates.ts` (interface + mutations)
- `supabase/functions/submit-whatsapp-templates/index.ts` (payload dinâmico)
- Nova migração SQL (novos campos)

