

## Correção do erro na submissão de templates WhatsApp

### Problema identificado

O gateway do Twilio (`connector-gateway.lovable.dev/twilio`) **adiciona automaticamente** o prefixo `/2010-04-01/Accounts/{AccountSid}` a todos os paths. Porém, a **Content API** do Twilio (usada para criar templates) fica em `content.twilio.com/v1/Content` — um serviço completamente diferente que **não é acessível** pelo gateway.

O resultado: a chamada `POST /Content` vira `POST /2010-04-01/Accounts/{sid}/Content`, que não existe, retornando XML de erro (daí o `"Unexpected token '<'"`).

### Solução

A Content API do Twilio requer autenticação direta (Account SID + Auth Token como Basic Auth), não suportada pelo gateway do conector. A solução é **chamar a Content API diretamente** usando credenciais armazenadas como secrets do Supabase.

### Alterações

#### 1. Adicionar secrets necessários
- Adicionar `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` como secrets do Supabase (o usuário precisará fornecer esses valores do Console Twilio)

#### 2. Atualizar `supabase/functions/submit-whatsapp-templates/index.ts`
- Substituir chamadas ao gateway pela **API direta** do Twilio Content:
  - URL: `https://content.twilio.com/v1/Content`
  - Auth: Basic Auth com `TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`
  - Content-Type: `application/json`
- Manter a mesma estrutura de payload (já está correta para a Content API)
- Atualizar o check de status para `GET https://content.twilio.com/v1/Content/{sid}`
- Adicionar validação das novas env vars com mensagem de erro clara

#### 3. Adicionar funcionalidade "Novo Template" na UI
- Botão "Novo Template" no header da página
- Dialog com campos necessários para aprovação Meta:
  - **Nome** (snake_case, obrigatório)
  - **Tipo de automação** (select com opções ou input livre)
  - **Idioma** (select: pt_BR, es, en_US, fr)
  - **Corpo da mensagem** (textarea, máx 1024 chars, com variáveis `{{1}}`, `{{2}}`)
  - **Variáveis** (input para adicionar nomes das variáveis usadas)
- Validações inline: nome em snake_case, limite de caracteres
- Preview em tempo real do template
- Salva como `draft` na tabela `whatsapp_templates`

#### 4. Atualizar `src/hooks/useWhatsAppTemplates.ts`
- Adicionar mutation `createTemplate` para INSERT na tabela

### Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/submit-whatsapp-templates/index.ts` | Chamar Content API diretamente |
| `src/pages/settings/WhatsAppTemplatesSettings.tsx` | Adicionar botão + dialog "Novo Template" |
| `src/hooks/useWhatsAppTemplates.ts` | Adicionar mutation createTemplate |

