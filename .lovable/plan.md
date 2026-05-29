## Tela de Ajuste de LLM em Configurações

Adicionar nova aba **"LLM"** dentro de `Configurações` (visível apenas para ADMIN/Superuser) que permita:

1. **Ver status das chaves de API** (Gemini `CBAsesoria_Key` e `OPENAI_API_KEY`) — configurada / não configurada, com link rápido para o painel de Secrets do Supabase para atualizar.
2. **Habilitar/desabilitar** cada provider (Gemini, OpenAI) globalmente — útil para teste controlado.
3. **Escolher os modelos** disponíveis em cada provider a partir de uma lista pré-definida.
4. **Reordenar a cascata** (drag/arrows) — define a sequência de tentativa do agente WhatsApp.
5. **Testar conexão** botão por modelo: envia um prompt curto e retorna OK + latência ou erro.

### Banco de dados

Criar tabela `public.llm_settings` (single-row config; sem armazenar chaves — apenas configuração):

- `id` (uuid, pk)
- `gemini_enabled` (boolean, default true)
- `openai_enabled` (boolean, default true)
- `cascade` (jsonb) — array ordenado de `{ provider: 'gemini'|'openai', model: string, enabled: boolean }`
- `updated_at`, `updated_by`

Seed inicial com a cascata atual: `gemini-3.5-flash` → `gemini-2.5-pro` → `gemini-2.5-flash-lite` → `gpt-4o-mini`.

RLS: SELECT/UPDATE apenas ADMIN. Grant authenticated SELECT/UPDATE; service_role ALL.

### Edge function `llm-config`

Endpoints:
- `GET /status` — retorna `{ gemini_key_present, openai_key_present, settings }` (lê env vars, não expõe valores).
- `POST /test` — corpo `{ provider, model }`; envia prompt curto ("ping em 1 palavra") ao provider/modelo escolhido e retorna `{ ok, latency_ms, error? }`.

Validação JWT no código (admin obrigatório).

### Frontend

- `src/pages/settings/LLMSettings.tsx` — nova aba.
  - Cards: "Chaves de API" (status + botão "Atualizar no Supabase" abrindo URL de secrets), "Providers" (switches), "Cascata de modelos" (lista reordenável com botões ↑↓, switch enabled, badge do provider, botão "Testar").
  - Lista de modelos disponíveis para adicionar à cascata:
    - Gemini: `gemini-3.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-flash`.
    - OpenAI: `gpt-4o-mini`, `gpt-4o`.
  - Botão "Salvar" persiste em `llm_settings`.
- `src/pages/settings/Settings.tsx` — adicionar `<TabsTrigger value="llm">` com ícone Brain e `<TabsContent>` renderizando `LLMSettings`.

### Integração com o agente WhatsApp

Refatorar `supabase/functions/whatsapp-webhook/lib/ai.ts`:
- `generateAIResponse` recebe (ou lê de helper) o array `cascade` de `llm_settings`.
- Itera nos itens com `enabled: true` cujo provider esteja habilitado.
- Para `provider === 'gemini'` mantém o fluxo atual (endpoint v1beta).
- Para `provider === 'openai'` chama OpenAI chat completions com o modelo escolhido.
- Mantém fallback hardcoded caso a tabela esteja vazia.

`index.ts` deixa de fazer o fallback manual para OpenAI (passa a ser apenas mais um item da cascata controlado por configuração).

### Segurança / observações

- Chaves continuam em Supabase Secrets — nunca expostas na UI nem armazenadas no banco.
- "Atualizar chave" abre o painel de Secrets do Supabase em nova aba; a página apenas mostra se está presente.
- Acesso à aba e à edge function exige ADMIN.

### Memória

Atualizar `mem://integrations/whatsapp-ai-agent` para refletir que a cascata agora é dinâmica via `llm_settings` (com defaults preservados).
