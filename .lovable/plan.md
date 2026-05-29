
## Objetivo

Substituir a lista fixa (hardcoded) de modelos no dropdown "Selecione um modelo..." por uma lista buscada em tempo real das APIs do Google Gemini e da OpenAI, mostrando apenas modelos compatíveis com geração de texto/chat.

## Mudanças

### 1. Backend — `supabase/functions/llm-config/index.ts`
Adicionar duas novas ações no POST:

- **`action: 'list_models'` + `provider: 'gemini'`**
  - Chama `GET https://generativelanguage.googleapis.com/v1beta/models?key=CBAsesoria_Key`
  - Filtra apenas modelos que tenham `generateContent` em `supportedGenerationMethods`
  - Remove embeddings, TTS, image-only, e modelos `aqa`
  - Retorna: `[{ id, displayName, description }]` (id sem o prefixo `models/`)

- **`action: 'list_models'` + `provider: 'openai'`**
  - Chama `GET https://api.openai.com/v1/models` com `Authorization: Bearer OPENAI_API_KEY`
  - Filtra apenas modelos de chat (heurística por prefixo: `gpt-`, `o1`, `o3`, `chatgpt-`), removendo `embedding`, `tts`, `whisper`, `dall-e`, `image`, `audio`, `realtime`, `transcribe`
  - Retorna: `[{ id, displayName: id, description: '' }]`, ordenados alfabeticamente

Cache em memória de 5 minutos para evitar chamadas repetidas.

### 2. Frontend — `src/pages/settings/LLMSettings.tsx`
- Ao carregar a página (e ao trocar o provider no dropdown "Gemini/OpenAI" do form de adicionar), chamar `llm-config` com `action: 'list_models'` para o provider escolhido
- Substituir o array fixo `GEMINI_MODELS`/`OPENAI_MODELS` por estado `availableModels: { gemini: [], openai: [] }`
- Mostrar um spinner pequeno no select enquanto carrega
- Se a API falhar (chave ausente, 4xx, 5xx), mostrar toast de aviso e cair em uma lista mínima de fallback (os modelos que já estão hoje no código) — para o usuário nunca ficar travado sem opções
- Botão "Recarregar lista" ao lado do select para forçar refresh ignorando o cache
- O dropdown deve mostrar `displayName` + `id` em texto secundário (quando diferente), facilitando identificar `gemini-2.5-flash` vs `gemini-2.5-flash-002` etc.

### 3. Não precisa migração de banco
A tabela `llm_settings` continua igual — apenas a UI passa a oferecer mais opções de `model` para incluir na cascata.

## Detalhes técnicos

- A função `llm-config` já exige role ADMIN — manter
- Endpoint Gemini retorna campo `name` no formato `models/gemini-2.5-flash`; precisamos fazer `id = name.replace(/^models\//, '')`
- Endpoint OpenAI retorna `{ data: [{ id, object: 'model', ... }] }` sem indicar capacidade; filtragem é por padrão de nome
- Modelos preview/experimental ficam na lista, apenas marcados com badge "preview" se o id contiver `preview` ou `exp`
- "Funcionais" aqui significa "listados pela API e do tipo chat". Para validar de fato basta o botão "Testar" já existente

## Não incluído (fora do escopo)

- Não testa automaticamente cada modelo retornado (seria caro e lento; o usuário usa "Testar" sob demanda)
- Não adiciona Anthropic/outros providers — apenas Gemini e OpenAI que já existem no sistema
