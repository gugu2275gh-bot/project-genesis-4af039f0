## Problema

Mesmo com a data de hoje injetada no prompt, o Gemini ainda respondeu "Essa data parece no futuro, você pode confirmar?" para `01/01/2026` (que é passado em relação a 13/05/2026). Instruções em prosa não são confiáveis — o modelo continua aplicando o viés do seu cutoff de treinamento.

## Solução: validação determinística no código (não confiar no LLM)

Fazer a comparação passado/futuro em código TypeScript antes de chamar o Gemini. Quando estivermos no passo "data de entrada na Espanha" (Bloco B2) e a última mensagem do cliente for uma data válida, decidir no servidor:

- **Data válida no passado (≤ hoje):** persistir em `entry_date_confirmed`, marcar B2 como concluído e injetar instrução forçada: "DATA JÁ CONFIRMADA pelo sistema (`YYYY-MM-DD`). NÃO peça confirmação. NÃO mencione 'futuro'. Apenas dê uma confirmação curta natural ('Anotado.') e siga IMEDIATAMENTE para a próxima pergunta do bloco (B3 empadronamento)."
- **Data no futuro:** instrução forçada: "A data informada (`YYYY-MM-DD`) é POSTERIOR a hoje (`YYYY-MM-DD`). Peça confirmação neutra, sem sugerir ano alternativo."
- **Data sem ano ou ambígua:** instrução forçada: "Falta o ano. Peça a data completa com dia, mês e ano."

Assim, mesmo se o Gemini "achar" que 2026 é futuro, ele recebe um fato determinístico que sobrepõe seu palpite.

## Mudanças

### `supabase/functions/whatsapp-webhook/index.ts`
- Adicionar helper `parseUserDate(text)` que tenta extrair uma data em formatos comuns (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `D de mês de YYYY` em pt/es/en) e retorna `{ iso, hasYear }` ou `null`.
- Antes do bloco do passo `aprofundamento` (linha ~1694), quando `userInSpain && !askedEmpadronado && askedEntryDate` (ou seja, acabamos de fazer B2 e a última msg do cliente deve ser a data) **OU** quando `userInSpain && !funnelStateLive.entry_date_confirmed`, processar a última mensagem do usuário:
  - Se `parseUserDate` retornar data com ano e ela for ≤ hoje → fazer `update` em `whatsapp_funnel_state.entry_date_confirmed` e construir instrução "data já validada, apenas siga para empadronamento (B3)".
  - Se for > hoje → instrução "peça confirmação neutra".
  - Se sem ano → instrução "peça data completa".
- Substituir `aprofundamentoInstruction` quando essa validação determinística disparar, para que ela tenha prioridade sobre a instrução genérica.

### Sem mudanças em `extract.ts` ou `questions.ts`
A regra antiga continua valendo como fallback. A nova lógica é uma camada determinística antes do LLM.

## Resultado esperado

- `01/01/2026` (hoje 13/05/2026) → sistema grava data, bot responde algo curto e já pergunta sobre empadronamento. **Nunca mais** menciona "no futuro".
- `01/01/2027` → bot pede confirmação neutra.
- `20/04` sem ano → bot pede ano completo.

Sem mudança de UI, sem mudança de schema. Apenas o edge function `whatsapp-webhook`.
