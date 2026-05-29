Diagnóstico do que aconteceu:

- Cliente respondeu “Sí, ya tengo 2 anos en Espana y quiero solicitar mi residencia”.
- O sistema capturou corretamente o serviço (residência) e fez a próxima pergunta do fluxo: “¿Estás en España?”.
- Cliente respondeu “Sí”. O sistema deveria gravar `location_known = spain` e avançar para a próxima pergunta (data de entrada), mas ele repetiu “¿Estás en España?”.
- Causa raiz: a detecção da resposta de localização depende de identificar a pergunta anterior do bot. A função que extrai a “última pergunta” (`extractLastQuestion`) usa um regex que casa apenas até o `?` final. Em espanhol o bot mandou apenas “¿Estás en España?”, com a abertura `¿`. O regex pega o trecho mas, em conjunto com `isQuestionAboutLocationSpain` e `classifyYesNo`, o caminho que grava `location_known` exige que a pergunta esteja na última mensagem do assistente analisada pelo bloco “locationAnswer”. Esse bloco busca a pergunta com um regex restrito que NÃO casa a forma curta “¿Estás en España?” isolada (só casa quando há “hoje você já está…”, “ya estás…”, etc.). Resultado: `userInSpain` ficou false, `funnelStateLive.location_known` ficou nulo, e o gate repetiu a mesma pergunta canônica.

Premissas confirmadas com você:

- Manter o fluxo completo: a pergunta “¿Estás en España?” deve continuar sendo feita.
- Na primeira resposta do cliente sobre interesse, considerar apenas o serviço e ignorar qualquer outra informação embutida (inclusive localização).
- O problema a corrigir é apenas a repetição da pergunta de localização após o cliente responder “Sí/No”.

Plano de correção (apenas o webhook, sem mudar o fluxo):

1. `lib/overrides.ts` — `computeDeterministicFunnelPatch`:
   - Remover os blocos que inferem `location_known = 'spain'` a partir de pistas embutidas na resposta de interesse (“ya tengo X años en España”, “estoy en España”, etc.). A localização só deve ser gravada como resposta direta à pergunta “¿Estás en España?”.
   - Manter a captura de `interest_confirmed` (serviço) normalmente.

2. `lib/questions.ts` — `isQuestionAboutLocationSpain`:
   - Ampliar o detector para reconhecer a forma curta canônica em todos os idiomas: “¿Estás en España?”, “Você está na Espanha?”, “Are you in Spain?”, “Êtes-vous en Espagne ?”, com ou sem `¿`/`?`. Hoje ele falha quando a pergunta vem isolada e curta.

3. `index.ts` — bloco que calcula `locationAnswer` (varredura do histórico):
   - Trocar o regex local `locQuestionRe` por uma chamada a `isQuestionAboutLocationSpain` em cada mensagem do assistente, garantindo que a forma curta seja reconhecida.
   - Assim, quando o cliente responde “Sí” logo após “¿Estás en España?”, `classifyYesNo` é aplicado, `userInSpain = true`, e `location_known` é persistido como `spain`.

4. `index.ts` — reforço de persistência turn-a-turn:
   - Mesmo que o passo 3 falhe, se `lastAssistantQuestion` for reconhecida por `isQuestionAboutLocationSpain` e `classifyYesNo(rawCustomerMessage)` retornar `yes` ou `no`, gravar imediatamente `location_known` (`spain`/`outside`) no `lead_funnel_state` antes de calcular `nextStep`. Isso garante avanço determinístico mesmo sob histórico truncado.

5. Testes Deno cobrindo o caso real do print:
   - Mensagem anterior do bot: “¿Estás en España?”. Mensagem do cliente: “Sí”. Esperado: `location_known = 'spain'` e próxima pergunta é a data de entrada, não repetir localização.
   - Caso espelho com “No” → `location_known = 'outside'`, próxima pergunta é a do bloco fora da Espanha.
   - Caso interesse composto (“Sí, ya tengo 2 años en España y quiero solicitar mi residencia”): só `service_interest` é gravado; `location_known` permanece nulo; próxima pergunta continua sendo “¿Estás en España?”.

6. Redeploy do `whatsapp-webhook` após os testes passarem.

Resultado esperado:

- O fluxo continua intacto: o bot sempre pergunta “¿Estás en España?”.
- A primeira resposta do cliente sobre serviço grava apenas o serviço.
- Quando o cliente responder “Sí/No” à pergunta de localização, o bot grava a localização e avança para a próxima pergunta — sem repetir “¿Estás en España?”.