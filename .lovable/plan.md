## Objetivo

Adicionar, em cada etapa do fluxo do tipo **Pergunta**, duas configurações novas:

1. **Validar a resposta na base de conhecimento (KB)** — checa se o que o cliente respondeu corresponde a um serviço/tema realmente atendido; se sim grava o valor normalizado e segue o fluxo, se não explica e repergunta.
2. **Resposta humanizada** — checkbox que faz o agente reagir com uma frase curta e contextual à resposta do cliente antes de seguir para a próxima pergunta.

Caso de referência: etapa 4 / `msg_5_entender_interesse` → `msg_6_informar_`.

## Configuração na etapa (aba nova "Base de conhecimento")

Visível apenas quando a etapa é do tipo Pergunta:

- **Validar resposta na base de conhecimento** (liga/desliga)
- **O que validar** — instrução curta em texto livre (ex.: "verificar se o serviço citado é oferecido pela CB Asesoria")
- **Quando não for válido**: repergunta a mesma etapa (padrão) / segue mesmo assim / vai para a etapa de fallback
- **Mensagem de recusa** (multi-idioma, com tradução automática) — opcional; se vazia, o agente redige na hora a partir da base, listando o que é oferecido
- **Tentativas antes de desistir** (padrão 2)
- **Gravar o resultado** — usa o campo já configurado em "Salvar resposta em", gravando o nome normalizado do serviço em vez do texto cru

Na aba **Comportamento**, ao lado do reconhecimento atual:

- **Resposta humanizada gerada pela IA** (checkbox por etapa). Ligado = frase curta e contextual sobre a resposta dada; desligado = comportamento atual (frase fixa de reconhecimento ou nada).

## Comportamento em execução

Antes de o motor avançar a etapa:

1. Se a etapa tem validação de KB ligada, busca na base (busca híbrida já existente) usando a resposta do cliente + a instrução da etapa e pede ao LLM um veredito curto: `{ valid, normalized_value, reason, options[] }`.
2. **Válido** → a resposta gravada passa a ser `normalized_value` e o fluxo avança normalmente.
3. **Inválido** → envia a explicação (mensagem configurada ou redigida a partir da base) e repergunta a mesma etapa, contando tentativas; esgotadas as tentativas aplica o modo escolhido (seguir / fallback).
4. **Falha técnica** (LLM/KB fora do ar) → não bloqueia: registra log e deixa o fluxo seguir como hoje.

Depois de a resposta ser aceita, se "resposta humanizada" estiver ligada, o agente gera uma frase curta no idioma travado da conversa e ela é enviada antes da próxima pergunta (substitui o reconhecimento fixo).

Vale igualmente no WhatsApp em produção e no Sandbox de teste.

## Detalhes técnicos

- **Tipos**: novos campos em `StepValidation` (`src/types/ai-agent-flow-builder.ts`): `kb_check: { enabled, instruction, on_invalid, messages, attempts }` e `ack_ai: boolean`. Sem migração de banco — tudo dentro do jsonb `validation`.
- **UI**: nova aba em `src/components/ai-agents/flow-builder/StepInspector.tsx` com um componente `StepKnowledgeCheckEditor.tsx`; checkbox `ack_ai` em `StepValidationEditor.tsx`. Tradução automática reaproveita `useAgentTranslate`.
- **Runtime**: novo módulo `supabase/functions/_shared/flow-kb-check.ts` (veredito + normalização) e `flow-ack.ts` (frase humanizada), ambos recebendo um `callLLM` injetado para usar a cascata resiliente já existente (`intake-llm.ts`) e a busca de KB de `whatsapp-webhook/lib/kb.ts` (extraída para `_shared` para o sandbox também usar).
- **Orquestração**: `whatsapp-webhook/lib/visual-flow.ts` e `ai-agent-sandbox/index.ts` chamam a checagem antes de `advanceFlow`, passando o valor normalizado; e o ack de IA via a opção `ack` já suportada pelo motor. `flow-engine.ts` ganha apenas o suporte a contagem de tentativas de KB no `flow_state` e o helper `kbCheckOf(step)`.
- **Logs**: `[VISUAL_FLOW][KB_CHECK]` / `[SANDBOX][KB_CHECK]` com etapa, veredito e motivo.
- **Testes**: casos Deno em `_shared` cobrindo válido / inválido / esgotou tentativas / falha do LLM, e etapa sem KB ligada (comportamento inalterado).
