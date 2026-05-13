## Diagnóstico

Dois problemas independentes na mesma resposta da imagem:

### A) Pergunta de localização não é sim/não
A pergunta correta deve ser **"Você está na Espanha?" (sim/não)** em qualquer idioma. Hoje há uma contradição no prompt:

- `index.ts:1656` (passo específico) já está correto: `"Hoje você já está na Espanha?" (sim/não). NÃO use a forma disjuntiva "ou ainda está em outro país"`
- `index.ts:1234` (instrução geral do funil) ainda manda a forma disjuntiva: `"Hoje você já está na Espanha ou ainda está em outro país?"`

O modelo lê o bloco geral e gera a pergunta dupla (`"¿ya estás en España o aún estás en otro país?"`), abrindo margem a respostas ambíguas.

### B) Vazamento de PT nas frases-modelo
A trava de idioma funciona (contato `8535ed08…` → `preferred_language=es`, conversa em ES), mas o Gemini copia o início das frases-modelo PT que estão cruas no prompt: "Antes de tudo…", "Trabalhamos com…". A diretiva textual ("traduza fielmente") não é suficiente.

## Plano

### 1. Padronizar a pergunta de localização como yes/no estrito
Em `supabase/functions/whatsapp-webhook/index.ts:1234`:
- Substituir `"Hoje você já está na Espanha ou ainda está em outro país?"` por `"Você está na Espanha?"` e adicionar a regra: **pergunta sim/não, NUNCA disjuntiva, NUNCA pedir o país atual mesmo se a resposta for não**.
- Garantir o mesmo texto base em 1656 (já está) e remover qualquer outra ocorrência da forma disjuntiva ("ou ainda está em outro país", "ou aún estás en otro país").
- A lógica de parser em 1564–1581 já aceita yes/no e negativa pura — não precisa mexer.

### 2. Eliminar o vazamento de PT pré-traduzindo as frases-modelo
Em `supabase/functions/whatsapp-webhook/lib/language.ts`, criar `getPromptTemplates(langCode)` com as frases-chave já em `pt`, `es`, `en` (fallback `es`):

- `askName` — "¿Cuál es tu nombre completo?"
- `thanksThenAskEmail` — "Gracias. ¿Cuál es el mejor e-mail…?"
- `interestQuestion` — "Cuéntame con calma: ¿qué buscas hoy?…"
- `servicesCatalog` — "Trabajamos con ciudadanía española, nómada digital, residencias, NIE, TIE, homologación de estudios, antecedentes, reagrupación y otros procesos."
- `quickQuestionsConsent` — "Voy a hacerte algunas preguntas rápidas…"
- `oneMomentPlease` — "Buena pregunta, ya te explico."
- `askLocationSpain` — "¿Estás en España?" (sim/não)

Em `index.ts`, substituir as strings PT cruas pelos valores localizados nestes pontos:
- 1228, 1233, 1234 (bloco principal de instruções)
- 1622 (NOME), 1630 (E-MAIL), 1641 (INTERESSE+CATÁLOGO), 1656 (LOCALIZAÇÃO)
- 1279–1291 (exemplos de tom: ocultar quando `langCode !== 'pt'`)

A diretiva de cabeçalho (1812/1828) continua reforçando o idioma travado, mas o LLM já receberá as frases prontas no idioma certo.

### 3. Deploy
`whatsapp-webhook`.

### Não vou mexer
- `detectChatLanguage` / `getLanguageDirective` (já corretos).
- Persistência de `preferred_language` (já corrigida).
- Parser de resposta sim/não (já compatível).
- Templates Twilio.

### Arquivos a editar
- `supabase/functions/whatsapp-webhook/lib/language.ts` (novo dicionário + helper)
- `supabase/functions/whatsapp-webhook/index.ts` (pergunta de localização yes/no nos pontos 1234/1656; substituição das frases-modelo PT por variáveis localizadas)
