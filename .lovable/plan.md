## Contexto

A suíte `supabase/functions/whatsapp-webhook/` está em 470 passando / 15 falhando. Nenhuma falha vem da correção de duplicidade de saudação: todas são expectativas de testes escritas para o funil roteirizado antigo, que foi substituído por decisões de produto já aplicadas no código.

Evidências verificadas nesta sessão:
- `lib/flow-machine.ts` (linhas 91 e 295): comentário e transição confirmam que a etapa **EMAIL foi removida do onboarding** (NAME → LOCATION direto).
- `wave7_test.ts:111` exige pré-handoff em 2 bolhas (`|||`), enquanto o teste D4 do mesmo arquivo — que passa — exige handoff em bolha única (BPMN v2). Expectativas conflitantes.
- `scripted_dispatch_test.ts` valida o `insideIntro` e as perguntas A1–A6 do dispatch roteirizado, hoje substituído pelo fluxo visual configurável.

## Mapa das 15 falhas

| Arquivo | Falhas | Causa |
|---|---|---|
| `flow_machine_test.ts` | 2 | esperam etapa `EMAIL` |
| `offtopic_step_authority_test.ts` | 2 | classificação off-topic na etapa `email` |
| `turn_orchestrator_test.ts` | 5 | fluxo NAME → EMAIL → INTEREST |
| `scripted_dispatch_test.ts` | 5 | `insideIntro` / dispatch roteirizado |
| `wave7_test.ts` | 1 | pré-handoff em 2 bolhas |

## O que fazer

1. **`flow_machine_test.ts`** — reescrever os 2 casos para a progressão atual: `NAME → LOCATION → (INSIDE_ENTRY_DATE | OUTSIDE_AGE)`. Manter uma asserção explícita de que `EMAIL` nunca é retornado por `resolveCurrentStep`, para travar a regra "não perguntar e-mail".
2. **`turn_orchestrator_test.ts`** — trocar os 5 casos de etapa `email` por casos equivalentes na etapa `LOCATION` (resposta válida avança, resposta repetida faz reask, pergunta factual parqueia como off-topic), preservando a cobertura de comportamento sem depender da etapa extinta.
3. **`offtopic_step_authority_test.ts`** — mesma migração: os 2 casos passam a validar a autoridade da etapa `LOCATION`.
4. **`wave7_test.ts`** — ajustar o caso D3 `getOutsideSpainNextQuestion` para a expectativa de bolha única, coerente com o D4 (BPMN v2), removendo a asserção de `|||`.
5. **`scripted_dispatch_test.ts`** — os 5 casos cobrem um dispatch desativado. Verificar antes se `getInsideSpainNextQuestion`/`insideIntro` ainda são chamados em runtime por algum caminho de produção:
   - se ainda forem: corrigir as expectativas ao texto atual;
   - se forem código morto: remover o arquivo de teste junto com as funções órfãs, em um commit separado e identificado.
6. **Rodar a suíte completa** (`_shared/` + `whatsapp-webhook/`) e fechar em 0 falhas, sem alterar nenhum arquivo de produção fora do item 5.

## Fora de escopo

Nenhuma mudança de comportamento do agente, do fluxo visual ou do banco. Este trabalho é exclusivamente de alinhamento de testes; qualquer ajuste de produção fica limitado à remoção de código comprovadamente morto no item 5.
