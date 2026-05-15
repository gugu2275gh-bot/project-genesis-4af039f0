# Pré-handoff determinístico: perguntas literais do fluxo (sem invenção)

## Problema

Screenshot mostra: cliente está FORA da Espanha, já respondeu A1–A5, e o bot enviou **"Perfeito. Agora preciso entender como está sua situação aqui."** (intro B1 do bloco IN-Spain) antes de perguntar A6 (formação superior). Esse intro foi **inventado pelo LLM** — viola o BPMN.

Hoje o gate (`collectionGateActive` em `index.ts`) monta uma instrução forte para o LLM mas **deixa o LLM escrever a resposta**. Os helpers determinísticos (`getOutsideSpainNextQuestion`, `getEmpadronadoQuestion`, etc.) já existem mas são usados só como anti-loop, não como fonte primária.

Pedido do usuário: durante todo o pré-handoff, a pergunta deve sair **literal dos helpers canônicos**, zero criatividade do LLM.

## Implementação

### 1. `lib/questions.ts` — novo dispatcher inside-Spain

`getInsideSpainNextQuestion(language, transcript, { entryDateConfirmed, empadronadoConfirmed, empadronadoCity, empadronadoSinceConfirmed, b1IntroSent })`:
- B1 intro (`insideIntro` de `getPromptTemplates`) só se `!b1IntroSent`.
- B2: `Qual foi a data exata da sua entrada na Espanha?` (literal por idioma).
- B3: `getEmpadronadoQuestion(lang)`.
- B4: `getEmpadronamientoSinceQuestion(lang)` — só quando empadronado === true.
- B5: `getEmpadronamientoCityQuestion(lang)`.
- Senão: `buildPreHandoffPayload(...)`.

### 2. `lib/questions.ts` — dispatcher único

`getNextScriptedQuestion(stepKey, language, blockFlags, ctx)` retorna a próxima pergunta literal:
- `abertura` → `openingLine1|||openingLine2`
- `nome` → `t.askName`
- `email` → `t.thanksThenAskEmail`
- `interesse` → `t.interestQuestion` (+ `|||getServicesOfferedMessage` se ainda não enviado)
- `localizacao` → `t.askLocationSpain`
- `aprofundamento` → `getInsideSpainNextQuestion` se `userInSpain`; `getOutsideSpainNextQuestion` se `userOutsideSpain`; senão `''`.
- `preHandoff` → `buildPreHandoffPayload(...)`.

### 3. `lib/questions.ts` — ack curto localizado

`getShortAck(language, prevQuestion, currentMessage)`:
- "Certo." / "Perfecto." / "Got it." / "D'accord." para sim/não.
- "Obrigado." / "Gracias." / "Thank you." / "Merci." após nome/email/texto livre.
- `''` na abertura ou quando não há pergunta anterior.

### 4. `index.ts` — emissão determinística no gate

Dentro do branch `if (collectionGateActive && nextStep)`, **após** todos os overrides existentes:

```ts
if (!isLocked(aiResponse)) {
  const scripted = getNextScriptedQuestion(nextStep.key, detectedChatLanguage, blockFlags, {
    userInSpain, userOutsideSpain, allAssistant
  })
  if (scripted) {
    const ack = parkedThisTurn
      ? getOffTopicAckPhrase(detectedChatLanguage)
      : getShortAck(detectedChatLanguage, lastAssistantQuestion, rawCustomerMessage)
    aiResponse = lock(ack ? `${ack}\n\n${scripted}` : scripted)
  }
}
```

- `isLocked` preserva reasks já travados (Spain ambíguo, nome, email).
- `lock(...)` evita rewriters downstream.
- Off-topic parking continua: ack vira a frase de "como prometido…" e a pergunta canônica vai junto.

### 5. Garantias estruturais

- B1 intro nunca vaza no bloco fora — só `getInsideSpainNextQuestion` o emite. Bug do screenshot fica estruturalmente impossível.
- Pré-handoff (H1|||H2|||H3) continua idempotente via `buildPreHandoffPayload`.
- Aberturas / Msg5+Msg6 entregues como bolhas múltiplas via "|||" (BPMN v2).

### 6. Testes — novo `scripted_dispatch_test.ts`

- Outside no estágio A6 → retorna `Você possui formação superior?` **sem** `insideIntro`.
- Outside no estágio A2 → retorna `Entendido. Então seguimos pelo seu cenário fora da Espanha.\n\nQual sua idade?`.
- Inside primeiro turno do bloco B → retorna `insideIntro\n\nQual foi a data exata da sua entrada na Espanha?`.
- Inside segundo turno → drop do intro (só B3).
- Inside B5 → retorna `getEmpadronamientoCityQuestion`.
- Ambos blocos completos → `H1|||H2|||H3`.
- `getShortAck`: "Certo." para "Não" (pt), "Perfecto." para "Sí" (es), "Got it." (en), "D'accord." (fr).
- Passthrough: quando `aiResponse` já travado, dispatcher não sobrescreve.

Após implementação: `supabase--test_edge_functions { functions: ["whatsapp-webhook"] }` e validar que os ~175 testes existentes continuam passando.

## Arquivos tocados

- `supabase/functions/whatsapp-webhook/lib/questions.ts` — `getInsideSpainNextQuestion`, `getNextScriptedQuestion`, `getShortAck`.
- `supabase/functions/whatsapp-webhook/index.ts` — passe determinístico final no gate; importa novos helpers.
- `supabase/functions/whatsapp-webhook/scripted_dispatch_test.ts` — novo.

Sem migração de DB. Sem mudanças no frontend.
