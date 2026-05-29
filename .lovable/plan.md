## Problema

Quando o cliente responde "Me llamo Pedro Henrique Rodrigues" (ou variações em PT/EN/FR), o webhook grava a frase inteira em `contacts.full_name` em vez de apenas "Pedro Henrique Rodrigues".

Causa: em `supabase/functions/whatsapp-webhook/index.ts` (linhas ~1432 e ~1447–1462), tanto `findExplicitFullNameAnswer` quanto o ramo `currentMessageAsName` salvam o texto bruto. Nenhum remove introduções como "Me llamo", "Mi nombre es", "Meu nome é", "Sou o(a)", "My name is", "I am", "Je m'appelle".

## Solução

1. **`supabase/functions/whatsapp-webhook/lib/name-extraction.ts`** — adicionar utilitário e ajustar validação:
   - Nova função `stripNameIntroPrefix(text)` removendo, case-insensitive, prefixos:
     - PT: `me chamo`, `meu nome (completo) é`, `sou o/a`, `aqui é o/a`, `nome:`
     - ES: `me llamo`, `mi nombre (completo) es`, `soy`, `nombre:`
     - EN: `my (full) name is`, `i am`, `i'm`, `this is`, `name:`
     - FR: `je m'appelle`, `mon nom (complet) est`, `je suis`
     - Tolera saudação inicial ("Hola,", "Olá!") antes do prefixo
     - Fallback: se o resultado ficar com <2 chars, devolve o texto original
   - `isLikelyFullNameAnswer` passa a testar também a versão sem prefixo, para aceitar "Me llamo Pedro Henrique Rodrigues" como nome válido sem cair no bloqueio de `FIRST_PERSON_VERB_RE` (que pegaria "soy/sou/am").
   - `findExplicitFullNameAnswer` retorna `stripNameIntroPrefix(...)` do texto encontrado.

2. **`supabase/functions/whatsapp-webhook/index.ts`** — onde grava `full_name` a partir da resposta atual (linha ~1449), aplicar `stripNameIntroPrefix(String(messageForAI).trim())` antes do update em `contacts`. Importar de `./lib/name-extraction.ts`.

3. **Testes** em `supabase/functions/whatsapp-webhook/name_email_refusal_test.ts` (ou novo `name_prefix_strip_test.ts`):
   - "Me llamo Pedro Henrique Rodrigues" → strip = "Pedro Henrique Rodrigues" e `isLikelyFullNameAnswer` = true
   - "Meu nome é Ana Maria Silva" → "Ana Maria Silva"
   - "My name is John Doe" → "John Doe"
   - "Je m'appelle Marie Dupont" → "Marie Dupont"
   - "Soy Pedro Silva" → "Pedro Silva" (e aceito)
   - "Pedro Henrique Rodrigues" (sem prefixo) → inalterado
   - "Me llamo" sozinho → devolve texto original (fallback) e `isLikelyFullNameAnswer` = false

4. Deploy automático da edge function `whatsapp-webhook` após o build.

## Fora de escopo

- Não vou limpar registros já gravados com a frase inteira; correção é só para novos cadastros.
- Sem mudanças no fluxo de e-mail/idioma/funil — apenas a extração do nome.
