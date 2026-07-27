## Objetivo

Nas etapas cujo tipo de resposta é **Nome**, permitir escolher entre:
- **Nome completo obrigatório** (comportamento atual: exige 2+ palavras)
- **Aceitar nome simples** (só o primeiro nome já vale)

A escolha também vale para a análise da **primeira mensagem do cliente**: se o nome extraído já satisfaz a regra da etapa, a pergunta do nome não é repetida.

## Como fica no editor

Na aba de validação da etapa (visível apenas quando "Tipo de resposta esperada" = Nome), um seletor:
- "Exigir nome completo (nome e sobrenome)" — padrão, mantém os fluxos atuais
- "Aceitar nome simples (só o primeiro nome)"

## Mudanças técnicas

1. `src/types/ai-agent-flow-builder.ts`
   - Novo campo em `StepValidation`: `name_mode?: 'COMPLETO' | 'SIMPLES'` (ausente = `COMPLETO`).

2. `src/components/ai-agents/flow-builder/StepValidationEditor.tsx`
   - Novo `Select` renderizado só quando `answerType === 'NOME'`, gravando `name_mode`.

3. `supabase/functions/_shared/flow-engine.ts`
   - `validateAnswer`, caso `NOME`: com `name_mode === 'SIMPLES'`, aceitar 1 palavra alfabética (≥2 letras); caso contrário manter a exigência de 2+ palavras.
   - Prefill da primeira mensagem (`startFlowWithPrefill`): só considerar a etapa de nome já respondida se o valor extraído passar na mesma regra da etapa — assim, com "nome simples", "Sou o Pedro" já pula a pergunta; com "nome completo", um primeiro nome isolado mantém a pergunta.

4. Testes
   - Casos novos em `supabase/functions/_shared/flow_intake_test.ts` / `flow_turn_test.ts`: nome simples aceito, nome simples rejeitado no modo completo, e pular/não pular a etapa via prefill.

## Observações

- Nada muda em fluxos existentes: sem o campo, o comportamento permanece "nome completo".
- Redeploy das funções `whatsapp-webhook` e `ai-agent-sandbox` após a alteração do motor.
