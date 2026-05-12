# Plano — Correção definitiva do handoff humano no WhatsApp

O problema não será tratado como ajuste amplo do agente agora. A correção definitiva é garantir, com teste de regressão, que qualquer última mensagem outbound de atendente humano (`origem='SISTEMA'`) pause a IA antes de qualquer chamada Gemini.

## Diagnóstico confirmado

O ponto crítico fica em `supabase/functions/whatsapp-webhook/index.ts`, na seção `AI AGENT SECTION`.

A regra correta é:

```ts
última mensagem outbound do lead = qualquer mensagem cuja origem != 'WHATSAPP'
se essa origem for 'SISTEMA' → não chamar IA
```

Isso cobre mensagens manuais do atendente salvas em `mensagem_atendente`, mesmo quando `mensagem_IA` está vazio.

## Implementação

1. **Finalizar/hardenizar o bloco de pausa humana**
   - Manter a consulta por última mensagem outbound usando:
     - `.eq('id_lead', lead.id)`
     - `.neq('origem', 'WHATSAPP')`
     - `.order('created_at', { ascending: false })`
     - `.limit(1)`
     - `.maybeSingle()`
   - Se `lastOutgoing?.origem === 'SISTEMA'`, setar `aiPausedByHuman = true`.
   - Preservar o log:
     - `AI agent paused: human agent (SISTEMA) is handling this lead`

2. **Garantir que não exista dependência de `mensagem_IA` para handoff humano**
   - Conferir que o bloco não usa mais `.not('mensagem_IA', 'is', null)` para decidir pausa humana.
   - Mensagem manual do atendente deve ser reconhecida mesmo quando só `mensagem_atendente` está preenchida.

3. **Fortalecer o teste de regressão existente**
   - Usar o cenário já presente em `handler_test.ts`:
     - lead existente
     - última mensagem do chat com `origem='SISTEMA'`
     - `mensagem_atendente` preenchida
     - `mensagem_IA` ausente/nula
   - Assertiva obrigatória:
     - 0 chamadas para Gemini.
   - Se o mock de Supabase não simular corretamente `.neq(...).maybeSingle()`, ajustar apenas o mock/teste, não a regra de produção.

4. **Rodar validação direcionada**
   - Rodar testes do `whatsapp-webhook` filtrando por `SISTEMA`.
   - Resultado esperado:
     - o teste `handler: AI paused when last outgoing message origem=SISTEMA → no Gemini fetch` passa.
     - Gemini recebe 0 chamadas.

5. **Rodar suíte completa do webhook**
   - Rodar todos os testes de `supabase/functions/whatsapp-webhook`.
   - Resultado esperado:
     - todos os testes atuais permanecem verdes.

6. **Atualizar memória do projeto**
   - Atualizar `mem://features/whatsapp-ai-agent-resilience` para registrar explicitamente:
     - mensagens manuais de atendente (`origem='SISTEMA'`, `mensagem_atendente`) pausam a IA;
     - a verificação deve considerar a última outbound por `origem != 'WHATSAPP'`, não por `mensagem_IA`.

## Fora de escopo agora

- Reescrever funil completo.
- Alterar KB/RAG.
- Criar novas tabelas ou migrations.
- Mexer em idioma, extração de nome ou diagnóstico Wave 5 amplo.
- Implementar os cenários Gustavo/Fred/Agência Liga neste passo.

## Critério de pronto

A correção só será considerada concluída quando:

1. o código não depender de `mensagem_IA` para detectar handoff humano;
2. o teste com `origem='SISTEMA'` e `mensagem_atendente` passar;
3. a suíte completa do webhook passar;
4. a memória do projeto registrar a regra para evitar que futuras correções revertam o comportamento.
