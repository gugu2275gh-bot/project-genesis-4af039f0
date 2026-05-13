## Plano: suite de testes pós-correções pré-handoff

Criar 3 arquivos de teste cobrindo as correções já implementadas (B4 persistido, idempotência A1/B1, anti-repeat Msg3/Msg4/Msg7) e executar via `supabase--test_edge_functions`.

### Arquivos novos

**1. `supabase/functions/whatsapp-webhook/preamble_idempotency_test.ts`**
- A1 ramo outside: 1ª chamada de `forceCorrectBlockForLocation` emite preâmbulo "Entendido. Então seguimos…" e seta `a1_scenario_sent`; 2ª chamada (com flag true) omite preâmbulo e vai direto pra A2.
- B1 ramo spain: idem com `b1_situation_sent` e pergunta de data de entrada.
- Verificar 4 idiomas (pt-BR, es, en, fr).

**2. `supabase/functions/whatsapp-webhook/empadronado_since_persistence_test.ts`**
- `extractEmpadronadoSincePatch` extrai data quando `prevQ` é B4 e resposta é parseável ("desde março de 2024", "15/03/2024", "há 2 meses").
- Retorna `empadronado_since` no patch + `b4_empadronado_since` flag em `outside_spain_progress`.
- Cenário com texto não-parseável grava raw text mas não data.
- `enforceBlockCompletion` libera H1 quando flag `b4_empadronado_since` true mesmo com transcript truncado.

**3. `supabase/functions/whatsapp-webhook/anti_repeat_msg3_msg4_msg7_test.ts`**
- `preventRepeatedCanonicalQuestion` substitui repergunta de nome (Msg3) por Msg4 quando `nameKnown=true`.
- Substitui repergunta de email (Msg4) por Msg7 quando `emailKnown=true`.
- Substitui paráfrase de localização ("ainda no Brasil?", "where are you currently?") quando `locationKnown` setado.
- 4 idiomas.

### Execução

`supabase--test_edge_functions` com `functions: ["whatsapp-webhook"]` rodando suite completa. Reportar resultado integral (pass/fail counts + falhas com stack se houver) e corrigir bugs encontrados nas implementações anteriores se algum teste falhar.

### Detalhes técnicos

Os helpers já existentes a serem importados:
- `forceCorrectBlockForLocation`, `enforceBlockCompletion`, `preventRepeatedCanonicalQuestion`, `extractEmpadronadoSincePatch` de `lib/overrides.ts`
- `getOutsideSpainAgeQuestion`, `getEmpadronamientoSinceQuestion` de `lib/questions.ts`
- `mergeOutsideProgress`, tipo `OutsideProgress` de `lib/funnel-state.ts`

Padrão segue `bpmn3_handoff_test.ts` (assertEquals/assertStringIncludes do std@0.224.0).
