## Diagnóstico (logs do turno do Roberto)

Mensagem do cliente: `"O que és TIE?"` (durante etapa `email`, após o bot perguntar o e-mail).

Linha do tempo nos logs do `whatsapp-webhook`:

1. `[INTEREST_CAPTURE] "O que és TIE?" -> RESIDENCIA_PARENTE_COMUNITARIO` → o `extractInterestFromMessage` casou a substring **TIE** com a keyword de "Residencia Parente Comunitario" e marcou `interest_confirmed=true`.
2. `[FUNNEL_STATE] synced ... interest_confirmed=RESIDENCIA_PARENTE_COMUNITARIO -> step: email`.
3. `[DETERMINISTIC_PATCH] ... patch: { interest_confirmed: 'RESIDENCIA_PARENTE_COMUNITARIO' }` reforçou.
4. `[CANONICAL_SHORTCIRCUIT] msg4 askEmail em es` e `[GATE-HARD-LOCK] step=email replacing AI output with canonical script` → bot voltou a pedir o e-mail, **sem** a frase de off-topic prometida.

Não houve `[PARK]` nem `[OFFTOPIC_SHORTCIRCUIT]`. Causa raiz dupla:

**(A)** `classifyOffTopic` em `lib/offtopic.ts` tem o curto-circuito  
`if (isPotentialInterestAnswer(raw) || LOCATION_IN_SPAIN_HINT_RE.test(raw)) return null`  
**antes** de checar `QUESTION_HINT_RE`. Como "TIE" bate como serviço, a pergunta nunca é parqueada.

**(B)** No `index.ts` (~linha 1628), o bloco `INTEREST_CAPTURE` chama `extractInterestFromMessage(rawCustomerMessage)` sem filtrar perguntas factuais. Mesmo que (A) seja corrigido, "O que é TIE?" ainda escreve `interest_confirmed=true` no lead e dispara o `syncFunnelFromCapturedData` → avança o gate.

## Mudanças

### 1) `supabase/functions/whatsapp-webhook/lib/offtopic.ts`

Inverter a ordem no `classifyOffTopic` para que perguntas/pedidos explícitos tenham precedência sobre o atalho de interesse/localização. Acrescentar um detector específico de "pergunta factual de definição" (`o que é/qué es/what is/qu'est-ce que`) que **sempre** classifica como `question`, mesmo que a frase contenha keyword de serviço.

```ts
const DEFINITION_QUESTION_RE = /\b(o que (é|e|sao|são)|qu[eé] (es|son)|what (is|are)|qu['’]?est[- ]ce que|c['’]?est quoi)\b/i

// ... dentro do classifyOffTopic, ANTES do bloco
//   if (isPotentialInterestAnswer(raw) || LOCATION_IN_SPAIN_HINT_RE.test(raw)) return null
if (DEFINITION_QUESTION_RE.test(raw) || /\?\s*$/.test(raw.trim())) {
  // pergunta factual real — não é resposta de interesse
  if (QUESTION_HINT_RE.test(raw) || /\?/.test(raw)) return { kind: 'question' }
}
```

Manter os demais guards (nome, e-mail, data, cidade) como estão.

### 2) `supabase/functions/whatsapp-webhook/index.ts` — bloquear INTEREST_CAPTURE em perguntas

No bloco `try { if (serviceMissing && rawCustomerMessage) { ... extractInterestFromMessage ... } }` (linhas ~1627-1642), adicionar guarda antes de chamar o extractor:

```ts
const looksLikeFactualQuestion =
  /\?\s*$/.test(rawCustomerMessage.trim()) ||
  /\b(o que (é|e|sao|são)|qu[eé] (es|son)|what (is|are)|qu['’]?est[- ]ce que|c['’]?est quoi|como funciona|c[óo]mo funciona|how does|comment fonctionne|quanto custa|cu[áa]nto cuesta|how much|combien)\b/i.test(rawCustomerMessage)

if (serviceMissing && rawCustomerMessage && !looksLikeFactualQuestion) {
  const detectedInterest = extractInterestFromMessage(rawCustomerMessage)
  // ... resto igual
}
```

Mesmo padrão deve ser aplicado ao `[DETERMINISTIC_PATCH]` que está mais abaixo (procurar onde ele computa `interest_confirmed` a partir de `rawCustomerMessage` e aplicar o mesmo `looksLikeFactualQuestion` guard) — caso contrário a patch sobrescreve novamente.

Resultado esperado: para `"O que és TIE?"` durante o pré-handoff,
- `INTEREST_CAPTURE` é pulado, `serviceMissing` continua `true`;
- `classifyOffTopic` retorna `{ kind: 'question' }` → `[PARK]` enfileira;
- bloco `OFFTOPIC_SHORTCIRCUIT` produz `ACK off-topic ||| próxima pergunta canônica` (askEmail em ES);
- o cliente vê: *"Por favor, terminemos primero el registro básico. A continuación podemos tratar otros temas."* + reiteração da pergunta de e-mail.

### 3) Testes

- Atualizar `offtopic_park_replay_test.ts` (ou criar novo `offtopic_definition_question_test.ts`) cobrindo:
  - `classifyOffTopic("O que é TIE?", "Qual seu melhor e-mail?", { collectionGateActive: true })` → `{ kind: 'question' }`
  - `classifyOffTopic("¿Qué es el NIE?", ...)` → `question`
  - `classifyOffTopic("What is TIE?", ...)` → `question`
  - `classifyOffTopic("Qu'est-ce que le TIE?", ...)` → `question`
  - Continuar retornando `null` para `"Residencia"`, `"Nacionalidade"`, etc. (sem `?` e sem definition prefix).

- Novo teste de unidade (em arquivo já existente do whatsapp-webhook) validando que `extractInterestFromMessage("O que é TIE?")` **pode** retornar uma keyword, mas o guard em `index.ts` impede a captura — alternativamente, fazer o guard dentro do próprio `extractInterestFromMessage` retornando `null` quando `looksLikeFactualQuestion` for `true`.

### 4) Deploy

Redeploy de `whatsapp-webhook` e validação rápida via `supabase--curl_edge_functions` simulando um webhook com `Body=O que és TIE?`.

## Fora do escopo

- Nenhuma mudança em `lib/overrides.ts`, system prompt, RLS, DB, UI ou outras edge functions.
- A frase de off-topic em si já está correta nas 4 línguas (mudança anterior).
