# Diagnóstico do agente WhatsApp — 12/05, baseado em conversas reais

Análise das 3 conversas das últimas 24h: **Gustavo Braga** (lead `efa19624`), **Fred William** (`8bff00ce`), **Agência Liga** (`08c136ca`). O handoff humano (F6) foi corrigido e está coberto por testes. Os 7 sintomas restantes seguem ativos.

## Falhas confirmadas nesta semana

### F3 — Reinício do funil quando cliente diverge (CRÍTICO)
**Gustavo, 00:36:** após o levantamento todo, cliente diz `"nunca fui"` à pergunta de data de entrada na Espanha. IA responde:
> "Antes de tudo, como é seu nome completo?"
Reiniciou o funil do passo 1, ignorando nome, email, interesse, idade e tudo já confirmado.

**Agência Liga, 12:20:** após cliente confirmar interesse em "Curso del idioma", IA volta a perguntar:
> "Antes de todo, ¿cómo es tu nombre completo?"

### F7 — Alucinação de elegibilidade (CRÍTICO)
**Gustavo, 00:46:** cliente disse `"em outro pais"` e `"nunca fui"`. Mesmo assim, IA explicou "Autorização de Regresso", documento que **só existe para quem reside legalmente na Espanha**. KB não considera o `funnel-state` (`location_known='outside'`) ao responder.

### F2 — Saltos no funil (ALTO)
**Fred, 12:13:** após responder só `"20 de abril"` (entrada) e `"Não"` (empadronamento), IA disparou:
> "Já consigo ter uma visão inicial do seu caso."
Pulou idade, formação, Europa nos últimos 6 meses, família europeia e trabalho remoto. `funnel-state` deduz "completo" cedo demais.

**Gustavo, 00:45:** após responder formação `"nao"`, IA fechou levantamento sem confirmar profissão, idioma, situação atual.

### F4 — Catálogo enlatado repetido em turnos consecutivos (MÉDIO)
**Fred, 12:08 e 12:11:** texto idêntico
> "Trabalhamos com cidadania espanhola, nômade digital, residências, NIE, TIE..."
disparado duas vezes seguidas.

**Agência Liga, 12:17 e 12:18:** mesmo bloco repetido.

### F5 — Leak de idioma mid-conversa (MÉDIO)
**Agência Liga:** abriu em ES, depois cliente escreve em PT (`"Já me fez esta pergunta"`, `"Tbem já me perguntou isto"`). IA continua respondendo só em ES. `language.ts` não re-detecta a cada turno.

### F1 — Re-pergunta nome já confirmado (MÉDIO)
**Gustavo, 00:44:** contato já tem `full_name='Gustavo Braga'` com `name_source='STAFF_EDITED'`. IA aceita `"gustavo"` (1 token) e segue, mas no histórico anterior já havia perguntado nome de novo após "nunca fui". `findExplicitFullNameAnswer` exige 2+ tokens — o pin do `funnel-state` não está sendo usado quando o contato já tem nome STAFF_EDITED.

### F8 — Histórico (não observado nesta amostra mas estrutural)
`getConversationHistory` (linha 211) lê só `mensagem_cliente` e `mensagem_IA`. Mensagens de atendente humano com `origem='SISTEMA'` ficam armazenadas em `mensagem_IA` sem distinção — o LLM não sabe que foi humano falando, e o corte de 48h apaga o funil em curso sem preservar `funnel-state`.

## Plano de correção definitiva (Wave 5)

Tudo é aditivo, sem migration, sem novo provider, sem mudar prompt-base. Cobertura por testes Deno antes do deploy.

### Arquivos a alterar

| Arquivo | Falhas tratadas | O que muda |
|---|---|---|
| `lib/funnel-state.ts` | F1, F2, F3 | Exigir confirmação positiva por passo (não fechar em "perfeito/entendido"). Trava de regressão: passo já concluído nunca volta. Pin de nome quando contato tem `name_source='STAFF_EDITED'`. |
| `lib/name-extraction.ts` | F1 | Aceitar 1 token quando contato já tem nome confirmado (apenas valida); dedup de prefixos espúrios ("AG LIGA"). |
| `lib/language.ts` | F5 | Re-detectar idioma a cada turno; trocar `preferred_language` se cliente mantém outro idioma por 2 turnos seguidos. |
| `lib/kb.ts` | F7 | Receber `funnel-state` resumido (location, entry_date) e injetar como filtro de elegibilidade na chamada KB; instrução explícita: "se inelegível, dizer claramente". |
| `index.ts` (`getConversationHistory`) | F8 | Marcar mensagens com `origem='SISTEMA'` como `[ATENDENTE HUMANO]` no role assistant; quando há corte de 48h, anexar bloco `[FATOS CONFIRMADOS]` derivado de `funnel-state` em vez de só o aviso vazio. |
| `index.ts` (após gerar resposta IA) | F4 | Dedup contra as 3 últimas respostas do assistente: se similaridade ≥ 0.85 com bloco de catálogo, força paráfrase ou pula direto à próxima pergunta. |
| `index.ts` (prompt do funil) | F3 | Bloco fixo no system prompt: "Se o cliente divergir, reformule o pedido NO MESMO PASSO. NUNCA reinicie o funil." |

### Testes (`wave5_test.ts`, novo)

8 testes baseados nos diálogos reais de hoje:
1. F1 — Gustavo com nome STAFF_EDITED não é re-perguntado
2. F2 — Fred com só entrada+empadronamento não fecha levantamento
3. F3 — Gustavo dizendo "nunca fui" não recebe pergunta de nome
4. F4 — segundo turno com catálogo idêntico é parafraseado
5. F5 — Agência Liga muda PT→IA responde PT
6. F6 — handoff SISTEMA mantém pausa (regressão do que já existe)
7. F7 — Gustavo `location='outside'` recebe aviso de inelegibilidade da Autorização de Regresso
8. F8 — após corte 48h, resposta usa `[FATOS CONFIRMADOS]` do `funnel-state`

### Validação

1. `supabase--test_edge_functions whatsapp-webhook` — todos verdes (atual 41 + 8 novos = 49)
2. Atualizar `mem://features/whatsapp-ai-agent-resilience` com a regra de não-regressão de funil e re-detecção de idioma

### Estimativa

~350 linhas alteradas + ~400 linhas de teste. Risco baixo — toda mudança é aditiva ou troca lógica isolada. Sem migration.

## Fora de escopo

- Reescrever os 8 passos do funil
- Trocar provider de IA
- Re-treinar/expandir KB
- UI ou frontend
