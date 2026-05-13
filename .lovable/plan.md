## Objetivo

Quando a conversa começar e o idioma for identificado, ele fica **travado** para sempre naquele lead/contato. Nenhum sinal posterior (mensagens curtas, palavras ambíguas, "sim/não", áudio transcrito ruim, etc.) pode trocar o idioma.

## Estratégia (uma frase)

`contact.preferred_language` vira a **única fonte da verdade**. Detecção só roda quando ele está vazio (1ª mensagem). A partir daí, todas as respostas usam o idioma travado, sem reavaliação.

## Mudanças em `supabase/functions/whatsapp-webhook/index.ts` (linhas ~1149–1208)

Substituir todo o bloco de detecção atual por:

1. **Se `contact.preferred_language` já existe** → `detectedChatLanguage = preferredLangMap[contact.preferred_language]`. Ignorar `detectChatLanguage`, `strongPortuguese`, `twoTurnsPortuguese`. Sem update no contact.
2. **Se vazio (primeira interação)** → rodar `detectChatLanguage(currentCustomerMessage)`, persistir imediatamente em `contacts.preferred_language` e usar.
3. Remover o bloco `twoTurnsPortuguese` (não é mais necessário) e a lógica condicional de flip para PT.
4. Log: `console.log('Language locked:', detectedChatLanguage, 'source:', contact.preferred_language ? 'contact' : 'first-detection')`.

## Mudanças em `lib/language.ts`

Nenhuma. `detectChatLanguage` continua igual; só é chamada uma vez por contato.

## Casos de borda tratados

- **1ª mensagem é áudio/imagem sem texto** → `detectChatLanguage('')` retorna `pt-BR` (default atual). Persistimos PT. Próxima mensagem com texto **não troca** mais — comportamento desejado pelo usuário ("nunca mude").
- **Cliente troca de idioma no meio** (ex.: começou em ES, manda PT) → bot continua em ES. Operador humano pode editar `preferred_language` no painel se quiser destravar.
- **Contatos legados sem `preferred_language`** → primeira mensagem após o deploy faz a detecção e trava.

## Testes (`funnel_persistence_test.ts` ou novo `language_lock_test.ts`)

- ES detectado na 1ª msg → 2ª msg em PT-BR ainda responde em ES.
- PT detectado na 1ª msg → 2ª msg com "hello, how are you" ainda responde em PT.
- Contato com `preferred_language='es'` pré-existente → mensagem PT não atualiza o contact e mantém ES.

## Deploy

Redeploy `whatsapp-webhook`.

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/language_lock_test.ts` (novo)
