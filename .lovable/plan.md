## Objetivo

No simulador (Testar agente), o fluxo hoje roda sempre no `default_language` do agente. Deve passar a detectar o idioma da **primeira resposta do cliente** (logo após a saudação/etapa de INÍCIO) e seguir todo o restante do fluxo nesse idioma.

## Comportamento proposto

1. Turno 1 (saudação): sem mensagem do cliente ainda → usa `default_language` do agente.
2. Turno 2 (primeira resposta real do cliente): roda a detecção de idioma sobre o texto. Se identificar pt-BR / es / en / fr, grava o resultado em `flow_state.lang`.
3. Turnos seguintes: sempre usa `flow_state.lang` já travado — não re-detecta, evitando trocas de idioma no meio do fluxo por palavras ambíguas.
4. Se a detecção não for conclusiva na primeira resposta, mantém `default_language` e tenta de novo na resposta seguinte (até travar).
5. O idioma travado também é usado quando o fluxo termina e o simulador cai no modo livre com o LLM (diretiva de idioma no prompt), para não voltar ao português.
6. A resposta da API do sandbox passa a devolver `flow.lang`, e o painel de teste mostra um badge com o idioma detectado (PT-BR / ES / EN / FR).

## Detalhes técnicos

- Reaproveitar `detectChatLanguageOrNull` de `supabase/functions/whatsapp-webhook/lib/language.ts` movendo/expondo-a para uso compartilhado (cópia leve em `_shared/` para não acoplar o sandbox ao webhook), mantendo os mesmos padrões já testados dos 4 idiomas.
- Em `supabase/functions/ai-agent-sandbox/index.ts`: substituir `const lang = String(config.default_language || 'pt-BR')` por resolução via `flowState.lang ?? detect(message) ?? default_language`, e persistir `lang` dentro de `flow_state` no mesmo `update` já existente da sessão.
- `flow-engine.ts` não muda: já recebe `lang` como parâmetro e faz fallback por `messagesOf`/`reaskOf` quando a etapa não tem tradução naquele idioma.
- Fallback de conteúdo: se a etapa não tiver texto no idioma detectado, o engine já cai para `pt-BR` — isso continua valendo (é um sinal de tradução faltando na etapa, não erro de runtime).
- Testes Deno novos em `supabase/functions/ai-agent-sandbox/`: detecção na 1ª resposta em es/en/fr/pt, travamento nos turnos seguintes e fallback quando a detecção é inconclusiva.

## Fora de escopo

Não altera o comportamento de idioma do WhatsApp em produção (`whatsapp-webhook`), que já tem sua própria lógica de detecção e travamento.
