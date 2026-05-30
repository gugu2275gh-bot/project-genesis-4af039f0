## Problemas observados (screenshot)

1. Usuário pergunta "O que é TIE?" durante o gate de e-mail → bot respondeu "Obrigado." e re-perguntou o e-mail com "Obrigado." de novo. Deveria **apenas** dizer "Anotado — vou tratar desse ponto assim que terminarmos esse cadastro rapidíssimo." e repetir a pergunta canônica de e-mail **sem** novo "Obrigado.".
2. Resposta após "Roberto Barros" veio "Obrigado. Obrigado. Qual é o melhor e-mail…" — o gate Msg4 canônico não pegou (LLM emitiu e duplicou o "Obrigado.").
3. Resposta após "Sim" para "Você está na Espanha?" veio "Certo.\n\nPerfeito. Perfeito. Agora preciso entender…" — duplicação do "Perfeito.".

Todos os três sintomas têm a mesma raiz: o LLM está prefixando agradecimentos/aberturas curtas ("Obrigado.", "Perfeito.", "Certo.") **antes** das frases canônicas (que já começam por "Obrigado." / "Perfeito.") ou substituindo o ACK do off-topic por um "Obrigado." indevido.

## Correções

### A) `supabase/functions/whatsapp-webhook/index.ts` — novos short-circuits determinísticos

Logo após os gates Msg3/Msg4/Msg5+Msg6 existentes (~linha 2138), adicionar:

1. **Off-topic durante pré-handoff** — antes de chamar o LLM, se `parkedThisTurn` existe (já calculado mais acima) e estamos em algum gate de cadastro (nome/email/interesse/localização/data/empadronado), montar a resposta determinística:
   - bolha 1: `getOffTopicAckPhrase(detectedChatLanguage)` (já existe em `lib/offtopic.ts` — frase "Anotado…", sem "Obrigado.")
   - bolha 2: a **mesma pergunta canônica corrente** vinda de `lib/language.ts` / `CANONICAL_BY_LANG` em `overrides.ts` (askName, askEmail, interestQuestion, askLocationSpain, insideIntroPlusEntryDate, empadronado…), escolhida com base em qual flag está pendente — **sem prefixar "Obrigado.", "Perfeito." ou "Certo."**.
   - Log: `[OFFTOPIC_SHORTCIRCUIT] gate=<x> lang=<y>`.
   - Isso resolve o problema #1 (TIE) e remove a dependência do LLM nesse caminho.

2. **Robustecer gate Msg4 (askEmail)** — hoje `lastWasNameQ` exige "nome completo" no `lastAssistantMessage`. Trocar para também aceitar quando a **última mensagem do usuário** parece um nome (`isLikelyFullNameAnswer`) e `emailMissing && !nameMissing` (independente do exato texto do bot). Isso garante que após "Roberto Barros" o canônico `tt.thanksThenAskEmail` seja sempre emitido pelo gate, não pelo LLM (resolve #2).

### B) `supabase/functions/whatsapp-webhook/lib/overrides.ts` — anti-duplicação de aberturas curtas

No pipeline final de pós-processamento (já existe `stripLockedSentinel`, `stripRepeatedPreHandoff`, enforçador canônico), adicionar uma camada `stripDuplicateShortOpeners(text, language)` que:

- Em cada bolha, colapsa repetições imediatas de aberturas curtas idênticas separadas por espaço/pontuação:
  - PT: `/^(Obrigado|Perfeito|Certo|Ok|Vale)\.\s+\1\./i` → mantém só uma ocorrência.
  - ES: `/^(Gracias|Perfecto|Vale|Claro|Ok)\.\s+\1\./i`
  - EN: `/^(Thank you|Thanks|Perfect|Got it|Ok(?:ay)?)\.\s+\1\./i`
  - FR: `/^(Merci|Parfait|D[’']accord|Ok)\.\s+\1\./i`
- Quando duas bolhas consecutivas iniciam pela mesma abertura curta (ex.: bolha A = "Certo.", bolha B = "Perfeito. Perfeito. Agora…"), também colapsa o duplo "Perfeito." dentro da bolha B.
- Executa **depois** de todos os enforcers canônicos e **antes** do envio.
- Resolve o sintoma #3 (e funciona como rede de segurança para #2 caso o LLM ainda escape).

### C) Prompt do sistema (mesmo arquivo `index.ts`)

Reforçar regra no system prompt logo após a diretiva de "Msg4" (~linha 1311 e 1831): adicionar literal:
> "PROIBIDO prefixar a frase canônica com 'Obrigado.', 'Perfeito.', 'Certo.' ou outra abertura curta — a frase canônica JÁ contém a abertura. NUNCA repita a mesma palavra de abertura duas vezes seguidas."

E no bloco de off-topic (linha ~2050): trocar `getOffTopicAckPhrase` para ser a **única** frase de abertura permitida; proibir explicitamente "Obrigado." no ACK.

### D) Testes Deno

Novo arquivo `supabase/functions/whatsapp-webhook/dup_opener_strip_test.ts`:
- "Obrigado. Obrigado. Qual é o melhor e-mail…" → "Obrigado. Qual é o melhor e-mail…"
- "Certo.|||Perfeito. Perfeito. Agora preciso…" → "Certo.|||Perfeito. Agora preciso…"
- ES "Gracias. Gracias. ¿Cuál es…" → "Gracias. ¿Cuál es…"
- EN "Thank you. Thank you. What is…" → "Thank you. What is…"
- Não-duplicações ("Perfeito. Obrigado.") passam intactas.

Novo arquivo `offtopic_shortcircuit_test.ts`:
- Em cada idioma, com gate de e-mail ativo e pergunta off-topic ("O que é TIE?"), o construtor da resposta determinística retorna exatamente `<ackPhrase>|||<askEmail canônico>`, sem "Obrigado." em nenhuma das bolhas.

### E) Deploy

Redeploy `whatsapp-webhook` após aplicar as mudanças.

## Arquivos a editar / criar

- editar: `supabase/functions/whatsapp-webhook/index.ts` (novos gates + reforço de prompt)
- editar: `supabase/functions/whatsapp-webhook/lib/overrides.ts` (nova função `stripDuplicateShortOpeners` no pipeline final)
- criar: `supabase/functions/whatsapp-webhook/dup_opener_strip_test.ts`
- criar: `supabase/functions/whatsapp-webhook/offtopic_shortcircuit_test.ts`

Nenhuma alteração de DB, RLS, schema ou UI. Apenas lógica do webhook.
