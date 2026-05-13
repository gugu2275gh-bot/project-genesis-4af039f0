## Diagnóstico — o que ocorreu nos prints

**Sequência observada (idioma EN, locked):**

1. User: "hi" → Bot: Msg1 (greeting "Thank you for reaching out…") + Msg2 (consent "quick questions…is that okay?") ✅
2. User: "ok" → Bot: **repete Msg1+Msg2** ("Everything is good!… I'll ask you a few quick questions…Can we proceed?") ❌
3. User: "ok" → Bot: **repete só Msg2** ("I'll ask you a few quick questions…is that okay? 😊") ❌
4. User: "okay" → Bot: finalmente Msg3 ("what is your full name?") ✅
5. User: "gustavo braga" → Bot: **re-greeting completo** ("Great to meet you, Gustavo! 😊 …I'll help you understand…I'll ask you a few quick questions…Can we proceed?") ❌

**Causa raiz:** o `preventRepeatedCanonicalQuestion` em `lib/overrides.ts` cataloga âncoras para Msg3, Msg4, Msg7, A2-A6, B2-B5 — mas **não tem âncora para Msg1 (greeting) nem Msg2 (consent)**. O LLM re-emite a abertura livremente e nada substitui pela próxima pergunta pendente. Além disso, quando o nome é capturado, o LLM gera um "re-greeting" ("Great to meet you, X! Thank you for reaching…") que reempacota Msg1+Msg2 — também sem guard.

Não há flag persistida `opener_sent` no `outside_spain_progress` (ou equivalente), então o gate só depende do regex do transcript, que falha quando o LLM varia a frase ("Everything is good!" vs "Hello 👋 How are you?").

## Plano de correção (mínimo, cirúrgico)

### 1. `lib/funnel-state.ts` — persistir flag `opener_sent`
Acrescentar campo opcional `opener_sent?: boolean` no shape de `outside_spain_progress`. Setar `true` na primeira vez que o webhook detectar greeting+consent já enviados (regex `aberturaDone` reutilizado de `index.ts`).

### 2. `lib/overrides.ts` — adicionar 2 âncoras + 1 stripper
- **Âncora `Msg1_greeting`** — regex pergunta: greeting ("thank you for reaching|gracias por hablar|obrigado por falar|merci de nous"). Guard: `openerSent === true` OR transcript já contém greeting. Substituição: próxima canônica pendente (Msg3 nome se !nameKnown, senão Msg4 email, etc.).
- **Âncora `Msg2_consent`** — regex pergunta: "(quick questions?|perguntas rápidas|preguntas rápidas)…(is that okay|pode ser|can we proceed|está bien|d'accord)". Mesmo guard. Mesma substituição.
- **Stripper `stripRepeatedOpener`** — função nova chamada antes de `preventRepeatedCanonicalQuestion`. Se `openerSent === true` E a resposta começa com greeting/welcome, remove o parágrafo de abertura mantendo apenas a pergunta final. Caso só sobre re-greeting (sem pergunta nova), substitui pela próxima canônica pendente via `enforceBlockCompletion`.

### 3. `index.ts` — wire-up
- Após cada turno do assistente, se `aberturaDone` (regex existente nas linhas 1687-1688) for true e `outside_spain_progress.opener_sent` ainda for falso, persistir flag `opener_sent: true` no patch.
- Passar `openerSent: outside_spain_progress?.opener_sent` para `preventRepeatedCanonicalQuestion` e para o novo `stripRepeatedOpener`.
- Chamar `stripRepeatedOpener` na pipeline de overrides logo antes de `preventRepeatedCanonicalQuestion`.

### 4. Testes Deno (novo arquivo `opener_idempotency_test.ts`)
- Greeting repetido com `openerSent=true` + `nameKnown=false` → substituído por Msg3 (nome) nas 4 línguas.
- Consent repetido com `openerSent=true` + `nameKnown=true` + `emailKnown=false` → substituído por Msg4 (email).
- Re-greeting pós-nome ("Great to meet you, X! …I'll ask you a few quick questions…") com `openerSent=true` + `nameKnown=true` → strippado, restando apenas próxima canônica.
- Sem `openerSent` (1ª emissão) → opener passa intacto.

### 5. Validação
Rodar `supabase--test_edge_functions` apenas em `whatsapp-webhook`. Esperado: 33 testes existentes verdes + ~6 novos verdes.

## Critérios de aceite
- Idioma: travamento atual preservado (sem mudança).
- Nenhuma das 4 perguntas (Msg1 greeting, Msg2 consent, Msg3 nome, Msg4 email) reaparece após enviada uma vez.
- Após nome confirmado, o bot **não** re-emite greeting; vai direto para Msg4.
- Sequência BPMN v2-6 mantida; flags persistidas em `outside_spain_progress` continuam a fonte da verdade.

## Notas técnicas
- Sem migração SQL: `outside_spain_progress` já é `jsonb` e aceita campos adicionais.
- Sem mudança de fluxo no LLM/prompt; apenas guard pós-resposta determinístico.
- Reutiliza `enforceBlockCompletion` + `lock()` existentes para a substituição.