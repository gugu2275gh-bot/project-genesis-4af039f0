## Problema

O aviso âmbar "Esta etapa faz uma pergunta, mas não é do tipo 'Pergunta'…" aparece em etapas do tipo **Pergunta geral**, o que é incorreto: no motor de execução (`supabase/functions/_shared/flow-engine.ts`, linha 275) `PERGUNTA_GERAL` é normalizado para `PERGUNTA`, ou seja, o agente **espera a resposta** normalmente e ainda interpreta o texto para preencher campos.

A causa é a condição do alerta, que compara apenas com `'PERGUNTA'` e ignora `'PERGUNTA_GERAL'`, em dois lugares:
- `src/components/ai-agents/flow-builder/StepInspector.tsx` (linha 154)
- `src/components/ai-agents/FlowsManagement.tsx` (linha 166)

## Correção

1. **StepInspector.tsx**: trocar `kind !== 'PERGUNTA'` por uma verificação que considere ambos os tipos interativos (já existe a variável `isQuestion` na linha 56) — exibir o alerta somente quando `!isQuestion`.
2. **FlowsManagement.tsx**: ajustar a mesma condição para não alertar quando `step_kind` for `PERGUNTA` **ou** `PERGUNTA_GERAL`.

Nenhuma mudança de lógica de execução do fluxo é necessária — apenas o aviso da interface.
