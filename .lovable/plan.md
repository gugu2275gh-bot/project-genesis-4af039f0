# Garantir abertura (Msg1 + Msg2) em todos os idiomas

## Diagnóstico

Na 1ª interação, o sistema hoje **delega ao LLM** o envio da abertura: monta um prompt em português com as duas frases separadas por `|||` e pede para traduzir mantendo o delimitador (`index.ts` linhas 1381–1392).

- Em ES o LLM dividiu corretamente → vieram as 2 bolhas (Msg1 + Msg2).
- Em PT o LLM devolveu **só a Msg1**, sem `|||` e sem a pergunta de consentimento ("vou te fazer algumas perguntas rápidas… pode ser?"). Resultado: o cliente fica sem saber o que responder e o fluxo trava.

A causa raiz é confiar no LLM para uma mensagem que é **100% canônica e já existe traduzida** em `lib/language.ts` (`openingLine1` / `openingLine2` em PT/ES/EN/FR).

## Correções

### A) `supabase/functions/whatsapp-webhook/index.ts` — short-circuit determinístico na 1ª interação

Antes de chamar o LLM, quando `isFirstInteraction && !isReturningClient`, montar a resposta diretamente a partir do dicionário de idioma travado e pular a chamada ao Gemini:

```ts
if (isFirstInteraction && !isReturningClient) {
  const tt = getLanguageTexts(detectedChatLanguage) // já existe
  aiResponse = `${tt.openingLine1}|||${tt.openingLine2}`
  // pula chamada LLM, segue direto para o bloco de envio (linhas 2376+)
}
```

Isso garante exatamente as duas bolhas, em qualquer idioma, sempre iguais às mostradas em ES no print do usuário. Nada de tradução improvisada, nada de Msg2 faltando.

### B) Defesa em camada de envio (`index.ts` ~2376)

Adicionar um guard pós-processamento: se `!aberturaDone` e a resposta final só contém Msg1 (regex `obrigad[oa] por (falar|escrever)` / `gracias por (hablar|escribir)` / `thank.*for (reaching|contacting)` / `merci de (nous|m'avoir) contact`) **e** não contém Msg2 (regex já existente `perguntas? r[áa]pidas?|preguntas r[áa]pidas?|quick questions?|questions rapides`), anexar `|||${openingLine2}` antes de enviar. Funciona como rede de segurança caso algum caminho futuro volte a passar pelo LLM.

### C) Reforço da instrução do LLM (defesa em profundidade)

Mesmo com (A) cobrindo a 1ª interação, manter o bloco "PRIMEIRA INTERAÇÃO" no system prompt como fallback, mas trocar a frase "traduza fielmente" por **"use EXATAMENTE estas duas frases já traduzidas"** seguidas das versões em PT/ES/EN/FR de `openingLine1`/`openingLine2`. Remove ambiguidade de tradução.

### D) Testes (`opener_idempotency_test.ts` e novo `opener_canonical_test.ts`)

- Cobrir os 4 idiomas: para `isFirstInteraction=true && !isReturningClient`, a resposta produzida pelo short-circuit é exatamente `openingLine1|||openingLine2` do idioma travado.
- Guard B: dada uma resposta só com Msg1 em cada idioma, o pós-processador anexa `|||openingLine2`.

### E) Deploy

Redeploy de `whatsapp-webhook`.

## Arquivos tocados

- `supabase/functions/whatsapp-webhook/index.ts` (short-circuit + guard)
- `supabase/functions/whatsapp-webhook/opener_idempotency_test.ts` (expandir)
- `supabase/functions/whatsapp-webhook/opener_canonical_test.ts` (novo)

## Fora do escopo

- Etapas 3–8 do fluxo (nome, email, interesse, localização, aprofundamento, handoff) já têm proteções determinísticas. Esta entrega foca só na abertura porque é onde o usuário viu a quebra. Se quiser, posso aplicar o mesmo padrão "short-circuit canônico" a Msg3/Msg4/Msg5+Msg6 em seguida.
