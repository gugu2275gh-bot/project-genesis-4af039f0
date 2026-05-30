## Diagnóstico

Log do turno do Roberto: `"Que és tie?"` (ES, etapa `email`) não disparou `[PARK]`/`[OFFTOPIC_SHORTCIRCUIT]`. Cliente recebeu apenas a repetição canônica do e-mail, sem o ACK *"Por favor, terminemos primero el registro básico..."*.

Causa raiz: `DEFINITION_QUESTION_RE` em `lib/offtopic.ts` e `FACTUAL_QUESTION_RE` em `lib/extract.ts` têm padrões rígidos que falham em variações ortográficas comuns nas 4 línguas suportadas (PT, ES, EN, FR):

- `\bqu[eé] es\b` exige verbo `es` literal — não casa `és` (acento de "Qué és tie?" do Roberto).
- Espaço literal não tolera múltiplos espaços, NBSP, ou casing misto.
- Falta cobertura para construções equivalentes nas demais línguas (ex.: `o que seria`, `what's`, `c'est quoi un`, `qué significa`, `o que significa`, `what does X mean`, `que veut dire`).
- `\b` em torno de caracteres acentuados é instável em JS regex sem flag `u`.

Como o regex falha, o curto-circuito `isPotentialInterestAnswer(raw)` (que casa keyword de serviço como "tie", "residencia", "nacionalidade", etc.) retorna `null` → não há parking → `INTEREST_CAPTURE` grava falso interesse → `[CANONICAL_SHORTCIRCUIT]` repete a pergunta da etapa sem o ACK.

## Objetivo

Garantir que **qualquer pergunta factual** (definição, significado, preço, requisitos, "como funciona") seja classificada como off-topic durante o pré-handoff, em **todas as 4 línguas**, antes de qualquer extração de interesse.

## Mudanças

### 1) `supabase/functions/whatsapp-webhook/lib/offtopic.ts`

Reescrever `DEFINITION_QUESTION_RE` como um conjunto de sub-padrões multi-idioma, com tolerância a acentos, espaços e contrações. Aplicar a flag `iu` (Unicode-aware).

```ts
// Cada subpadrão cobre uma das 4 línguas
const DEFINITION_QUESTION_RE = new RegExp(
  [
    // --- PT-BR ---
    String.raw`\bo\s+que\s+(?:é|e|sao|são|seria|significa|significam)\b`,
    String.raw`\bo\s+que\s+quer\s+dizer\b`,
    String.raw`\bquanto\s+custa\b`,
    String.raw`\bcomo\s+funciona\b`,
    String.raw`\bquais\s+(?:são|sao)\s+os\s+requisitos\b`,
    // --- ES ---
    String.raw`\bqu[eé]\s+[eé]s\b`,            // "qué es", "que es", "qué és", "que és"
    String.raw`\bqu[eé]\s+son\b`,
    String.raw`\bqu[eé]\s+significa(?:n)?\b`,
    String.raw`\bqu[eé]\s+quiere\s+decir\b`,
    String.raw`\bcu[aá]nto\s+cuesta\b`,
    String.raw`\bc[oó]mo\s+funciona\b`,
    String.raw`\bcu[aá]les\s+son\s+los\s+requisitos\b`,
    // --- EN ---
    String.raw`\bwhat(?:'?s|\s+is|\s+are|\s+does)\b`,
    String.raw`\bwhat\s+does\s+\S+\s+mean\b`,
    String.raw`\bhow\s+(?:does|do|much)\b`,
    String.raw`\bwhat\s+are\s+the\s+requirements\b`,
    // --- FR ---
    String.raw`qu['’]?est[- ]ce\s+que`,
    String.raw`c['’]?est\s+quoi`,
    String.raw`\bque\s+(?:veut|signifie)\s+dire\b`,
    String.raw`\bcomment\s+(?:fonctionne|ça\s+marche)\b`,
    String.raw`\bcombien\s+(?:ça\s+coûte|coûte)\b`,
  ].join('|'),
  'iu'
)
```

Fallback adicional: se a mensagem **termina com `?`** E contém keyword de serviço (`isPotentialInterestAnswer`) E é curta (≤ 6 palavras), tratar como pergunta factual sobre o serviço (ex.: "TIE?", "Residencia?", "Arraigo?") e parquear como `question`. Isso fecha qualquer brecha que o regex deixar.

```ts
const rawTrim = raw.trim()
if (DEFINITION_QUESTION_RE.test(rawTrim)) return { kind: 'question' }

// Pergunta curta terminada em '?' com keyword de serviço → factual question
if (/\?\s*$/.test(rawTrim) && isPotentialInterestAnswer(rawTrim) && rawTrim.split(/\s+/).length <= 6) {
  return { kind: 'question' }
}
```

Manter os guards seguintes (recusas, dados de cadastro, etc.) como estão.

### 2) `supabase/functions/whatsapp-webhook/lib/extract.ts`

Espelhar **exatamente** o mesmo `DEFINITION_QUESTION_RE` (extrair para constante exportada compartilhada, ou duplicar com mesmo conteúdo) em `FACTUAL_QUESTION_RE` para que `extractInterestFromMessage` retorne `null` em qualquer pergunta factual nas 4 línguas. Adicionar também a heurística "curta + `?` + keyword".

Preferência: exportar `isFactualQuestion(text: string): boolean` de `lib/offtopic.ts` e reusar em `extract.ts`, evitando duplicação.

### 3) `supabase/functions/whatsapp-webhook/index.ts`

Já existe (ou foi planejado) o guard `looksLikeFactualQuestion` antes de `INTEREST_CAPTURE` e do `DETERMINISTIC_PATCH`. Substituir essa regex local por uma chamada a `isFactualQuestion(rawCustomerMessage)` exportado de `lib/offtopic.ts`, garantindo paridade entre os 3 pontos (classifyOffTopic, extractInterestFromMessage, INTEREST_CAPTURE/DETERMINISTIC_PATCH).

### 4) Testes (`offtopic_definition_question_test.ts`)

Cobertura por idioma. Todos devem retornar `{ kind: 'question' }`:

```ts
// PT
"O que é TIE?", "O que seria arraigo?", "Quanto custa?", "Como funciona o NIE?", "O que significa empadronamiento?"
// ES (incluindo caso do Roberto)
"Qué es el NIE?", "Que es tie?", "Que és tie?", "Qué són los requisitos?", "Cuánto cuesta?", "Cómo funciona el arraigo?", "Qué significa TIE?"
// EN
"What is TIE?", "What's NIE?", "What are the requirements?", "How does arraigo work?", "How much does it cost?", "What does TIE mean?"
// FR
"Qu'est-ce que le TIE?", "C'est quoi le NIE?", "Combien ça coûte?", "Comment fonctionne l'arraigo?", "Que veut dire TIE?"
// Heurística "?" curta + keyword
"TIE?", "Arraigo?", "Residencia?"
```

E continuar retornando `null` (resposta válida) para:
```ts
"Residencia", "Nacionalidade", "Quiero residencia"  // sem '?' nem prefixo de definição
```

Novo teste em `extract.ts` (criar `extract_factual_question_test.ts`): `extractInterestFromMessage` retorna `null` para todos os exemplos acima.

### 5) Deploy & validação

- `deploy_edge_functions(["whatsapp-webhook"])`.
- `curl_edge_functions` simulando webhook em cada língua (PT/ES/EN/FR) com mensagem de definição contendo keyword de serviço; conferir nos logs:
  - `[PARK]` ou `[OFFTOPIC_SHORTCIRCUIT]` presente
  - Ausência de `[INTEREST_CAPTURE]`
  - Mensagem enviada inicia com o ACK localizado (`Por favor, vamos terminar... | Por favor, terminemos primero... | Please, let's finish... | S'il vous plaît, terminons...`) seguido de `|||` e da pergunta canônica da etapa atual.

## Fora do escopo

- Sem alterações em system prompt, RLS, schema, UI, ou outras edge functions.
- A frase de ACK em si já está correta nas 4 línguas (`getOffTopicAckPhrase`).
