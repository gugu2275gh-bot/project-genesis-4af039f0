## Objetivo

Deixar a suíte de testes do `whatsapp-webhook` 100% verde, corrigindo duas expectativas de texto que ficaram para trás depois de mudanças já aprovadas no funil legado. Nenhuma mudança de comportamento do atendimento.

## Diagnóstico (confirmado)

| Teste | Espera | Comportamento atual | Causa |
|---|---|---|---|
| `bpmn3_handoff_test.ts:195` — ramo B sem cidade | "Em qual cidade você **está** empadronado" | "Em qual cidade você **foi** empadronado?" | Texto de B5 reescrito em `lib/questions.ts:271` |
| `bpmn3_handoff_test.ts:278` — ramo A sem formação | "formação superior" | Repergunta sim/não de "Europa nos últimos 6 meses" | A6 (formação superior) removida do funil (`questions.ts:502`, `prompt-template.ts:80`) |

Em ambos os casos o gate `enforceBlockCompletion` age certo (logs `Forçando B4` e `bloco A incompleto`); só as strings esperadas envelheceram.

## Mudanças

1. **`supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts` (teste do ramo B)**
   - Trocar a asserção de string literal por uma verificação resistente a reescrita: conferir que a resposta contém "cidade" e "empadronado" (e continua sem "visão inicial"), em vez do texto exato "está empadronado".

2. **`supabase/functions/whatsapp-webhook/bpmn3_handoff_test.ts` (teste do ramo A)**
   - Renomear o teste para refletir a realidade ("ramo A incompleto → força a próxima pergunta A pendente") e ajustar o cenário: o transcript deixa uma pergunta A realmente pendente, e a asserção passa a exigir que o H1 seja bloqueado e que venha uma pergunta do bloco A — sem citar "formação superior", que não existe mais no funil.

3. **Unificar o texto de B5 (opcional, mas recomendado)**
   - `lib/overrides.ts:1760` ainda usa a versão antiga "Em qual cidade você **está** empadronado?", enquanto `lib/questions.ts:271` usa "**foi**". Fazer o `overrides.ts` reutilizar a função de `questions.ts` (ou alinhar o texto) para não existirem duas versões da mesma pergunta indo para o cliente.

## Validação

- Rodar a suíte completa do `whatsapp-webhook` e confirmar 0 falhas.
- Redeploy da função `whatsapp-webhook` apenas se o item 3 (unificação do texto) for aplicado.

## Detalhes técnicos

Os testes ficarão baseados em asserções semânticas (palavras-chave + bloqueio do H1) em vez de comparação literal de frase, para que futuras reescritas de copy não quebrem a suíte de novo.
