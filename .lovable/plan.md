## Objetivo

O idioma deve ser identificado já na **primeira mensagem do cliente** — tanto no Sandbox de testes quanto no atendimento real do WhatsApp — e travado a partir daí, sem "voltar" para português por engano.

## O que foi verificado no código

**Sandbox** (`supabase/functions/ai-agent-sandbox/index.ts`): no primeiro turno a mensagem do cliente é descartada da detecção:

```ts
const firstTurnGlobal = !flowState.current_step
const langResolution = resolveFlowLanguage(
  flowState.lang,
  firstTurnGlobal ? '' : message,   // <- 1ª mensagem nunca é analisada
  config.default_language,
)
```
Resultado: a saudação sai sempre no idioma padrão e a detecção só ocorre do 2º turno em diante.

**Produção** (`supabase/functions/whatsapp-webhook/index.ts`, bloco "LANGUAGE LOCK", ~linha 1435): a 1ª interação já analisa a mensagem, mas há dois furos:
- No ramo final (contato sem `preferred_language` e que não é primeira interação), o código faz `detectChatLanguageOrNull(sample) ?? 'pt-BR'` e **grava** esse pt-BR no contato. Um sinal inconclusivo trava português permanentemente.
- A "re-detecção suave" só roda quando já existe lock e apenas enquanto `recentUserMsgs.length <= 4`; depois disso um lock errado nunca mais é corrigido.

## Mudanças

### 1. Sandbox — detectar na 1ª mensagem
- Passar sempre `message` para `resolveFlowLanguage`, inclusive no primeiro turno.
- `startFlow(steps, lang)` recebe o idioma detectado → a saudação já sai traduzida.
- Persistir `flow_state.lang` apenas quando houver sinal positivo (nunca travar por fallback).

### 2. Produção — nunca travar sem sinal positivo
- No ramo de fallback, só gravar `contacts.preferred_language` quando `detectChatLanguageOrNull` retornar um idioma; caso contrário usar pt-BR **apenas no turno atual**, sem persistir.
- Ampliar a janela de re-detecção precoce: permitir corrigir o lock enquanto o cliente ainda não passou da fase de captação (usar o número de mensagens do cliente, hoje `<= 4`, elevado para `<= 8`), e sempre que o lock atual tiver vindo de fallback e não de sinal positivo.
- Registrar a origem do lock (positivo vs. provisório) em log para diagnóstico.

### 3. Detector compartilhado
- Consolidar o sandbox e o webhook sobre `supabase/functions/_shared/language-detect.ts`, incorporando os padrões que hoje só existem em `whatsapp-webhook/lib/language.ts` (e vice-versa), para os dois ambientes se comportarem igual.
- Reforçar sinais curtos comuns em 1ª mensagem: "hola", "buenas", "hi", "hello", "bonjour", "oi", "bom dia", saudações com typos.
- Mensagens neutras (só um nome, número, "ok") continuam **inconclusivas** e não travam idioma.

### 4. UI do Sandbox
- `src/components/ai-agents/AgentSandbox.tsx`: badge mostrando `detectado (travado)` ou `padrão (aguardando sinal)`, com reset correto em "Novo teste".

### 5. Testes
- `supabase/functions/ai-agent-sandbox/language-detect_test.ts`: 1ª mensagem em ES/EN/FR/PT trava imediatamente; mensagem neutra não trava e a seguinte trava; idioma travado por sinal positivo não é redetectado.

## Detalhes técnicos
- Sem mudanças de schema: usa `contacts.preferred_language` e `ai_agent_test_sessions.flow_state.lang` já existentes.
- Verificação: `deno test` das edge functions + typecheck do frontend; deploy de `ai-agent-sandbox` e `whatsapp-webhook`.
