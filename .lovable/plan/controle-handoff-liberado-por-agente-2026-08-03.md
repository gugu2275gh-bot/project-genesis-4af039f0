# Controle "Handoff liberado" por agente

Adicionar um interruptor na configuração do agente de IA que define o que acontece **depois** que o pré-handoff termina (todos os dados coletados e mensagem de transferência enviada).

## Comportamento

```text
Pré-handoff concluído
        |
        +-- Handoff LIBERADO (padrão: ligado)
        |      -> agente responde novas perguntas usando a base de conhecimento
        |      -> para de responder assim que um atendente humano escrever no chat
        |
        +-- Handoff BLOQUEADO
               -> agente NÃO consulta a base
               -> responde sempre a mesma mensagem de espera configurada
```

## O que muda na tela do agente

Na aba de configuração do agente (tela cheia de Agentes de IA), um novo bloco "Após o pré-handoff":

- Toggle **"Handoff liberado (responder pela base de conhecimento)"** — ligado por padrão, mantendo o comportamento atual.
- Quando desligado, aparece um campo de texto multi-idioma **"Mensagem de espera"** (PT/ES/EN/FR), com tradução automática pelo botão já existente, e um texto padrão sugerido: "Seu caso já foi encaminhado ao especialista da CB Asesoría. Em breve um de nossos especialistas irá lhe atender. Por favor, aguarde."

## Detalhes técnicos

- **Banco**: duas colunas novas em `ai_agents` — `handoff_released boolean not null default true` e `handoff_hold_message jsonb not null default '{}'` (mesmo formato multi-idioma já usado em `messages`). Migração idempotente, sem alterar dados existentes.
- **Tipos/UI**: `src/types/ai-agents.ts` (interface + defaults) e o formulário do agente (`src/components/ai-agents/AgentFormDialog.tsx` e componentes de campo multi-idioma já existentes).
- **Runtime (`supabase/functions/whatsapp-webhook/index.ts`)**: no ponto em que hoje entra o "free mode" (`pre_handoff_sent`/`handoff_sent` verdadeiros, `step = 'livre'`), verificar a flag do agente de produção:
  - liberado → caminho atual (busca híbrida na base + LLM), sem mudanças;
  - bloqueado → curto-circuito antes de qualquer chamada de LLM/base, enviando apenas a mensagem de espera localizada pela camada `flow-i18n` (nada é gravado como resposta do fluxo).
- **Silêncio ao atendente humano**: já existe (última mensagem de saída com `origem = 'SISTEMA'` pausa a IA). Vale para os dois modos, sem alteração.
- **Sandbox** (`supabase/functions/ai-agent-sandbox/index.ts`): mesma decisão, para que o teste do agente reproduza o comportamento real.
- **Testes Deno**: novos casos cobrindo modo liberado (responde pela base), modo bloqueado (repete a mensagem de espera e não chama a base) e pausa após mensagem humana, rodados junto com a suíte atual.

## Fora do escopo

- Não altera as etapas nem as mensagens dos fluxos existentes (v2/v3).
- Não cria controle por fluxo ou por etapa — a decisão é do agente.
