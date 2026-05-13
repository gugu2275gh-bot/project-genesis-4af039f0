
# Plano: alinhar pré-handoff ao diagrama Bizagi (4 divergências)

Aplicar correções determinísticas em `supabase/functions/whatsapp-webhook/lib/` preservando:
- Validação de cidade espanhola (B5)
- Lock de blocos (`forceCorrectBlockForLocation`)
- Multi-idioma PT/ES/EN/FR
- Lock de campos confirmados (`lockConfirmedFieldsInResponse`)
- Detecção de data futura, reprompts existentes

## D1 — Inserir "Msg 6: serviços atendidos" entre interesse e localização

**Arquivo:** `lib/overrides.ts` + `lib/questions.ts`

- Nova função em `questions.ts`: `getServicesOfferedMessage(language)` retornando texto multi-idioma curto listando categorias (residência/NIE/TIE, nacionalidade, arraigo, reagrupamento familiar, homologação, autorização de regresso) e perguntando "faz sentido para o seu caso?".
- Novo flag de estado: `services_acknowledged` (boolean) salvo em funnel-state junto com `interest_confirmed`.
- Novo override em `overrides.ts`: `forceServicesMessageAfterInterest`
  - Dispara quando `interest_confirmed = true` E `services_acknowledged != true` E última msg do bot não foi a de serviços.
  - Substitui a resposta do LLM por `getServicesOfferedMessage`.
- Ajustar `forceAdvanceFromInterestQuestion`: só avança para `getLocationQuestion` quando `services_acknowledged = true` (qualquer resposta curta afirmativa OU qualquer mensagem do cliente após Msg 6 marca como acknowledged — não bloqueia o fluxo).
- Detector `isQuestionAboutServicesOffered(question)` para reconhecer a Msg 6 no transcript (evita repetir).

## D2 — Separar A1/B1 ("confirmar cenário/situação") de A2/B2

**Arquivo:** `lib/questions.ts` + `lib/overrides.ts`

- Quebrar mensagens fundidas em duas frases entregues no mesmo turno separadas por `\n\n` (mantém 1 turno só, mas visualmente são 2 blocos — preserva UX e evita +1 round-trip):
  - A1+A2: "Entendido. Então seguimos pelo seu cenário fora da Espanha.\n\nQual sua idade?"
  - B1+B2: "Perfeito. Agora preciso entender melhor sua situação aqui na Espanha.\n\nQual foi a data exata da sua entrada?"
- Aplicar em todos os 4 idiomas em `getOutsideSpainAgeQuestion` e na string usada por `forceAdvanceFromLocationQuestion` (bloco B).

## D3 — Pré-handoff em 2 mensagens (H1-H2 + H3-H4)

**Arquivo:** `lib/questions.ts` + `lib/overrides.ts` (ou `index.ts` no ponto de envio)

- Renomear/dividir o texto atual de pré-handoff em duas funções multi-idioma:
  - `getPreHandoffSummaryMessage(language)` — H1-H2 atual ("Perfeito. Já consigo ter uma visão inicial... Na CB analisamos cada caso de forma individual...").
  - `getHandoffTransferMessage(language)` — H3-H4 nova ("Vou te encaminhar agora para um especialista da CB. Em breve uma pessoa do nosso time vai assumir essa conversa para te orientar com detalhes do seu caso.").
- No ponto onde o pré-handoff é disparado (override de fechamento do funil):
  - Enviar H1-H2 e em seguida H3-H4 como **duas mensagens WhatsApp separadas** (dois `sendWhatsAppMessage` consecutivos com pequeno delay opcional via `await`), antes de acionar a auto-pausa do AI.
- Garantir idempotência: flags `pre_handoff_summary_sent` e `pre_handoff_transfer_sent` em funnel-state para não reenviar se o webhook reentrar.

## D4 — Mensagem determinística de "encaminhar para especialista"

Coberto pelo `getHandoffTransferMessage` de D3. Adicional:
- Logar no histórico de interações `origem: SISTEMA` com tipo `HANDOFF_HUMANO` (mantém padrão de SLA Integration).
- A auto-pausa do AI (já existente — memory: AI Resilience) só é acionada **após** confirmação de envio das duas mensagens.

## Preservação de regras existentes (não tocar)

- `validateSpanishCity` + reprompt de B5 — mantido.
- `forceCorrectBlockForLocation` — continua bloqueando mistura A/B; novos overrides D1/D3 rodam DEPOIS dessa trava.
- `lockConfirmedFieldsInResponse` — aplicado também sobre os textos novos (D1/D3 não contêm campos do cliente, então é no-op seguro).
- Detecção de data futura em B2 — intacta.
- Multi-idioma PT/ES/EN/FR — todas as novas strings cobrem os 4 idiomas seguindo o padrão de `getOutsideSpainAgeQuestion`.
- `parseEntryDateFromText`, `looksLikeIncompleteEntryDateWithoutYear`, etc. — intactos.

## Testes

Adicionar `wave7_test.ts` em `supabase/functions/whatsapp-webhook/`:
- D1: após `interest_confirmed`, próxima resposta do bot é Msg 6; após cliente responder qualquer coisa, vem `getLocationQuestion`.
- D1: Msg 6 não é repetida se já enviada.
- D2: A2 contém `\n\n` separando confirmação e pergunta de idade (PT/ES/EN/FR).
- D3: ao fechar funil, são enviadas 2 mensagens (mock conta `sendWhatsAppMessage` chamado 2×).
- D3: reentrada do webhook não duplica mensagens (flags idempotentes).
- Regressão: `wave5_test.ts` e `wave6_test.ts` continuam passando.

## Ordem de execução

1. `lib/questions.ts` — adicionar funções novas e quebrar A2/B2 com `\n\n`.
2. `lib/funnel-state.ts` — adicionar flags `services_acknowledged`, `pre_handoff_summary_sent`, `pre_handoff_transfer_sent`.
3. `lib/overrides.ts` — `forceServicesMessageAfterInterest` + ajuste em `forceAdvanceFromInterestQuestion`.
4. `index.ts` — split do envio do pré-handoff em 2 mensagens com guards idempotentes.
5. `wave7_test.ts` — cobertura.
6. `supabase--test_edge_functions` em `whatsapp-webhook` para validar tudo verde.

## Detalhes técnicos

- Nenhum schema novo no Postgres — flags ficam dentro do JSON `funnel_state` já persistido.
- Sem migrations.
- Sem mudança de prompts do LLM — tudo determinístico via overrides.
- Sem mudança no contrato do webhook nem nas chamadas Twilio (só +1 chamada extra no momento do handoff).
