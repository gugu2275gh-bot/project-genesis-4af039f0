Plano para corrigir o erro do `gemini-3.6-flash`:

1. **Corrigir a causa no cadastro/teste**
   - O item da tela está como provedor **GEMINI** com modelo `gemini-3.6-flash`.
   - Esse caminho usa a API direta do Google, onde esse ID não é válido neste projeto.
   - O Gemini 3.6 válido será tratado como **Lovable AI** com o ID `google/gemini-3.6-flash`.

2. **Blindar a UI contra a configuração errada**
   - Quando existir `gemini/gemini-3.6-flash` na cascata, converter automaticamente para `lovable/google/gemini-3.6-flash` no rascunho da tela.
   - Permitir importação de configurações com provedor `lovable`.
   - Ajustar o badge para diferenciar melhor `Gemini`, `OpenAI` e `Lovable AI`.

3. **Blindar o backend de teste**
   - No Edge Function `llm-config`, se alguém testar `provider=gemini` com `gemini-3.6-flash`, redirecionar internamente para o teste correto via Lovable AI ou retornar uma mensagem clara de correção.
   - Manter `google/gemini-3.6-flash` na lista oficial do provedor Lovable AI.

4. **Atualizar a configuração salva se necessário**
   - Verificar novamente a tabela `llm_settings` no momento da implementação.
   - Se existir algum item salvo como `gemini/gemini-3.6-flash`, migrar para `lovable/google/gemini-3.6-flash`.

5. **Publicar/testar Edge Functions**
   - Implantar `llm-config` e `whatsapp-webhook`, porque alterações em Edge Functions só passam a valer depois do deploy.
   - Testar o endpoint `llm-config` com `provider=lovable` e `model=google/gemini-3.6-flash` para confirmar que o erro 400 desapareceu.