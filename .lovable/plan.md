## Problema

Pergunta atual é disjuntiva e ambígua:
> "Hoje você já está na Espanha ou ainda está em outro país?"

"Sim", "já", "ainda não" não definem qual lado.

## Solução

Trocar por uma pergunta **fechada (sim/não)** sobre Espanha. Se não, deduzir logicamente que está em outro país — sem precisar perguntar de novo, sem números.

### Novo texto

- **PT:** "Perfeito. Hoje você já está na Espanha?"
- **ES:** "Perfecto. ¿Hoy ya estás en España?"
- **EN:** "Perfect. Are you already in Spain today?"
- **FR:** "Parfait. Êtes-vous déjà en Espagne aujourd'hui ?"

### Lógica determinística

Em `supabase/functions/whatsapp-webhook/index.ts` (linhas ~1587-1615), o parser de localização passa a interpretar a resposta como sim/não:

- Resposta afirmativa (`sim`, `si`, `yes`, `já`, `ya`, `estou`, `aqui`, "estou em Madrid", menção a cidade espanhola) → `userInSpain = true` → `location_known = 'spain'`.
- Resposta negativa (`não`, `no`, `ainda não`, `todavía no`, "estou no Brasil/Portugal/etc.", menção a outro país) → `userOutsideSpain = true` → `location_known = 'outside'`. **Não pergunta "em qual país?" aqui** — segue direto para o próximo bloco do funil (idade/Europa/etc.). Se em algum momento futuro o país de origem for relevante, será capturado naturalmente em outra etapa.
- Resposta ambígua/irrelevante → bot repete a pergunta yes/no UMA vez.

### Mudanças concretas

1. **`lib/questions.ts > getLocationQuestion`** (linhas 112-117) — substituir os 4 idiomas pelos textos acima.

2. **`index.ts > locQuestionRe`** (linha 1589) e **`localizacaoAsked`** (linhas 1664-1665) — atualizar regex para reconhecer a nova pergunta:
   - PT: `/hoje voc[êe] j[áa] est[áa] na espanha\??$/i` (e similar para ES/EN/FR)
   - Manter o regex antigo como fallback para conversas em andamento que já receberam a pergunta antiga.

3. **Parser de resposta** (linhas 1604-1615) — manter o que já existe (`sim`/`não`/`estou`/`brasil`/etc.) que já cobre o cenário sim/não corretamente. Só revisar a ordem para garantir que `não` puro vire `userOutsideSpain` antes de qualquer match de "Espanha" mencionada na frase.

4. **Instrução do passo no prompt** (`steps.push({ key: 'localizacao', ... instruction })` por volta de linha 1670+) — atualizar a instrução para a IA não voltar a usar a pergunta antiga: "Pergunte APENAS: 'Hoje você já está na Espanha?'. Se a resposta for negativa, NÃO pergunte em qual país está — siga direto para o próximo bloco (cenário fora da Espanha)."

5. **Override defensivo em `lib/overrides.ts`** — se a IA gerar texto contendo "ou ainda está em outro país" / "o todavía está en otro país" / "or still in another country", substituir pela versão sim/não correspondente. Rede de segurança contra regressão do prompt.

## Resultado

- Pergunta clara, sem disjunção, fácil de responder.
- "Não" → automaticamente entendido como "está em outro país", sem nova pergunta redundante.
- Lógica de funil avança normalmente para o bloco "fora da Espanha".

## Arquivos afetados

- `supabase/functions/whatsapp-webhook/lib/questions.ts`
- `supabase/functions/whatsapp-webhook/index.ts` (regex, instrução do passo, parser ordering)
- `supabase/functions/whatsapp-webhook/lib/overrides.ts` (sanitização)
