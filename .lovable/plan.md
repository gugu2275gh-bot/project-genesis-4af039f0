## Problema

Na captura, o cliente respondeu "Nomade digital" (→ `VISTO_TRABALHO`). O bot deveria confirmar e avançar para a próxima etapa (localização). Em vez disso, respondeu "Certo." e re-enviou **exatamente** as duas mensagens que já tinham sido enviadas 1 minuto antes:

1. "Me conta com calma: o que você busca hoje? …"
2. "Na CB trabalhamos com: residência (NIE/TIE), nacionalidade espanhola, arraigo … O seu caso se encaixa em algum desses?"

## Por que não foi barrado

Já existem guards (`lockConfirmedFieldsInResponse`, `forceServicesMessageAfterInterest`, F4 catalog dedup em `index.ts` linhas ~2173–2212), mas nenhum cobriu este caso específico:

- `lockConfirmedFieldsInResponse` só inspeciona a **última** pergunta (`extractLastQuestion`). A última pergunta do bot foi "O seu caso se encaixa em algum desses?", que não casa com `isQuestionAboutInterest` (regex cobre "o que voce busca", não "se encaixa em").
- `forceServicesMessageAfterInterest` é skip se `isServicesOfferedMessage(aiResponse)` retorna true (linha 470) — preserva o catálogo gerado pela IA mesmo já tendo sido enviado antes.
- F4 (dedup por similaridade) usa threshold `>= 0.7`. Como a resposta nova é a anterior **+** preâmbulo "Certo." + repetição, o denominador (`max(prev.size, current.length)`) infla e a razão fica abaixo de 0.7 → não dispara.

## Solução (somente backend, edge function `whatsapp-webhook`)

### 1. Strip de blocos canônicos já enviados (hard dedup pós-overrides)
Em `supabase/functions/whatsapp-webhook/index.ts`, antes do envio (perto da linha ~2236, depois de `stripLockedSentinel`), adicionar `stripAlreadySentCanonicalBlocks(aiResponseClean, allAssistant, detectedChatLanguage)` que:

- Divide a resposta em parágrafos (split por `\n\n` e por `|||`).
- Para cada parágrafo, normaliza (lowercase, sem acentos, sem pontuação) e descarta se:
  - For `isServicesOfferedMessage(p)` **e** o transcript já contém Msg6, **ou**
  - For uma pergunta de interesse (`isQuestionAboutInterest(p)`) **e** `interest_confirmed`, **ou**
  - Tiver similaridade Jaccard ≥ 0.8 com qualquer uma das últimas 3 mensagens do assistente (cobre cópias quase-literais).
- Junta o restante. Se sobrar só "Certo./Ok./Vale.", anexa a próxima pergunta pendente do funil (`getLocationQuestion`, `getEmailQuestion` etc. via mesma lógica de `nextPending` que já existe em `lockConfirmedFieldsInResponse`).

### 2. Reforçar `lockConfirmedFieldsInResponse`
Em `supabase/functions/whatsapp-webhook/lib/overrides.ts`:

- Em vez de só checar `extractLastQuestion`, iterar sobre todas as frases que terminam em `?` em `aiResponse`. Se qualquer uma casar com `isQuestionAboutInterest`/`isQuestionAboutEmail`/`isQuestionAboutFullName` para um campo com `flag === true`, remover essa frase e tudo que vier depois dela.
- Mantém comportamento atual quando nenhuma frase casa.

### 3. Reforçar `forceServicesMessageAfterInterest`
Mesmo arquivo: remover a guarda da linha 470 (`if (isServicesOfferedMessage(aiResponse)) return aiResponse`) **quando** o transcript já contém Msg6. Nesse caso, descartar a Msg6 da resposta (mantendo preâmbulo curto) e avançar para `getLocationQuestion`.

### 4. Testes (Deno)
Novo arquivo `supabase/functions/whatsapp-webhook/duplicate_block_strip_test.ts`:

- Cenário Gustavo: histórico contém uma Msg5+Msg6. Nova resposta = "Certo.\n\nMe conta com calma…\n\nNa CB trabalhamos com…\n\nO seu caso se encaixa em algum desses?". Após `stripAlreadySentCanonicalBlocks` + `lockConfirmedFieldsInResponse` com `interestKnown=true, locationKnown=false`: resultado contém só "Certo." + `getLocationQuestion('pt-BR')`, sem catálogo.
- Cenário sem repetição: aiResponse com Msg6 nova (sem histórico prévio) → preservada.
- `lockConfirmedFieldsInResponse` quando `interestKnown=true` e a resposta tem 2 perguntas (uma de interesse + uma final genérica): remove a de interesse.

### 5. Deploy
A função `whatsapp-webhook` redeploya automaticamente.

## Fora de escopo

- Não vou refatorar o orquestrador inteiro nem o prompt da IA.
- Não vou mexer na captura de interesse (já funciona — `extractInterestFromMessage("Nomade digital") = VISTO_TRABALHO`).
- Sem mudanças de schema.
