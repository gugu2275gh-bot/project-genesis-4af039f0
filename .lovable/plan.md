# Auto-preencher `location_known='spain'` a partir do opener

Objetivo: quando a cliente afirmar espontaneamente que **está/mora/vive na Espanha** (sem que a pergunta canônica tenha sido feita), gravar `location_known='spain'` automaticamente, registrar rastreio via `override_applied`, e no próximo turno confirmar de leve em vez de re-perguntar cru.

Nunca auto-preenche `outside` (falso negativo é pior — bloqueia serviços válidos).

## Escopo por arquivo

### 1. `supabase/functions/whatsapp-webhook/lib/questions.ts`
Adicionar `detectSpainResidenceClaim(text)` — regex conservador multilíngue que só casa presente + verbo de residência + Espanha/cidade ES. Retorna `{ matched: boolean, evidence: string }`.

Padrões aceitos (whitelist, presente do indicativo):
- **PT:** `estou (aqui )?(na |em )espanha`, `moro (na |em )espanha`, `vivo (na |em )espanha`, `estou em <cidade ES>`, `moro em <cidade ES>`, `vivo em <cidade ES>`, `to[u]? (na |em )espanha`, `resido (na |em )espanha`
- **ES:** `estoy en españa`, `vivo en españa`, `resido en españa`, `me encuentro en españa`, `estoy en <ciudad>`, `vivo en <ciudad>`
- **EN:** `i(')?m (currently )?in spain`, `i live in spain`, `i(')?m living in spain`, `i reside in spain`, `i(')?m in <city>`
- **FR:** `je suis (actuellement )?en espagne`, `j'habite en espagne`, `je vis en espagne`, `je réside en espagne`

Rejeitados explicitamente (retorna false):
- Tempo passado: `estive`, `estava`, `fui`, `morei`, `vivi`, `was in`, `used to live`, `j'étais`
- Futuro/intenção: `vou (para|pra)`, `quero ir`, `penso em ir`, `voy a`, `quiero ir`, `i want to go`, `i'm going to`, `je vais`
- Terceiros: `minha família (está|mora) na espanha`, `mi familia vive en españa`, etc.
- Menções condicionais: `se eu for`, `quando eu chegar`, `if I go`

Usar cidades de `spanish-cities.json` para a variante "estou em <cidade>".

### 2. `supabase/functions/whatsapp-webhook/lib/overrides.ts` (`computeDeterministicFunnelPatch`)
Após o bloco `prevHasLocationQ` (linha 91), adicionar bloco novo:

```
// Auto-detecção conservadora: cliente declara espontaneamente que está na Espanha.
// Só aciona quando location ainda NÃO foi perguntada/confirmada nem gravada como outside.
// Nunca auto-marca 'outside' — apenas 'spain' com sinais fortes de presente.
if (patch.location_known === undefined) {
  const claim = detectSpainResidenceClaim(msg)
  if (claim.matched) {
    patch.location_known = 'spain'
    ;(patch as any).__location_source = 'auto_opener_claim'
    ;(patch as any).__location_evidence = claim.evidence
  }
}
```

### 3. Local de chamada de `computeDeterministicFunnelPatch` em `index.ts`
Onde o patch é aplicado via `applyTurnUpdates`, ler `__location_source` e passar `override_applied: 'auto_location_spain_from_opener'` no `meta`. Remover os campos `__*` do patch antes do UPDATE (não são colunas). Logar `[AUTO_LOCATION] spain from "<evidence>"`.

Guard extra: só aplica se `state.location_known === null` (não sobrescreve nada já confirmado, nem downgrade — `applyTurnUpdates` já bloqueia downgrade, mas explicitar aqui evita ruído no log).

### 4. Confirmação leve no próximo turno
Em vez de deixar o LLM pular direto para "Qual a data de entrada?", injetar uma diretiva no prompt quando `state.location_known === 'spain'` **e** foi marcada por auto-detecção neste turno (flag transitória `justAutoDetectedSpain` em `ConversationContext`).

Diretiva (nos 4 idiomas) inserida em `buildStateDirective` ou no bloco de prompt do ramo Inside:

- **PT:** "A cliente mencionou que está na Espanha. Confirme de leve E já pergunte a data de entrada NA MESMA frase. Ex.: 'Perfeito, então você já está morando na Espanha, certo? Me conta desde quando chegou.'"
- **ES / EN / FR:** equivalentes.

Isso mantém a regra "uma pergunta por vez" (a confirmação é declarativa + 1 pergunta), evita re-perguntar cru, e dá à cliente chance de corrigir se detectamos errado.

### 5. Testes — `supabase/functions/whatsapp-webhook/location_autodetect_test.ts` (novo)
Cobrir:
- ✅ Positivos PT/ES/EN/FR: "estou na Espanha", "moro em Madrid", "estoy en España", "vivo en Barcelona", "I'm in Spain", "je suis en Espagne", "j'habite à Valencia"
- ❌ Negativos (não devem marcar): "estive na Espanha ano passado", "quero ir pra Espanha", "minha família mora na Espanha", "vou pra Madrid mês que vem", "used to live in Spain", "je vais en Espagne"
- ❌ Nunca marca `outside` por auto-detecção
- ✅ Não sobrescreve `location_known` já confirmado
- ✅ Registra `override_applied` correto

## Fora de escopo
- Detecção de cidade específica para preencher `empadronado_city` (etapa separada, não pedido aqui).
- Alterações no ramo Outside.
- Mudança nas travas existentes de anti-downgrade / hard-lock de localização.
