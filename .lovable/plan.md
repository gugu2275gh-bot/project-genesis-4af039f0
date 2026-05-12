# Diagnóstico (caso Roberto Barros — lead 49a59bf3)

Confirmei no banco e nos logs de mensagens:

- **20:39–20:47** Cadastro completo: nome, e-mail, interesse ("Nacionalidade"), localização ("Estou no Brasil"), bloco A (idade, Europa, familiar, remoto, formação) e Pré-Handoff (H1+H2) já enviados.
- **20:47:56** Cliente perguntou: "Como tiro visto pra viajar pra Espanha".
- **20:48:12** Bot: "Ótima pergunta…" + reabriu INTERESSE ("Me conta com calma…").
- **20:49:58** Cliente: "Estudos".
- **20:50:14** Bot reenviou o catálogo genérico, sem KB.

Estado real no banco:
```
leads.service_interest        = 'SEM_SERVICO'
leads.interest_confirmed      = false
lead_funnel_state.interest_confirmed = null
lead_funnel_state.step        = 'interesse'
```

**Causa raiz:** quando o cliente respondeu "Nacionalidade" às 20:41:45, o webhook **não persistiu o interesse** em `leads` nem no `lead_funnel_state`. Como `serviceMissing` continuou `true`, a Wave 6 `lockConfirmedFieldsInResponse` interpretou que ainda havia etapa pendente e **sobrescreveu qualquer resposta da IA pela pergunta de interesse**, mesmo após o Pré-Handoff. Resultado: a KB nunca foi acionada ("flowComplete" só é `true` quando todas as etapas estão `done`, mas o lock pós-IA também depende dos mesmos flags e degrada o turno mesmo quando o gate libera).

A regra do usuário continua válida: **durante o cadastro NÃO consultar KB; após o cadastro, consultar SEMPRE**. O bug é a perda de captura do interesse, que mantém o cadastro "eternamente aberto".

# Plano de correção

## 1. Capturar interesse a partir de respostas livres do cliente
Em `lib/extract.ts` (ou novo helper `extractInterestFromMessage`), mapear deterministicamente palavras-chave da resposta do cliente para `service_interest`:
- `nacionalidade` → `NACIONALIDADE`
- `estudo`, `estudos`, `homologa` → `ESTUDOS`
- `residência`, `residencia`, `arraigo` → `RESIDENCIA`
- `nômade`, `nomade`, `digital` → `NOMADE_DIGITAL`
- `nie`, `tie`, `antecedentes`, `reagrupa` → respectivos enums
- fallback: se a resposta vier logo após a pergunta INTERESSE e tiver ≤ 3 palavras, salvar a string crua em `service_interest` (uppercase, sem acento).

Aplicar imediatamente após detectar resposta à etapa INTERESSE no `index.ts` (logo antes do bloco do gate, ~linha 1539):
```ts
if (lastAssistantQuestion && /me conta com calma|cuéntame con calma/i.test(lastAssistantQuestion) && rawCustomerMessage) {
  const detected = extractInterestFromMessage(rawCustomerMessage)
  if (detected) {
    await supabase.from('leads').update({ service_interest: detected, interest_confirmed: true }).eq('id', lead.id)
    leadInterest = { ...leadInterest, service_interest: detected }
    serviceMissing = false
  }
}
```

## 2. Sincronizar funil imediatamente
Estender `syncFunnelFromCapturedData` (`lib/funnel-state.ts`) para também marcar `interest_confirmed=true` e avançar `step` para `localizacao` (ou `pre_handoff` se localização já conhecida) quando o interesse for detectado nesse turno. Hoje a função já recebe `interestRaw` mas o problema é que a fonte (`leads.service_interest`) ainda estava "SEM_SERVICO" — com o passo 1 isso passa a alimentar o sync corretamente.

## 3. Memorizar perguntas factuais feitas durante o cadastro
Adicionar nova coluna `pending_question` (text, nullable) em `lead_funnel_state` via migração. Quando o cliente fizer pergunta factual durante o cadastro (detectada por `topicHint` não vazio + presença de "?", "como", "quanto", "qual", "quais", "preciso"), gravar a frase original. No webhook:
- Durante o cadastro: continuar respondendo "Ótima pergunta, te explico já já" + próxima etapa do roteiro (KB segue bloqueada — comportamento já correto).
- No turno **imediatamente após o Pré-Handoff** (ou seja, primeira execução com `flowComplete=true`): se `pending_question` existir, usar essa string como `kbQuery` em vez da mensagem atual do cliente, responder com KB e limpar `pending_question`. Assim o agente "volta" exatamente na pergunta que ficou em aberto.

## 4. Defesa em profundidade no `lockConfirmedFieldsInResponse`
Em `lib/overrides.ts`: quando `flowComplete` (ou seja, `nameKnown && emailKnown && interestKnown && locationKnown`), o lock deve ser **no-op** — nunca substituir a resposta da IA por pergunta de cadastro. Adicionar guard early-return e teste de regressão.

## 5. Testes
Em `funnel_persistence_test.ts` adicionar:
- "Cliente responde 'Nacionalidade' → `service_interest` é capturado e `interest_confirmed=true`."
- "Cliente faz pergunta factual no meio do cadastro → `pending_question` salvo, próxima resposta segue roteiro."
- "Após Pré-Handoff com `pending_question` salvo → KB é consultada com a pergunta original e resposta NÃO contém perguntas de cadastro."
- "Caso Roberto Barros: sequência exata de mensagens reproduzida → último turno responde sobre 'estudos na Espanha' usando KB e não repete o catálogo."

Rodar `supabase--test_edge_functions` no `whatsapp-webhook`.

## 6. Backfill (one-shot, opcional)
Migration corretiva para o lead atual: setar `leads.service_interest='NACIONALIDADE'`, `interest_confirmed=true`, e `lead_funnel_state.interest_confirmed=true, step='pre_handoff'` para Roberto. Assim a próxima mensagem dele já cai no modo TIRA-DÚVIDAS com KB.

## Arquivos
- `supabase/functions/whatsapp-webhook/lib/extract.ts` (novo `extractInterestFromMessage`)
- `supabase/functions/whatsapp-webhook/lib/funnel-state.ts` (sync + `pending_question`)
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (no-op quando flowComplete)
- `supabase/functions/whatsapp-webhook/index.ts` (captura interesse, salva/consome `pending_question`, usa `pending_question` como `kbQuery`)
- `supabase/functions/whatsapp-webhook/funnel_persistence_test.ts` (4 novos testes)
- Migração: `ALTER TABLE lead_funnel_state ADD COLUMN pending_question text;` + backfill do Roberto
