## Diagnóstico — turno do Gustavo (lead `4f3dc442…`)

Conversa real (espanhol):

```
BOT  Cuéntame con calma: ¿qué buscas hoy? ...
USR  cuurso
BOT  (mesma pergunta de novo)            ← deveria ter avançado
USR  autorizacion de regresso
BOT  (mesma pergunta de novo)            ← deveria ter avançado
```

Logs `[GATE] step=interesse done=3/7` em todos os turnos: **`interest_confirmed` nunca foi gravado**, então o GATE/IA fica preso pedindo interesse.

A toolchain `computeDeterministicFunnelPatch` foi instalada exatamente para esse caso, mas tem dois bugs concretos:

### Bug 1 — `isQuestionAboutInterest` não casa a pergunta real em ES
`questions.ts` linha 149 procura `que busca hoy`, mas a pergunta de fato é "¿qué **buscas** hoy?" (2ª pessoa). `"que buscas hoy".includes("que busca hoy")` → false. Resultado: o ramo "se prevQ era a pergunta de interesse, qualquer resposta com ≥3 chars vira `interest_confirmed`" nunca dispara.

Mesmo problema em PT/EN/FR: o detector é `includes` literal de uma única forma verbal e quebra a qualquer variação ("o que você busca hoje", "o que procura hoje", "what brings you here", etc.).

### Bug 2 — `isPotentialInterestAnswer` é estrito demais
- `"cuurso"` (typo de "curso") → não bate em `exactTokens` nem em `includes('curso')`.
- `"autorizacion de regresso"` (grafia PT do usuário em conv. ES) → keyword cadastrada é `autorizacion de regreso` (uma s); `includes` falha.
- Outras grafias comuns: `regreso`/`regresso`, `homologação`/`homologacao`/`homologación`, `família`/`familia`.

Como nenhum dos dois caminhos grava `interest_confirmed`, o GATE recompõe a mesma pergunta e a IA repete (com paráfrase do F4, mas mesma pergunta).

## Plano

### 1. `lib/questions.ts` — `isQuestionAboutInterest` baseado em regex multi-idioma

Substituir o `includes` por uma única regex normalizada que cubra:

- PT: `que (voce )?(busca|procura|esta procurando|deseja|gostaria|quer)\s+(hoje|agora)?`, `como posso (te )?ajudar`, `qual (e )?(o )?seu interesse`.
- ES: `que (buscas|busca|estas buscando|deseas|necesitas|quieres)\s+(hoy|ahora)?`, `en que (te )?puedo ayudar`, `cual es tu interes`.
- EN: `what (are you|brings you|can i help|do you need|are you looking for)`, `how can i help`.
- FR: `que (cherchez|recherchez)[- ]vous`, `comment puis je (vous )?aider`, `quel est (votre|ton) (besoin|interet)`.

Cobre também a variante curta usada em catálogos: `nacionalidad|residencia|estudios|arraigo`.

### 2. `lib/questions.ts` — `isPotentialInterestAnswer` mais tolerante

- Acrescentar `regresso` (PT), `homologacion`, `família`, `família reagrupada`, `formación`.
- Adicionar matching tolerante a typos para um conjunto fechado de tokens-chave (`curso, arraigo, nacionalidade, residencia, nie, tie, visa, visado, homologacao, reagrupamento, regresso, regreso`): aceitar quando a palavra do usuário tem distância de Levenshtein ≤ 1 (suficiente p/ "cuurso" → "curso", "residenccia" → "residencia"). Implementação curta in-file (sem dep externa).
- Manter o restante da lógica.

### 3. `lib/overrides.ts` — fallback do interesse a partir do contexto

Em `computeDeterministicFunnelPatch`, quando `prevQ` é a pergunta de interesse (já corrigida em #1) e a mensagem do usuário tem ≥3 chars, **continuar** gravando como interesse (linha 76‑78 já faz isso). Adicionar log explícito `[DETERMINISTIC_PATCH]` com `prevQ`/`msg`/`patch` para auditoria nos próximos turnos.

### 4. Teste unitário (`wave6_test.ts` ou novo)

- `isQuestionAboutInterest("Cuéntame con calma: ¿qué buscas hoy? ...")` → `true` (ES, 2ª pessoa).
- `isQuestionAboutInterest("O que você busca hoje?")`, `("What are you looking for today?")`, `("Que recherchez-vous aujourd'hui ?")` → `true`.
- `isPotentialInterestAnswer("cuurso")` → `true`.
- `isPotentialInterestAnswer("autorizacion de regresso")` → `true`.
- `computeDeterministicFunnelPatch(botInterestQ_es, "cuurso")` → `{interest_confirmed:"cuurso"}`.

### 5. Deploy

`supabase functions deploy whatsapp-webhook` (automático). Sem migration.

## Resultado esperado

No próximo turno do Gustavo após "cuurso" / "autorizacion de regresso", o patch determinístico grava `interest_confirmed`, o GATE avança para `localizacao` ("¿Hoy ya estás en España?") e o loop atual termina.

## Arquivos

- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (apenas log)
- `supabase/functions/whatsapp-webhook/wave6_test.ts` (novos casos)