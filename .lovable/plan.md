## O que está acontecendo

O botão "Testar" envia `provider: gemini` + `model: gemini-3.6-flash` para a edge function `llm-config`, que chama **direto** a API do Google:

```text
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=CBAsesoria_Key
```

O HTTP 400 vem do próprio Google: esse identificador não existe na API direta (Generative Language / AI Studio). O nome `gemini-3.6-flash` é o alias usado pelo **Lovable AI Gateway** (`google/gemini-3.6-flash`), não pela API direta com chave própria. Ou seja: o modelo foi adicionado à cascata, mas não há como a chave atual falar com ele — e a mesma falha aconteceria em produção, quando o agente WhatsApp tentar usá-lo (ele só cairia para o próximo modelo da cascata).

Detalhe agravante: a UI corta o erro em 40 caracteres (`HTTP 400: { "error": { "code": 400`), escondendo a mensagem real do Google, que normalmente diz qual é o problema.

## Correção proposta

1. **Mostrar o erro completo** (confirma o diagnóstico e ajuda em falhas futuras)
   - Em `src/pages/settings/LLMSettings.tsx`, exibir a mensagem completa em tooltip/linha expansível em vez de `.slice(0, 40)`.
   - Em `supabase/functions/llm-config/index.ts`, extrair `error.message` do JSON do Google em vez de devolver o corpo bruto truncado.

2. **Tornar o Gemini 3.6 realmente utilizável — novo provider `lovable`**
   - Adicionar o provider "Lovable AI" (chave `LOVABLE_API_KEY`, endpoint `https://ai.gateway.lovable.dev/v1/chat/completions`).
   - `llm-config`: incluir `lovable` em `status`, `list_models` (catálogo fixo: `google/gemini-3.6-flash`, `google/gemini-3.5-flash`, `google/gemini-3.1-flash-lite`, `openai/gpt-5.5`, `openai/gpt-5.4-mini`) e `test`.
   - `supabase/functions/whatsapp-webhook/lib/ai.ts`: a cascata passa a suportar itens `provider: 'lovable'`, chamando o gateway no formato OpenAI-compatível.
   - `LLMSettings.tsx`: tipo `Provider` ganha `'lovable'`, novo switch de provedor e opção no seletor de adicionar modelo.

3. **Evitar reincidência**
   - Ao adicionar um modelo, validar que o id está na lista retornada pelo provider; se não estiver, avisar antes de salvar.
   - Ajustar a entrada quebrada existente: remover `gemini/gemini-3.6-flash` da cascata e sugerir `lovable/google/gemini-3.6-flash` no lugar.

## Detalhes técnicos

- A cascata fica em `llm_settings.cascade` (JSON), então nenhuma migration de schema é necessária — apenas atualizar a linha existente para remover o item inválido.
- `LOVABLE_API_KEY` é secret server-side; usada só nas edge functions (`llm-config` e `whatsapp-webhook`), nunca no frontend.
- Se preferir manter apenas a chave própria do Google, a alternativa é remover o `gemini-3.6-flash` e usar os ids válidos da API direta (ex.: `gemini-flash-latest`, `gemini-2.5-flash`), sem o passo 2.
