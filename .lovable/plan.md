# Ajuste: catálogo de serviços sem duplicidade de pergunta

## Problema
A mensagem do catálogo termina com "¿Tu caso encaja en alguno de estos?" (e equivalentes PT/EN/FR), o que gera uma segunda pergunta redundante além da pergunta principal "¿qué buscas hoy?". Além disso, o gate atual considera a etapa de interesse concluída apenas porque a pergunta e o catálogo foram enviados — mesmo sem termos capturado de fato o `interest_confirmed`. Isso causa repetição de perguntas mais adiante.

## Mudanças

### 1. `supabase/functions/whatsapp-webhook/lib/questions.ts` — `getServicesOfferedMessage`
Remover a última linha (e o `\n\n` que a antecede) em todos os 4 idiomas, mantendo apenas a frase do catálogo. Resultados finais:

- ES: `En CB trabajamos con: residencia (NIE/TIE), nacionalidad española, arraigo (social, laboral, familiar, formación), reagrupación familiar, homologación de títulos y autorización de regreso.`
- PT: `Na CB trabalhamos com: residência (NIE/TIE), nacionalidade espanhola, arraigo (social, laboral, familiar, formação), reagrupamento familiar, homologação de diploma e autorização de regresso.`
- EN: equivalente sem `Does your case fit any of these?`
- FR: equivalente sem `Votre cas correspond-il à l'un d'eux ?`

`isServicesOfferedMessage` continua válido (âncoras `arraigo` + `reagrupa` + `homologa`).

### 2. `supabase/functions/whatsapp-webhook/index.ts` (linha 1737) — Gate de interesse
Trocar:
```ts
const interesseDone = !serviceMissing || (interesseAsked && catalogSent)
```
por:
```ts
const interesseDone = !serviceMissing
```

Assim, a etapa "INTERESSE / SERVIÇO" só é marcada como concluída quando temos de fato um `interest_confirmed` válido no lead (gravado por `extractInterestFromMessage` / `computeDeterministicFunnelPatch`). Enquanto não houver interesse capturado, o fluxo continua na etapa de interesse e não avança para localização — eliminando a repetição posterior.

### 3. Dedup em `lib/overrides.ts` (linha 391)
A regex `(se encaixa em algum|encaja en alguno|...)` continua útil caso a IA reintroduza a frase removida. Manter como está (defensivo).

### 4. Testes
Atualizar `supabase/functions/whatsapp-webhook/compound_message_test.ts`:
- A constante `CATALOG_Q_ES` precisa refletir o novo texto (sem `¿Tu caso encaja...?`). O teste `'compound: extrai RESIDENCIA do compound ES...'` continua válido porque `computeDeterministicFunnelPatch` detecta a keyword `RESIDENCIA` independente da pergunta canônica.

Rodar `supabase--test_edge_functions` nos arquivos `whatsapp-webhook` após as edições.

### 5. Deploy
Redeploy de `whatsapp-webhook`.

## Resultado esperado
- O cliente recebe apenas a pergunta principal (Msg5) + o catálogo informativo (Msg6), sem segunda pergunta redundante.
- O bot só avança da etapa de interesse depois que um `service_interest` válido for capturado no lead, garantindo 100% de determinismo e eliminando as repetições subsequentes.
