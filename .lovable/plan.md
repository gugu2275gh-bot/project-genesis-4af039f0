# Retomada rápida do fluxo em respostas não previstas

Hoje, quando o cliente responde algo fora do esperado (uma pergunta, um desabafo, um formato diferente), o agente reformula a pergunta até 2–3 vezes em turnos separados e, se o envio for descartado pela deduplicação, o cliente fica sem resposta até o watchdog agir — o que só acontece 90 segundos depois. A sensação é de travamento.

## O que muda

### 1. Responde e volta na hora (mesma mensagem)
Quando a resposta do cliente não é a esperada mas é uma pergunta ou comentário fora do tema, o agente passa a montar UMA única resposta com duas partes:

1. resposta curta (2–3 frases) buscada na base de conhecimento;
2. a pergunta da etapa, reformulada, logo em seguida.

O fluxo nunca sai da etapa e nunca gasta um turno só para reperguntar. Se a base não tiver resposta, o agente reconhece a mensagem em uma frase e repete a pergunta na mesma bolha.

### 2. Uma tentativa, depois segue
- Padrão de reperguntas por etapa cai de 2 para 1.
- Esgotada a tentativa: se houver etapa de fallback, desvia; se a etapa for opcional, grava vazio e avança; se for obrigatória, encaminha ao especialista. Nunca repete a mesma pergunta uma terceira vez.
- Respostas aproximadas (mês/ano em datas, cidade escrita diferente) passam a ser aceitas já na primeira falha, e não só depois de insistir.

### 3. Recuperação em ~20 segundos
O watchdog passa a considerar uma conversa travada após 20 segundos sem resposta (hoje 90s) e roda em janelas curtas dentro do mesmo minuto, para que a recuperação real aconteça em torno de 20–30 segundos. Proteções contra resposta duplicada continuam: o reenvio só ocorre se nada tiver sido efetivamente entregue no turno.

### 4. Menos espera dentro do turno
- A validação na base de conhecimento e a frase humanizada gerada pela IA passam a rodar em paralelo (e com limite de tempo), em vez de uma depois da outra.
- Se qualquer uma delas demorar demais, o agente segue com o texto configurado na etapa em vez de esperar.

## Onde isso aparece na configuração

Na aba "Resposta diferente do esperado" de cada etapa, o padrão passa a ser "responder e retomar" com 1 tentativa. As opções atuais (insistir, aceitar aproximado, pular, encaminhar) continuam disponíveis por etapa para quem quiser um comportamento diferente.

## Detalhes técnicos

- `supabase/functions/_shared/flow-engine.ts`: padrão de `attempts` das regras de desvio para 1 e de `max_reasks` para 1; aceitar valor aproximado já na primeira falha; nova saída `answer_and_reask` que devolve resposta + pergunta em uma única mensagem.
- `supabase/functions/_shared/flow-turn.ts`: quando o desvio é classificado como pergunta/off-topic, buscar na base (`kb-search.ts`) e compor a bolha única; executar checagem de base e frase humanizada com `Promise.allSettled` e timeout curto, com fallback para o texto da etapa.
- `supabase/functions/whatsapp-webhook/index.ts`: já reenvia variação quando a dedup descarta; passa a registrar o turno como `NO_REPLY` imediatamente para o watchdog não esperar o ciclo completo.
- `supabase/functions/whatsapp-stall-watchdog/index.ts`: `STALL_THRESHOLD_SECONDS` de 90 para 20; a função varre em ciclos curtos dentro da execução para cobrir o intervalo do cron de 1 minuto.
- Testes: casos novos em `_shared/flow_turn_test.ts` e `ai-agent-sandbox/unexpected-answer_test.ts` cobrindo "pergunta fora do tema volta com a etapa na mesma mensagem", "1 tentativa e avança" e "aproximado aceito na primeira falha".
