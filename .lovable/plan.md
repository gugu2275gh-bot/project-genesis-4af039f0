## Objetivo

Garantir que as 3 bolhas do pré-handoff (H1 "visão inicial", H2 "analisamos cada caso", H3 "vou encaminhar a um especialista") sejam **sempre** enviadas com o texto canônico literal de `getPreHandoffSummaryMessage` / `getHandoffTransferMessage` (PT/ES/EN/FR), sem o LLM reescrever, e que o fluxo nunca pare no meio da sequência.

## Diagnóstico

Hoje o texto canônico já existe em `supabase/functions/whatsapp-webhook/lib/questions.ts` (linhas 308–333). Mas quando o LLM gera a resposta livre, ele frequentemente parafraseia ("Posso já ter uma noção do seu caso", "Vou repassar para um especialista", etc.). Como as âncoras de detecção (`PRE_HANDOFF_SUMMARY_RE` e `HANDOFF_TRANSFER_RE`) só casam o texto literal, isso causa:

- Flags `pre_handoff_sent` / `handoff_sent` não persistem.
- `stripRepeatedPreHandoff` não consegue limpar reemissões.
- A continuidade quebra: a conversa pode parar entre H2 e H3, ou repetir H1 vezes seguintes.

## Plano

### 1. Novo módulo: `enforceCanonicalPreHandoff` em `lib/overrides.ts`

Função pura que recebe `(aiResponseClean, language, { preHandoffSent, handoffSent })` e devolve o texto normalizado.

Regras:
- Detectores paráfrase mais largos por idioma (uma regex por idioma para H1/H2 combinados e outra para H3). Exemplos de tokens: `vis[ãa]o|noç[ãa]o|panorama|ideia inicial|caso`, `analis(amos|ar)|cada caso|individual|seguro|lei`, `encaminhar|repassar|enviar|transmitir|remitir|forward|transmettre.*(especialista|specialist|spécialiste)`.
- Se o LLM emitiu H1/H2 parafraseado **e** `pre_handoff_sent=false` → substitui as bolhas correspondentes pelo literal de `getPreHandoffSummaryMessage(language)` (já vem com `|||`).
- Se emitiu H3 parafraseado **e** `handoff_sent=false` → substitui pelo literal de `getHandoffTransferMessage(language)`.
- Se já enviou H1/H2 antes (`pre_handoff_sent=true`) e o LLM tentou repetir → remove (mantém o comportamento atual de `stripRepeatedPreHandoff`, mas agora também pega paráfrases).

### 2. Garantia de continuidade

Logo após `enforceCanonicalPreHandoff`, novo passo `ensurePreHandoffContinuity`:

- Se `pre_handoff_sent=true` e `handoff_sent=false` e as `parts` finais **não** contêm a âncora literal de H3 → anexa `getHandoffTransferMessage(language)` como última bolha.
- Se as `parts` contêm a âncora de H1 mas não de H2 (split mal-feito) → reescreve usando o payload completo `buildPreHandoffPayload(language, { preHandoffSent:false, handoffSent:false })`.
- Se contém só H3 sem que H1/H2 tenham sido enviados antes → prepend do payload H1|||H2.

### 3. Wiring no `index.ts`

Em `supabase/functions/whatsapp-webhook/index.ts` por volta da linha 2260 (logo após `stripRepeatedPreHandoff` e antes do dedup canônico):

```
aiResponseClean = enforceCanonicalPreHandoff(aiResponseClean, detectedChatLanguage, {
  preHandoffSent: !!funnelStateLive.pre_handoff_sent,
  handoffSent: !!funnelStateLive.handoff_sent,
})
```

E imediatamente após o `split('|||')` (linha 2318), aplicar `ensurePreHandoffContinuity(parts, ...)`. O bloco de persistência das flags em 2448–2464 continua funcionando porque o texto agora é sempre o literal canônico.

### 4. Testes (Deno)

Adicionar `supabase/functions/whatsapp-webhook/canonical_pre_handoff_test.ts` cobrindo:

- LLM parafraseou H1 em ES → vira o literal `'Perfecto. Ya puedo tener una visión inicial...'`.
- LLM parafraseou H3 em EN com `pre_handoff_sent=true, handoff_sent=false` → continuidade injeta o literal de H3.
- LLM repetiu H1 em PT com `pre_handoff_sent=true` → bolha some.
- LLM gerou só H2 em FR sem H1 nem H3 → resultado tem H1|||H2|||H3 canônicos.

### 5. Não-mexer

Sem alterar UI, sem novas tabelas, sem novas flags no funil. Mantém os 4 idiomas suportados (PT/ES/EN/FR). Sem mudanças no watchdog.

## Detalhes técnicos

Arquivos editados:
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` — adiciona `enforceCanonicalPreHandoff` e `ensurePreHandoffContinuity` + regex paráfrase por idioma.
- `supabase/functions/whatsapp-webhook/index.ts` — chama as duas funções no pipeline de envio.
- `supabase/functions/whatsapp-webhook/canonical_pre_handoff_test.ts` — novo.

Deploy de `whatsapp-webhook` ao final.
