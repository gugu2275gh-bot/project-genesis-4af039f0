## Novo fluxo de modelos do agente WhatsApp

Atualizar a cadeia de LLMs usada pelo agente para seguir esta ordem de tentativa:

1. **google/gemini-3.5-flash** (primário — respostas do agente)
2. **google/gemini-2.5-pro** (fallback 1 — se 3.5-flash falhar/erro/rate-limit)
3. **google/gemini-2.5-flash-lite** (fallback 2 — também segue como modelo "leve" para extração/idioma)
4. **openai/gpt-4o-mini** (fallback final)

### Arquivos a alterar

- `supabase/functions/whatsapp-webhook/lib/ai.ts`
  - Substituir o modelo primário atual (`gemini-2.5-flash`) por `gemini-3.5-flash` nas chamadas principais de geração de resposta.
  - Implementar cascata: tentar 3.5-flash → em erro (5xx, 429, resposta vazia) cair para 2.5-pro → depois 2.5-flash-lite → depois gpt-4o-mini.
  - Manter `gemini-2.5-flash-lite` também como modelo das tarefas leves já existentes (extração de nome/email, detecção de idioma).
- `supabase/functions/whatsapp-webhook/index.ts`
  - Ajustar qualquer referência direta ao nome do modelo primário, se houver, para `gemini-3.5-flash`.

### Comportamento

- Mantém chave `CBAsesoria_Key` para chamadas Gemini e `OPENAI_API_KEY` para o fallback OpenAI.
- Mantém logs já existentes de qual modelo respondeu (sem alterar formato).
- Não altera prompts, ferramentas, RLS, banco, ou qualquer outra funcionalidade.

### Notas

- `gemini-3.5-flash` é geração mais nova e mais eficiente que 2.5-flash — espera-se latência similar ou melhor.
- `gemini-2.5-pro` no fallback aumenta qualidade quando o primário falha, mas pode ter latência maior nesses casos.
