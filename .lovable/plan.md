## Problema

Ao duplicar o "AGENTE 1.0" aparece:
`duplicate key value violates unique constraint "ai_agents_single_production_idx"`

Causa confirmada: em `src/hooks/useAIAgents.ts` (`useDuplicateAgent`), a cópia reaproveita todos os campos do agente original, incluindo `is_production: true`. Como existe um índice único que permite apenas um agente de produção, o insert falha.

## Correção

Em `src/hooks/useAIAgents.ts`, no `useDuplicateAgent`:
- Forçar `is_production: false` na cópia (a cópia nasce como RASCUNHO, nunca como agente de produção).
- Descartar também campos que não devem ser herdados na duplicação (ex.: `production_synced_at`, se existir), mantendo o resto da configuração (prompts, blocos, modelo, cascata, fluxos referenciados).

Comportamento resultante: a duplicação cria "AGENTE 1.0 (cópia)" em RASCUNHO, sem afetar o agente ativo em produção.
