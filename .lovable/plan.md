## Diagnóstico

Na conversa do Gustavo (`8ccae119-…`), o e-mail foi pedido **duas vezes**:

1. 12:50:32 — bot pediu o e-mail corretamente.
2. 12:50:43 — usuário respondeu `Gustavohbf16@gmail.com`. Fluxo seguiu normalmente até o pré-handoff (12:54:05).
3. 12:54:29 — REPLAY drenou 1 item parqueado e enviou: **"Como prometido, sobre sua dúvida anterior: Anotado, Gustavo. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?"**

### Causa raiz

O **PARKING** (linha 1986 de `index.ts`) chamou `classifyOffTopic(rawCustomerMessage, lastAssistantQuestion)` na **primeira mensagem do contato** (`"Gustavo Braga"` às 12:49:49), quando `lastAssistantQuestion` ainda era vazio. Em `lib/offtopic.ts`, a heurística final `if (raw.length >= 12) return { kind: 'request' }` parqueou a mensagem como off-topic porque não havia pergunta corrente para validar contra.

No replay, o LLM recebeu `item.text = "Gustavo Braga"` e, sem contexto, gerou um ACK + re-pergunta de e-mail (pegou a frase canônica do system prompt), resultando na segunda solicitação de e-mail.

## Correções (3 camadas de defesa)

### A) `lib/offtopic.ts` — não parquear quando não há pergunta corrente nem sinal real de off-topic

Em `classifyOffTopic`, antes do fallback `length >= 12 → request`, adicionar guards:

- Se **`lastAssistantQuestion` é vazio/null** (primeiro turno ou bot ainda não perguntou nada) → retornar `null`. Mensagem nunca é off-topic se não houve pergunta.
- Se a mensagem **parece um nome completo** (`isLikelyFullNameAnswer(raw)`) → retornar `null`.
- Se a mensagem **contém e-mail válido** (`hasValidEmail(raw)`) → retornar `null`.
- Se a mensagem é uma **data** (`isPotentialEntryDateAnswer(raw)`) → retornar `null`.
- Se a mensagem é **cidade espanhola válida** (`isValidSpanishCity(raw)`) → retornar `null`.

Isso garante que dados de cadastro nunca entram na fila de off-topics, mesmo se chegarem fora de ordem ou antes da pergunta canônica.

### B) `index.ts` — REPLAY filtra itens que já viraram dado coletado

Antes do loop de drenagem (linha 2762), filtrar `replayQueue` removendo qualquer item cujo `item.text`:
- é nome (`isLikelyFullNameAnswer`),
- contém e-mail (`hasValidEmail`),
- é data (`isPotentialEntryDateAnswer`),
- é cidade espanhola (`isValidSpanishCity`),
- é yes/no curto.

Itens removidos são apagados de `pending_questions` no DB (idempotente). Log: `[REPLAY] purga N item(s) que viraram dados de cadastro`.

### C) `index.ts` — guard anti re-ask no replay

Após `generateAIResponse`/`generateAIResponseOpenAI` retornarem `answer`, checar se a resposta contém padrão de re-pergunta de cadastro:

```
/qual (é|e) (o|seu) (melhor )?(e-?mail|nome completo|nome|telefone)|what (is|'s) your (best )?(e-?mail|full name|name|phone)|cu[áa]l es tu (mejor )?(correo|e-?mail|nombre completo|nombre|tel[eé]fono)|quel est votre (meilleur )?(e-?mail|nom complet|nom|t[eé]l[eé]phone)/i
```

Se bater, **descartar o item** (não enviar, remover da fila) e logar `[REPLAY] suppressed re-ask of cadastro field: <campo>`. Continua com o próximo.

### D) Teste Deno — `supabase/functions/whatsapp-webhook/parking_guards_test.ts`

Cobre os novos guards do `classifyOffTopic`:
- `"Gustavo Braga"` sem `lastAssistantQuestion` → `null` (não parqueia).
- `"gustavo@gmail.com"` sem pergunta → `null`.
- `"01/01/2016"` sem pergunta → `null`.
- `"Madrid"` sem pergunta → `null`.
- `"Como funciona o NIE?"` sem pergunta → ainda parqueia como `question` (caso legítimo).

### E) Deploy

Redeploy `whatsapp-webhook`.

## Fora de escopo

- Sem mudanças em UI, DB, RLS, system prompt, outras edge functions ou outros gates.
- Não altera o texto do ACK de off-topic (entregue anteriormente).

## Arquivos

- editar: `supabase/functions/whatsapp-webhook/lib/offtopic.ts` (guards A)
- editar: `supabase/functions/whatsapp-webhook/index.ts` (filtros B e C no bloco REPLAY ~linha 2754)
- criar: `supabase/functions/whatsapp-webhook/parking_guards_test.ts`
