## O que aconteceu no fluxo do Roberto

### Mensagem suspeita (id 611)
```
Perfeito. Agora preciso entender como está sua situação aqui.
Perfeito. Já consigo ter uma visão inicial do seu caso.
```

A **segunda linha** é o H1 oficial do BPMN-v2 (`lib/questions.ts:311`).
A **primeira linha** **não existe em nenhum lugar do código** — foi **inventada pelo LLM** e ficou colada no H1 com `\n` em vez do delimitador `|||`.

### Por que o LLM conseguiu colar texto extra antes do H1

Na função `forceCorrectBlockQuestions` em `supabase/functions/whatsapp-webhook/lib/overrides.ts` (linhas 552-600):

```ts
const preamble = extractTextBeforeLastQuestion(aiResponse).trim()
const wrap = (replacement: string) => (preamble ? `${preamble}\n${replacement}` : replacement)
...
// no ramo BPMN-handoff (linhas 591-600):
const payload = buildPreHandoffPayload(language, { ... })
next = payload || ''
return lock(wrap(next))   // ← AQUI o preamble inventado pelo LLM é colado antes de H1
```

Sequência:
1. Cliente respondeu "Tenho" (última pergunta do bloco B = formação superior).
2. O LLM gerou algo como:
   *"Perfeito. Agora preciso entender como está sua situação aqui. <alguma pergunta extra>"*
3. O override detectou que o bloco B está completo e disparou `buildPreHandoffPayload` → `H1|||H2|||H3`.
4. `wrap()` colou o **preâmbulo do LLM** (a frase inventada) antes do payload, separado por `\n`.
5. O `split("|||")` no envio quebrou em 3 bolhas:
   - bolha 1 = `[preâmbulo inventado]\nH1` ← é o que o usuário viu como "resposta a uma pergunta B"
   - bolha 2 = H2
   - bolha 3 = H3

Tem ainda um efeito secundário (Roberto respondeu "Nao" a "Você está na Espanha?" mas o bot rodou todo o bloco-Spain). Esse é outro bug, **fora deste plano** — focando só na frase fantasma.

---

## Correção proposta

### 1. Não anexar preâmbulo do LLM ao payload de pré-handoff
Em `lib/overrides.ts:591-600`, substituir `wrap(next)` por `next` puro nesse caso específico. As 3 bolhas H1|||H2|||H3 são canônicas e devem sair sem nenhuma frase de transição inventada.

```ts
} else {
  const payload = buildPreHandoffPayload(language, { ... })
  if (!payload) return aiResponse
  return lock(payload)   // sem wrap() — H1|||H2|||H3 puros
}
```

### 2. Defesa adicional no caller
Em `supabase/functions/whatsapp-webhook/index.ts`, na seção em que `aiResponse` é processado, adicionar uma sanitização: se a resposta final contém `H2` ("visão inicial do seu caso") **e** algo antes dela separado por `\n` (não `|||`), descartar tudo antes de H1. Garante que regressões equivalentes em outros caminhos (ex.: paráfrase F4, KB-strict) também não emitam preâmbulo.

Helper a criar em `lib/overrides.ts`:
```ts
export function stripPreambleBeforePreHandoff(text: string): string {
  // Se H1 aparece no meio, descarta tudo antes dele.
  const idx = text.search(/Perfeito\. Já consigo ter uma visão inicial|Perfecto\. Ya puedo tener|Perfect\. I can already get|Parfait\. Je peux déjà avoir/i)
  if (idx > 0) return text.slice(idx)
  return text
}
```
Aplicado uma vez logo antes do `split('|||')` no envio (≈ `index.ts:2160`).

### 3. Testes
Adicionar caso em `bpmn3_handoff_test.ts`:
- Input simulado: `aiResponse = "Perfeito. Agora preciso entender como está sua situação aqui.\n<H1>|||<H2>|||<H3>"`
- Expectativa após sanitização: exatamente `H1|||H2|||H3` (3 bolhas, sem preâmbulo).

### Como validar depois do deploy
1. Reproduzir conversa similar (cliente fora da Espanha, completando bloco B).
2. Conferir em `mensagens_cliente` para o lead que as 3 últimas inserções `origem='IA'` correspondem **literalmente** aos textos canônicos de `getPreHandoffSummaryMessage` (H1, H2) e `getHandoffTransferMessage` (H3), sem nada extra colado.

## Itens fora deste plano
- Bug do bloco-Spain rodar para cliente que disse "Não está na Espanha" (problema na detecção `userInSpain`/`locationKnown`) — tratar em sessão separada se você confirmar.
- Latência (já otimizada na rodada anterior).
- Mensagens H1-H3 (texto canônico permanece igual).
