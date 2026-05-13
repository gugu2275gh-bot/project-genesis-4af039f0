## Problema

Bot perguntou "Você esteve na Europa nos últimos 6 meses?" depois que o cliente já informou data de entrada na Espanha (20/04/2026 = ~3 semanas atrás). Pergunta redundante — se ele entrou na Espanha há menos de 6 meses, obviamente esteve na Europa.

## Regra desejada

Pular a pergunta "Europa últimos 6 meses" quando:
1. Cliente está **na Espanha agora** (`location_known = 'spain'`), **OU**
2. Cliente informou `entry_date_confirmed` e essa data está **dentro dos últimos 6 meses** (≤ 180 dias atrás).

Só perguntar se:
- Cliente está fora da Espanha **e** não há data de entrada recente, **ou**
- A data informada é **anterior a 6 meses** (ex.: 10/05/2025 com hoje em 13/05/2026).

## Mudanças

### `supabase/functions/whatsapp-webhook/index.ts` (~ linha 1705)

Bloco A (fora da Espanha), variável `askedEuropa`:

Adicionar helper local:
```ts
const entryDateInLast6Months = (() => {
  const d = funnelStateLive.entry_date_confirmed
  if (!d) return false
  const t = Date.parse(d)
  if (Number.isNaN(t)) return false
  const days = (Date.now() - t) / 86_400_000
  return days >= 0 && days <= 180
})()
const skipEuropaQuestion = userInSpain || entryDateInLast6Months
```

E tratar `askedEuropa` como satisfeito quando `skipEuropaQuestion === true`:
```ts
const askedEuropaEffective = askedEuropa || skipEuropaQuestion
```

Usar `askedEuropaEffective` em:
- `aprofundamentoDone = aIntro && askedIdade && askedEuropaEffective && askedFamiliar && askedRemoto && askedFormacao`
- Na cadeia de `instruction`: `!askedEuropaEffective ? '(A3) ...' : !askedFamiliar ? ...`

### `supabase/functions/whatsapp-webhook/lib/questions.ts > getOutsideSpainNextQuestion`

Receber também `entryDateConfirmed: string | null` e `locationKnown: string | null` como parâmetros opcionais; se algum implicar "já em Europa nos últimos 6 meses", pular para a próxima pergunta (familiar). Atualizar a única chamada (em `index.ts`, variável `outsideSpainNextQuestion`) para passar `funnelStateLive.entry_date_confirmed` e `funnelStateLive.location_known`.

### Sem migração

Mudança puramente lógica no edge function.

## Resultado

- Cliente disse "estou na Espanha desde 20/04/2026" → bot pula direto da idade para "familiar europeu/residente legal".
- Cliente está fora da Espanha sem data → bot pergunta normalmente.
- Cliente disse data antiga (10/05/2025) → bot pergunta normalmente.

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/whatsapp-webhook/lib/questions.ts`
