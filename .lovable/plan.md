## Objetivo

Alinhar o agente WhatsApp ao novo BPMN `CB_pre-handoff_v2.bpm`:

1. **Msg 5 + Msg 6** entregues na **mesma rodada** (um único turno do bot). A resposta do cliente deve ser interpretada como **uma das opções listadas em Msg 5** (interesse).
2. **Remover Msg H4**. O fluxo de handoff termina em **Msg H3** (apenas uma bolha de encerramento). Sem H4, sem segunda bolha de "vou te encaminhar para um atendente".

Tudo o que o usuário pediu para manter (3.4 deterministic path como está, 3.5 sem roteamento real) permanece intocado.

---

## Mudanças

### 1. `lib/questions.ts` — remover H4
- `getHandoffTransferMessage(language)` passa a retornar **apenas H3** (sem `|||`, sem segunda bolha) nos 4 idiomas:
  - PT: "Vou encaminhar suas informações para um especialista analisar com mais profundidade."
  - ES: "Voy a remitir tu información a un especialista para que la analice con más profundidad."
  - EN: "I will forward your information to a specialist to analyze it in more depth."
  - FR: "Je vais transmettre vos informations à un spécialiste pour qu'il les analyse plus en profondeur."
- `HANDOFF_TRANSFER_RE` reduzido às âncoras de H3 (remover âncoras de H4 — "vou te encaminhar para um atendente", "te voy a derivar a un agente", etc.).
- `buildPreHandoffPayload` mantém a lógica idempotente (usando flags `pre_handoff_sent` / `handoff_sent`), mas o payload final completo agora é `H1|||H2|||H3` (3 bolhas, não 4).
- Comentários do bloco BPMN-3 atualizados para BPMN-v2: "3 mensagens distintas" no lugar de "4".

### 2. `index.ts` — Msg5 + Msg6 na mesma rodada
- Bloco do prompt LLM (linhas ~1244-1245 e ~1675): substituir a instrução "envie Msg5, AGUARDE, depois Msg6" por **"envie Msg5 e Msg6 numa única rodada, separadas por `\n\n` (ou duas bolhas via `|||`), e aguarde a resposta — que deve ser uma das opções citadas em Msg5"**.
- Reforçar no prompt que a resposta esperada é **uma das opções de Msg 5** (nacionalidade / residência / estudos / arraigo / documento específico). Se vier algo fora, o bot pede para o cliente escolher uma das opções (sem repetir Msg5+Msg6 inteiras — só uma reformulação curta).
- O passo `interesse` na "trilha" passa a ser concluído quando **uma única rodada** com Msg5+Msg6 já foi enviada (não duas separadas).
- Remover comentários e flags que assumiam Msg6 só depois de resposta.

### 3. `lib/overrides.ts` — injeção determinística
- `getServicesOfferedMessage` (Msg6) deixa de ser injetado **depois** de `interest_confirmed`. Em vez disso, quando o bot for emitir Msg5 (`interestQuestion`), o override garante que Msg6 (`servicesCatalog` / `getServicesOfferedMessage`) seja **anexado na mesma resposta** (com `|||` ou `\n\n`).
- Validação de resposta: se `interest_confirmed` ainda não capturou e a resposta do cliente não bate com nenhum termo do catálogo Msg5, gerar uma mensagem curta pedindo escolha (sem reenviar Msg5+Msg6).

### 4. Testes
- Atualizar `bpmn3_handoff_test.ts` (renomear mentalmente para v2): remover asserts que esperavam H4; payload final passa a ter exatamente 3 bolhas (`H1`, `H2`, `H3`).
- Atualizar `wave7_test.ts`: payload pré-handoff = 3 bolhas.
- Adicionar caso novo: "Msg5 e Msg6 saem juntas em um único turno" e "resposta fora das opções pede reescolha sem reenviar Msg5+Msg6".

### 5. Migration
- **Nenhuma**. As colunas `pre_handoff_sent` / `handoff_sent` continuam válidas — `handoff_sent` agora marca o envio do H3 (único).

---

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/lib/overrides.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts`
- `supabase/functions/whatsapp-webhook/wave7_test.ts`

## Como rodar os testes

```bash
# Testes do novo fluxo BPMN v2 (pré-handoff + Msg5/Msg6 + H3 único)
deno test --allow-net --allow-env \
  supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts \
  supabase/functions/whatsapp-webhook/wave7_test.ts

# Ou via Lovable:
# tool: supabase--test_edge_functions { functions: ["whatsapp-webhook"] }
```

## Confirmação antes de implementar

1. **Msg H4 deve ser removida em todos os idiomas** (PT/ES/EN/FR), correto?
2. Quando a resposta de Msg5 vier **fora** das opções (ex.: "quero ajuda jurídica genérica"), o bot deve **(a)** aceitar como "OUTRO" e seguir, ou **(b)** insistir até o cliente escolher uma das opções listadas? (BPMN sugere (b) — gateway com opções fixas.)