## Opção A — Testes de integração do handler antes dos passos 8-10

Objetivo: criar uma rede de segurança real para o `handler` do `whatsapp-webhook` antes de extrair `state.ts`, `gate.ts` e `prompt.ts` (passos 8-10 do plano Wave 3b). Sem isso, qualquer regressão nesses passos só aparece em produção via Twilio.

### Escopo

- Adicionar **testes de integração Deno** que exercitam o `handler` exportado do `index.ts` ponta a ponta.
- Mockar `Request` (payload Twilio) e o **Supabase client** (reads/inserts/updates necessários).
- Mockar fetch externo: Gemini, OpenAI, Twilio API, embeddings.
- Não mudar lógica de produção. Apenas:
  - Exportar `handler` (se ainda não exportado) para o teste.
  - Permitir injeção do client Supabase via parâmetro opcional ou factory (mínimo invasivo).
  - Permitir override de `fetch` via `globalThis.fetch` stub no teste.

### Cenários cobertos (alvo: 6 testes)

1. **Novo contato + primeira mensagem** → cria `contacts`, cria `leads`, cria `chat_sessions`, dispara saudação em PT-BR.
2. **Resposta com nome completo** → atualiza contact name, avança fluxo, próxima pergunta é email.
3. **Loop de pergunta detectado** → resposta válida do user repetida pelo modelo é substituída pelo override (`forceAdvance*`).
4. **Janela 24h expirada** → handler escolhe template oficial em vez de freeform; loga `origem: SISTEMA`.
5. **Handoff humano ativo** → AI auto-pause respeitado; nenhuma chamada Gemini/OpenAI.
6. **Idioma ES detectado** → resposta sai em espanhol; sem vazamento de PT (cobre `enforceResponseLanguage`).

### Estrutura de arquivos

- Novo: `supabase/functions/whatsapp-webhook/handler_test.ts` (separado do `index_test.ts` que cobre helpers puros).
- Novo: `supabase/functions/whatsapp-webhook/__mocks__/supabase.ts` — factory `createMockSupabase({ contacts, leads, sessions, messages, ... })` com `from().select().eq()...` chainable e gravação das mutations em arrays inspecionáveis.
- Novo: `supabase/functions/whatsapp-webhook/__mocks__/fetch.ts` — `installFetchMock({ gemini?, openai?, twilio?, embeddings? })` com restore.

### Mudanças mínimas em `index.ts`

- Garantir `export async function handler(req, deps?)` onde `deps` permite injetar `{ supabase, fetch }`. Default mantém comportamento atual (cria via env).
- Nada mais. Sem refator de lógica nesta wave.

### Validação

- `supabase--test_edge_functions { functions: ["whatsapp-webhook"] }` → meta: **19 antigos + 6 novos = 25/25 verde**.
- Rodar 2x para confirmar determinismo (sem flakiness por timers/fetch reais).

### Detalhes técnicos

- Usar `Deno.test` com `t.step` para sub-cenários quando útil.
- Stub de `crypto.randomUUID` apenas se necessário para asserts estáveis.
- `Date.now` congelado via `using time = new FakeTime(...)` do `https://deno.land/std@0.224.0/testing/time.ts` quando o teste depender de janela 24h.
- Asserts focados em: payload enviado ao Twilio (texto + idioma + template SID quando aplicável), mutations gravadas no mock Supabase, e ausência de chamadas indevidas (ex: Gemini durante handoff).

### Fora do escopo

- Não executa passos 8-10 nesta wave. Eles vêm em Wave 3b-final, depois desta rede de segurança verde.
- Não adiciona testes de helpers já cobertos por `index_test.ts`.
- Não toca em RLS, schema, secrets, prompt do Gemini.

### Saída esperada

- 6 testes novos verdes.
- `index.ts` praticamente intacto (só `export` do handler + parâmetro `deps` opcional).
- Caminho liberado para extrair `state.ts` / `gate.ts` / `prompt.ts` com confiança.
