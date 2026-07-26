## Problema confirmado

Nas duas conversas (finais 0909 e 0110) o idioma muda a cada turno. Exemplos reais no banco (mesmo atendimento):

```text
Cliente: Hello              -> IA: "Hello 🙂 How are you?..."        (en)
Cliente: Roberto Barros     -> IA: "Thank you. What is the best..."  (en)
Cliente: Estudo             -> IA: "Are you already in Spain today?" (en)
Cliente: Sim                -> IA: "Perfeito. Agora preciso..."      (pt)
Cliente: nao                -> IA: "¿Hoy ya estás en España?"        (es)
```

Causa raiz (verificada em `supabase/functions/whatsapp-webhook/index.ts`, linhas 1522-1584 e 1605-1606):

1. O idioma é **re-detectado a cada mensagem recebida**. Há um bloco chamado "re-detecção precoce" que, sempre que a mensagem atual gera um sinal positivo diferente do idioma travado e a conversa tem 8 mensagens ou menos do cliente, **regrava** `contacts.preferred_language` e passa a responder no novo idioma.
2. O detector considera sinal positivo palavras curtíssimas e ambíguas: `sim`, `nao`, `no`, `yes`, `sí`, `my`, `info`. Ou seja, um simples "Sim"/"no"/"sí" de resposta ao fluxo troca o idioma da conversa inteira.
3. O motor de fluxo visual recebe esse idioma recalculado (`runVisualFlowTurn(..., detectedChatLanguage)`) e ainda sobrescreve o idioma travado do estado do fluxo (`{ ...turn.state, lang: detectedChatLanguage }`), então o lock existente em `flow_state.lang` nunca é respeitado.

## O que será feito

**1. Lock único e definitivo do idioma**
- Detectar o idioma apenas enquanto ainda não houver lock (primeira mensagem com sinal claro).
- Depois de travado (`contacts.preferred_language` ou `flow_state.lang`), o idioma **nunca** muda por causa do idioma das respostas seguintes.
- Remover completamente o bloco de "re-detecção precoce" (o re-lock por sinal positivo diferente).

**2. Precedência do lock do fluxo**
- Em cada turno, o idioma usado passa a ser: `flow_state.lang` (se existir) → `contacts.preferred_language` → detecção da mensagem atual → padrão do agente.
- Parar de sobrescrever `flow_state.lang` com o idioma recalculado; ele é gravado uma única vez, quando o fluxo inicia.

**3. Única exceção: pedido explícito do cliente**
- Se o cliente pedir explicitamente a troca ("em português", "en español", "in english", "en français"), o lock é atualizado e persistido. Nenhum outro sinal muda o idioma.

**4. Robustez da 1ª detecção**
- Ignorar como sinal de idioma mensagens muito curtas e ambíguas (`sim`, `não`, `no`, `yes`, `sí`, `ok`, `oui`) quando forem a única evidência, evitando travar o idioma errado logo no início.
- Sem sinal claro na 1ª mensagem: segue provisório no idioma padrão do agente e trava na primeira mensagem com sinal real (comportamento atual mantido).

**5. Validação**
- Testes Deno cobrindo: lock em `en` mantido após "Sim"/"nao"/"sí"; lock em `pt-BR` mantido após "yes"/"no"; troca só com pedido explícito; e o fluxo visual emitindo sempre os textos do idioma travado.
- Deploy da `whatsapp-webhook` e verificação com o sandbox nos 4 idiomas.

## Detalhes técnicos

- `supabase/functions/whatsapp-webhook/index.ts`: reescrita do bloco LANGUAGE LOCK (1522-1584) e do trecho do fluxo visual (1605-1606).
- `supabase/functions/whatsapp-webhook/lib/language.ts` / `_shared/language-detect.ts`: novo helper `detectExplicitLanguageRequest()` e filtro de tokens ambíguos curtos na detecção.
- Nenhuma alteração de schema; `contacts.preferred_language` continua sendo a fonte da verdade persistida.
- Contatos já com idioma errado gravado (ex.: 0110 travado em `en`) continuam como estão; posso corrigir esses dois registros manualmente se quiser.
