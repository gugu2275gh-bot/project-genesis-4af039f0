## De onde saiu o `gemini-3.5-flash`

Não veio do banco. A configuração real em `llm_settings` é exatamente o que aparece na sua tela:

1. `gemini-3-flash-preview` (Gemini)
2. `gemini-2.5-flash-lite` (Gemini)
3. `gpt-4o-mini` (OpenAI)

O `gemini-3.5-flash` está hardcoded como **fallback de emergência** em `supabase/functions/whatsapp-webhook/lib/ai.ts` (linhas 306-308):

```ts
const DEFAULT_CASCADE: CascadeItem[] = [
  { provider: 'gemini', model: 'gemini-3.5-flash' },   // ❌ não existe
  { provider: 'gemini', model: 'gemini-2.5-pro' },
]
```

Esse fallback é usado quando:
- a tabela `llm_settings` está vazia,
- ou a query falha,
- ou todos os itens da cascata estão desativados.

Na minha resposta anterior, descrevi esse fallback como se fosse a configuração ativa — foi erro meu. A configuração realmente em uso é a da tela.

## Correção proposta

Atualizar `DEFAULT_CASCADE` em `supabase/functions/whatsapp-webhook/lib/ai.ts` para refletir modelos válidos e alinhados com a configuração atual da UI:

```ts
const DEFAULT_CASCADE: CascadeItem[] = [
  { provider: 'gemini', model: 'gemini-3-flash-preview' },
  { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
  { provider: 'openai', model: 'gpt-4o-mini' },
]
```

Redeploy da edge function `whatsapp-webhook` após a edição.

## Resultado

- Configuração ativa permanece a da tela (vinda do banco).
- Em caso de falha de leitura do banco, o fallback agora usa modelos válidos e idênticos à cascata configurada — sem mais referências a `gemini-3.5-flash` inexistente.
