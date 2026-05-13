## Problema

Cliente respondeu `01/01/2026` (data válida — hoje é 13/05/2026). O bot achou impossível e pediu confirmação sugerindo `01/01/2023`. Causa: o LLM (Gemini) não recebe a data atual no prompt da etapa conversacional, então usa o conhecimento do seu treinamento e trata 2026 como futuro.

## Mudanças

### 1. `supabase/functions/whatsapp-webhook/index.ts`
- No início do system prompt do agente conversacional (perto da linha 1240, antes do bloco `## OBJETIVOS`), injetar dinamicamente:
  ```
  Hoje é ${new Date().toISOString().slice(0,10)} (use SEMPRE essa referência ao avaliar datas; NUNCA assuma que um ano é "futuro" só com base no seu conhecimento de treinamento).
  ```
- Na instrução do passo "data exata da entrada na Espanha" (linha 1273-1274), adicionar regra explícita:
  - A data informada deve ser **anterior ou igual a hoje**. Se for futura em relação a hoje, peça confirmação. Se for passada (mesmo que recente, como há poucos meses), **aceite sem questionar** o ano.
  - Não sugira anos alternativos baseados em suposição própria.

### 2. `supabase/functions/whatsapp-webhook/lib/extract.ts`
- Reforçar (a referência `today` já existe na linha 137) que para `spain_arrival_date`, datas no passado próximo são válidas e não devem ser reinterpretadas como erro de digitação.

## Resultado

- `01/01/2026` (passado) → aceito sem perguntar.
- `01/01/2027` (futuro) → bot pede confirmação de forma neutra (sem sugerir um ano específico inventado).
- `20/04` sem ano → continua pedindo o ano completo (regra existente preservada).

Sem mudança de UI, sem mudança de schema — apenas prompt do edge function `whatsapp-webhook`.
