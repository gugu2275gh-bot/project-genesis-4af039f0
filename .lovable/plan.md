# Corrigir gravação de `entry_date_confirmed`

## Causa raiz

Caso real do lead `03c8d6d1-dd78-4d07-8be2-5ef9aa91d8c7` (Roberto Barros): cliente respondeu `01/01/2026` à pergunta de data de entrada, o bot avançou pra "¿Estás empadronado?", mas `lead_funnel_state.entry_date_confirmed` ficou `null`.

A pergunta enviada foi:
```
…¿Cuál fue la fecha exacta de tu entrada en España? Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025).?
```

Note o `.?` final (um `?` extra foi anexado pelo formatador após o `.` da frase auxiliar).

`computeDeterministicFunnelPatch` chama `extractLastQuestion(previousAssistantMessage)`, cujo regex `/[^?\n]*\?/g` separa o texto em dois trechos terminados em `?`:
1. `…¿Cuál fue la fecha exacta de tu entrada en España?`
2. `Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025).?`

`.at(-1)` retorna o segundo. Esse segmento NÃO contém "España"/"entrada", então `isQuestionAboutSpainEntryDate(prevQ)` retorna `false` e o branch que grava `entry_date_confirmed` é pulado. O fluxo avança (porque outras camadas detectam a data), mas o valor não é persistido.

O mesmo padrão já foi tratado para localização: o código (overrides.ts:86-87) faz fallback testando a `previousAssistantMessage` inteira além do `prevQ`. Isso não foi replicado para a etapa de data.

## Mudanças

### 1. `supabase/functions/whatsapp-webhook/lib/overrides.ts`
No bloco "Data de entrada" (linha 113-117), substituir o gate por uma verificação que aceite a pergunta tanto via `prevQ` quanto via varredura da mensagem completa do assistente, espelhando o padrão usado para localização:

```ts
// Data de entrada
const prevHasEntryDateQ = isQuestionAboutSpainEntryDate(prevQ)
  || isQuestionAboutSpainEntryDate(String(previousAssistantMessage || ''))
if (prevHasEntryDateQ) {
  const parsed = parseEntryDateFromText(msg)
  if (parsed && !parsed.isFuture) patch.entry_date_confirmed = parsed.iso
}
```

`isQuestionAboutSpainEntryDate` já normaliza e valida tokens; aplicá-la à mensagem inteira é seguro e elimina a dependência do `extractLastQuestion` retornar o segmento canônico.

### 2. `supabase/functions/whatsapp-webhook/lib/text-utils.ts`
Tornar `extractLastQuestion` mais robusto contra esse caso, preferindo segmentos que contenham `¿`/`?` reais de pergunta sobre fragmentos terminados em `.?`:

- Se houver múltiplos matches, preferir o último que comece com `¿` (Espanhol) OU que termine em ` ?` / `?` sem `.` imediatamente antes do `?`.
- Caso contrário, manter o comportamento atual (último match).

Isso protege outros call sites que dependem do mesmo helper (`isQuestionAboutInterest`, dedup, etc.).

### 3. `supabase/functions/whatsapp-webhook/compound_message_test.ts` (ou novo `entry_date_persistence_test.ts`)
Adicionar testes Deno cobrindo exatamente o caso real:

- `computeDeterministicFunnelPatch('…¿Cuál fue la fecha exacta de tu entrada en España? Por favor, envíala en el formato DD/MM/AAAA (ejemplo: 22/05/2025).?', '01/01/2026')` deve retornar `{ entry_date_confirmed: '2026-01-01' }`.
- Mesmo teste para PT-BR (mensagem equivalente em português) com `'01/01/2026'`.
- Garantir que `extractLastQuestion` no caso `'¿Cuál fue la fecha exacta de tu entrada en España? Algo más.?'` retorna o segmento da pergunta de entrada.

### 4. Backfill do lead afetado
Após o deploy, executar uma migration ou query manual para atualizar `lead_funnel_state.entry_date_confirmed = '2026-01-01'` do lead `03c8d6d1-dd78-4d07-8be2-5ef9aa91d8c7` (Roberto Barros), já que o dado existe no histórico mas não foi persistido. Confirmar com o usuário se deseja esse backfill agora.

### 5. Deploy
Redeploy de `whatsapp-webhook` após os testes passarem.

## Fora de escopo
- Não alterar onde o `?` extra é anexado à pergunta (sintoma do formatador). A correção principal torna o pipeline imune a esse problema.
- Não mexer em outras etapas do funil (interesse, localização, empadronado) — só a etapa de data está com bug.

## Validação
- Rodar `entry_date_persistence_test.ts` no Deno test runner.
- Simular novo lead respondendo `01/01/2026` e conferir `lead_funnel_state.entry_date_confirmed` populado.
- Verificar logs `[DET_PATCH]` mostrando `entry_date_confirmed` no patch.
