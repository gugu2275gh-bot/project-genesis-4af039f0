## Objetivo

Permitir que `gemini-3.6-flash` seja chamado diretamente pela API do Google (chave `GEMINI_API_KEY`), sem passar pelo Lovable AI.

## Contexto atual (verificado no código)

Hoje existem três "desvios" que forçam esse modelo para o Lovable AI:

- `src/pages/settings/LLMSettings.tsx` — `normalizeCascadeItem` converte `gemini/gemini-3.6-flash` em `lovable/google/gemini-3.6-flash` (na carga, importação, teste e ao adicionar item).
- `supabase/functions/llm-config/index.ts` — `testGemini` redireciona o teste para `testLovable('google/gemini-3.6-flash')`.
- `supabase/functions/whatsapp-webhook/lib/ai.ts` — `normalizeCascadeItem` faz a mesma conversão na cascata real do agente.

O motivo do desvio foi o erro HTTP 400 anterior: o endpoint nativo `generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash` foi rejeitado. Não está confirmado se isso ocorre porque o ID nativo é diferente (ex.: sufixo de versão/preview) ou porque a chave do projeto não tem acesso ao modelo — isso será verificado como primeiro passo.

## Passos

1. **Verificar o ID nativo real**: consultar a lista de modelos do Google com a `GEMINI_API_KEY` do projeto (a função `llm-config` já tem esse endpoint de listagem) e identificar o ID exato correspondente ao Gemini 3.6 Flash disponível para a chave.
2. **Remover os desvios**: apagar `normalizeCascadeItem` (frontend e webhook) e a redireção dentro de `testGemini`, para que o provedor `gemini` sempre chame a API do Google.
3. **Ajustar o ID exibido na UI**: no seletor de modelos Gemini, usar o ID nativo confirmado no passo 1 (mantendo `google/gemini-3.6-flash` apenas na lista do provedor Lovable AI, para quem quiser essa rota).
4. **Migrar a configuração salva**: atualizar o registro em `llm_settings` para que o item aponte para `gemini` + ID nativo correto.
5. **Deploy e teste**: reimplantar `llm-config` e `whatsapp-webhook` e validar pelo botão "Testar" (esperado: 200, sem HTTP 400).

## Se o modelo não existir na API do Google

Caso o passo 1 mostre que a chave/projeto não expõe esse modelo, informo o resultado e as opções (usar o ID mais próximo disponível, ex.: a linha `gemini-flash-latest`/3.x listada pela API, ou manter a rota Lovable AI) antes de alterar mais nada.
