## Problemas

**Imagem 1 — duas perguntas no mesmo balão.** A B3 atual envia "Você está empadronado? Se sim, desde quando?" — viola "uma pergunta por vez". O cliente respondeu as duas ("sim, desde fevereiro"), mas a regra precisa valer para todo o funil.

**Imagem 2 — re-pergunta da cidade.** Bot perguntou "Em qual cidade você está empadronado?", cliente respondeu "barcelona", e o bot perguntou de novo. Causa raiz no `forceAdvanceFromEmpadronadoQuestion` (`lib/overrides.ts`): o regex `isQuestionAboutEmpadronado` casa tanto a pergunta original (B3) quanto a pergunta de cidade (B5), porque ambas contêm "empadron". Quando a `previousQuestion` é a própria B5 e o cliente responde "barcelona" (texto curto, < 60 chars, sem preposição+cidade na lista hardcoded), o override entra no ramo `msg.length < 60` e **re-emite a pergunta de cidade**.

## Correções

### 1. `lib/questions.ts` — separar perguntas

- `getEmpadronadoQuestion(language)` → apenas "Perfeito. Você está empadronado?" (sem "se sim, desde quando").
- Nova `getEmpadronamientoSinceQuestion(language)` → "Desde quando você está empadronado?".
- `getEmpadronamientoCityQuestion` mantém-se.

Sequência alvo do bloco:
1. B3 — empadronado? (yes/no)
2. Se SIM → B4 — desde quando?
3. → B5 — em qual cidade?
4. → Pré-Handoff
5. Se NÃO em B3 → Pré-Handoff direto

### 2. `lib/overrides.ts` — corrigir loop e encadear B3→B4→B5

Refatorar `forceAdvanceFromEmpadronadoQuestion` para distinguir as três perguntas do bloco em vez de tratar todas como "empadron":

- Detectores específicos: `isEmpadronadoYesNoQuestion`, `isEmpadronamientoSinceQuestion`, `isEmpadronamientoCityQuestion`.
- Lógica:
  - `previousQuestion` = B3 (yes/no):
    - resposta NÃO → não força (segue Pré-Handoff).
    - resposta SIM (ou texto curto não-negativo sem data) → força `getEmpadronamientoSinceQuestion`.
    - resposta contém data parseável (ex.: "sim, desde fevereiro de 2024") → força `getEmpadronamientoCityQuestion` (pula B4).
  - `previousQuestion` = B4 (desde quando) → força `getEmpadronamientoCityQuestion`.
  - `previousQuestion` = B5 (cidade) → **não força nada** (libera IA para Pré-Handoff). Esse é o fix do bug da imagem 2.
- Remover a lista hardcoded de cidades (`madrid|barcelona|...`) — frágil; passa a confiar no detector de pergunta para decidir o próximo passo.

### 3. `index.ts` — manter chamada existente

A integração no pipeline já existe (3 call sites). Apenas garantir que a função revisada é importada/chamada com a mesma assinatura.

### 4. Auditoria "uma pergunta por vez"

Varrer `lib/questions.ts` por strings com mais de um `?` ou conjunções "e/ou/se sim". Casos a normalizar:
- B3 (já listado acima).
- `getEntryDateNeedsYearQuestion` — verificar se contém duas perguntas; manter só a frase final com `?`.
- Prompts em `index.ts` que instruem o LLM ("aprofundamentoInstruction", "tira-dúvidas") — adicionar regra explícita: **"Faça SEMPRE uma única pergunta por mensagem. Nunca combine duas perguntas no mesmo turno."**

### 5. Testes

Em `funnel_persistence_test.ts`:
- B3 "sim" → próxima pergunta é "Desde quando…".
- B4 "fevereiro de 2024" → próxima é "Em qual cidade…".
- B3 "sim, desde fevereiro de 2024" → pula B4, próxima é cidade.
- B5 "barcelona" → override **não** re-emite cidade (regressão da imagem 2).
- B3 "não" → override no-op.

### 6. Deploy

Redeploy `whatsapp-webhook`.

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/lib/overrides.ts`
- `supabase/functions/whatsapp-webhook/index.ts` (apenas reforço de instrução de "uma pergunta por vez")
- `supabase/functions/whatsapp-webhook/funnel_persistence_test.ts`
