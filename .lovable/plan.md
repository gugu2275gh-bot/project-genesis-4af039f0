## Diagnóstico (confirmado nos logs e no banco)

Turno de 26/07 19:22, lead `8de53dd1…` ("o que é tie"):

1. **A KB foi consultada, mas trouxe o conteúdo errado.** Log: `[KB] Semantic returned 2 chunks. Top3: OK - Estancia por estudos.pdf#2=0.367 | OK - Arraigo Sociolaboral.pdf#3=0.317` — nenhum trecho sobre TIE. No banco existem **18 chunks ativos que mencionam TIE**, todos com embedding. Causa: a query enviada é curtíssima (`len=32`, praticamente só "o que é tie"), o limiar de similaridade é `0.3` e a sigla "TIE" tem sinal semântico fraco no `text-embedding-3-small`; não há fallback léxico quando o resultado semântico existe mas é irrelevante (o código só cai no léxico se o semântico retornar **zero** chunks — `whatsapp-webhook/lib/kb.ts:156-182`).
2. **Como a KB veio irrelevante e `kb_strict_mode = false`**, o modelo respondeu com conhecimento próprio (por acaso correto, mas sem fonte).
3. **A resposta saiu cortada** ("…autorização de residência ou"): o log mostra `gemini/gemini-3.6-flash` em 429 → fallback `gemini-3-flash-preview` com `maxOutputTokens: 700`, mas **sem `thinkingConfig` (só aplicado a `gemini-2.*`)** — o raciocínio consome o orçamento e a saída é cortada em `MAX_TOKENS` (`length: 110`).

## Correções propostas

### 1. Recall da base de conhecimento (`whatsapp-webhook/lib/kb.ts`)
- Rodar **busca híbrida sempre**: semântica + léxica, mesclando e deduplicando por `file_name#chunk_index`, em vez de usar a léxica só quando a semântica retorna vazio.
- Baixar o limiar semântico para `0.2` e aumentar `match_count` para 12, mantendo o corte final por tamanho de contexto.
- Melhorar o score léxico: reconhecer **siglas/termos curtos** (TIE, NIE, TIS, EX-17) com match exato em maiúsculas (hoje o filtro `w.length > 2`/`> 3` descarta boa parte) e dar peso alto quando a sigla aparece no `file_name` ou no conteúdo.
- Logar quantos chunks vieram de cada via (`[KB] semantic=X lexical=Y merged=Z`).

### 2. Truncamento da resposta (`whatsapp-webhook/lib/ai.ts`)
- Aplicar `thinkingConfig: { thinkingBudget: 0 }` também para Gemini 3.x (a família aceita o campo; hoje só entra em `gemini-2.*`).
- Subir `maxOutputTokens` de 700 para 1200 no modo pós-handoff.
- Detectar `finishReason === 'MAX_TOKENS'` e, nesse caso, tentar o próximo modelo da cascata em vez de enviar texto cortado.
- Rede de segurança final: se o texto terminar sem pontuação de fim de frase, cortar a última frase incompleta antes de enviar.

### 3. (Opcional, recomendo) Rate limit do Gemini
O modelo primário `gemini-3.6-flash` está batendo cota gratuita (20 req/dia). Sugiro trocar o primeiro item da cascata em Configurações > LLM para um provedor sem esse teto (Lovable AI Gateway), mantendo Gemini como fallback.

## Verificação
- Reexecutar a pergunta "o que é tie" no sandbox e conferir no log que os chunks retornados são do documento de TIE.
- Conferir que a resposta chega completa (frase terminada) com o sufixo de "aguarde um especialista".
- Rodar a suíte de testes existente das edge functions.
