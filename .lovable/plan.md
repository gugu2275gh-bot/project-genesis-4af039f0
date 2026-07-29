## O que aconteceu

O cliente mandou só "ola" e o agente respondeu "Faltou só uma informação: qual é a sua idade?" — pulando a pergunta de abertura.

Causa confirmada na leitura do código:

1. No primeiro turno (`whatsapp-webhook/lib/visual-flow.ts:199-208`) o nome do perfil do WhatsApp entra como dado já conhecido (`contact.full_name`).
2. Toda saída passa por `applyRequiredGate` (linha 193). Em `_shared/flow-required.ts:176`, o gate só deixa a pergunta aberta original sair quando **nenhum** campo obrigatório é conhecido (`anyKnown === false`). Como o nome do WhatsApp já preenche um obrigatório, `anyKnown` fica `true` e o gate troca a mensagem da etapa pela pergunta do próximo obrigatório em falta (idade).
3. Por isso a saudação + "me comente um pouco sobre você…" nunca foi enviada.

Configuração do fluxo no banco está correta (verificado): etapa `dados_pessoais` (PERGUNTA_GERAL) com obrigatórios nome/idade/cidade, etapa `objetivo` (PERGUNTA_GERAL) com obrigatório objetivo, e `transferencia` (HANDOFF).

Sobre a marcação de obrigatórios: ela **existe** (`StepGeneralCaptureEditor.tsx:81-92`), mas só aparece dentro da aba "Pergunta geral" e apenas depois de marcar o dado — daí a impressão de que não havia onde marcar. Também há um bug: ao desmarcar/remarcar um dado, o `required` é perdido (`toggle`, linha 32-37).

## Fluxo correto de "Conversa natural"

```text
"oi"            -> saudação + Pergunta geral 1 (dados pessoais)
resposta        -> aproveita tudo; se faltar obrigatório, pergunta 1 por vez
completos       -> Pergunta geral 2 (objetivo)
resposta        -> aproveita; se faltar obrigatório, pergunta
completos       -> transfere para humano

1ª msg já com dados -> saudação personalizada + só o que faltar
```
Regra central: **a pergunta da etapa é sempre feita pelo menos uma vez**; o mini-loop de obrigatórios só entra depois que o cliente respondeu àquela etapa.

## Mudanças

1. `_shared/flow-required.ts` — `applyRequiredGate` deixa de reescrever a mensagem quando a etapa ainda não foi apresentada. Novo critério: só age se o turno for uma repergunta (`turn.reasked`) ou se a etapa já foi apresentada nesta execução (marca `presented_steps` no estado). Dados vindos do perfil do WhatsApp deixam de contar como "já interagiu".
2. `_shared/flow-engine.ts` — registrar no `FlowRunState` quais etapas já enviaram sua pergunta (`presented_steps`), alimentado por `startFlow`/`startFlowWithPrefill`/`advanceFlow`.
3. `whatsapp-webhook/lib/visual-flow.ts` e `ai-agent-sandbox` — mesma regra nos dois pontos de entrada, para o sandbox reproduzir a produção.
4. `StepGeneralCaptureEditor.tsx` — preservar `required` e `prompts` ao remarcar um dado; mostrar um resumo "Obrigatórios: nome, idade, cidade" no topo da aba e um selo na aba/nó do canvas para o obrigatório ficar visível sem abrir cada dado.
5. Testes Deno: "oi" no fluxo Conversa natural entrega saudação + pergunta geral 1; resposta parcial pergunta só o que falta; 1ª mensagem completa pula direto para a etapa 2; nada em português quando o idioma é es/en/fr.

Sem alteração no fluxo salvo no banco — apenas motor, entrada e editor.