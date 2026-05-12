## Objetivo

Garantir que, quando a última mensagem **outbound** do lead for de um atendente humano (`origem='SISTEMA'`), a IA não seja invocada — comportamento exigido pela memória `whatsapp-ai-agent-resilience` e pela regra de handoff.

## Diagnóstico

O check atual em `supabase/functions/whatsapp-webhook/index.ts` (linhas 1077–1088) filtra `.not('mensagem_IA', 'is', null)`. Isso só encontra:
- respostas geradas pela IA (`mensagem_IA` populado)
- marcador automático de auto-pause (também usa `mensagem_IA`)

E **não encontra** mensagens manuais do atendente, que são gravadas em `mensagem_atendente` com `origem='SISTEMA'`. Resultado: handoff humano real **não pausa** a IA em produção. O teste `handler: AI paused when origem=SISTEMA` exibe esse defeito.

Não é regressão da Wave 4 — o diff da Wave 4 não toca esse bloco.

## Correção (1 arquivo)

**`supabase/functions/whatsapp-webhook/index.ts`** (bloco 1075–1089):

Trocar o filtro para identificar a última mensagem **outbound** (qualquer origem que não seja inbound do cliente):

```ts
const { data: lastOutgoing } = await supabase
  .from('mensagens_cliente')
  .select('origem')
  .eq('id_lead', lead.id)
  .neq('origem', 'WHATSAPP')        // exclui inbound do cliente
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

if (lastOutgoing?.origem === 'SISTEMA') {
  aiPausedByHuman = true
  console.log('AI agent paused: human agent (SISTEMA) is handling this lead')
}
```

Mudanças pontuais:
- `.not('mensagem_IA','is',null)` → `.neq('origem', 'WHATSAPP')`
- `.single()` → `.maybeSingle()` (evita PGRST116 quando lead novo sem outbound)

## Validação

1. Rodar `supabase--test_edge_functions` filtrando `pattern: SISTEMA` — deve passar (0 chamadas Gemini).
2. Rodar a suíte completa do `whatsapp-webhook` — manter 27/27.
3. Telemetria: o log `AI agent paused: human agent (SISTEMA)` continua existindo.

## Fora de escopo

- Adicionar os 6 testes de regressão dos cenários Gustavo/Fred/Agência Liga (próximo passo, depois desta correção).
- Qualquer mudança no fluxo de inserção da mensagem inbound ou na lógica de funil.

## Arquivos alterados

- `supabase/functions/whatsapp-webhook/index.ts` — 1 bloco (~10 linhas).
