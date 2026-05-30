## Plano

### Objetivo
Durante o pré-handoff/cadastro básico, o bot deve operar por **resposta válida esperada**:

- Se a mensagem do cliente responde validamente à pergunta atual, segue o fluxo.
- Se não responde validamente, é sempre fora de contexto.
- A resposta enviada deve começar com a frase localizada de fora de contexto e depois repetir a mesma pergunta necessária.

Exemplo para Roberto, etapa `email`:

```text
Cliente: O quê é TIE
Bot: Por favor, vamos terminar o cadastro básico primeiro. Em seguida podemos tratar de outros assuntos.|||Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?
```

### Mudança principal
Substituir a lógica atual de “tentar detectar se é off-topic” por uma função determinística:

```ts
isValidAnswerForCurrentQuestion(rawCustomerMessage, lastAssistantQuestion, currentStep)
```

Essa função será a autoridade no cadastro básico.

### Regras por etapa

1. **Consentimento inicial**
   - Válido: sim/não equivalentes no idioma.
   - Inválido: qualquer outra coisa → frase de fora de contexto + repetir consentimento.

2. **Nome completo**
   - Válido: nome provável ou recusa explícita já suportada.
   - Inválido: pergunta, serviço, número, texto genérico → frase + repetir nome.

3. **E-mail**
   - Válido: e-mail válido ou recusa explícita de e-mail.
   - Inválido: qualquer outro texto, incluindo “O que é TIE”, “quanto custa”, “residência”, “sim”, etc. → frase + repetir e-mail.

4. **Interesse/serviço**
   - Válido: serviço reconhecido ou resposta estruturada válida.
   - Inválido: pergunta factual, dúvida, pedido lateral sem serviço claro → frase + repetir pergunta de interesse.

5. **Localização Espanha / data / cidade / idade / perguntas sim-não**
   - Válido: somente o formato esperado para aquela etapa.
   - Inválido: frase + repetir a pergunta atual.

### Ajustes técnicos

- Em `supabase/functions/whatsapp-webhook/lib/offtopic.ts`:
  - Criar/exportar `isValidAnswerForCurrentQuestion(...)`.
  - Fazer `classifyOffTopic(...)` usar essa regra: com `collectionGateActive`, se não for resposta válida, retornar `{ kind: 'question' | 'request' }`.
  - Manter `isFactualQuestion` apenas como auxiliar para classificar o tipo, não como condição obrigatória para bloquear.

- Em `supabase/functions/whatsapp-webhook/index.ts`:
  - Garantir que o guard de off-topic rode **antes** de qualquer agradecimento, extração de interesse ou patch determinístico.
  - Quando inválido, usar sempre `getOffTopicAckPhrase(language) + '|||' + pergunta canônica da etapa atual`.
  - Impedir que o LLM gere “Obrigado” para uma resposta inválida.

- Em `supabase/functions/whatsapp-webhook/lib/extract.ts`:
  - Bloquear extração de interesse quando a mensagem não for resposta válida à pergunta de interesse atual, para evitar capturar falso interesse em etapas como e-mail.

### Testes obrigatórios
Adicionar testes cobrindo Roberto e outras etapas:

- Etapa e-mail + `O quê é TIE` → fora de contexto + repete e-mail.
- Etapa e-mail + `residência` → fora de contexto + repete e-mail.
- Etapa e-mail + `Sim` → fora de contexto + repete e-mail.
- Etapa e-mail + `cliente@email.com` → válido, sem ACK off-topic.
- Etapa nome + `O que é TIE` → fora de contexto + repete nome.
- Etapa interesse + `Residência` → válido.
- Etapa interesse + `O que é TIE` → fora de contexto + repete interesse.

### Validação
Após implementar:

- Rodar testes do `whatsapp-webhook`.
- Redeploy automático da função.
- Verificar nos logs que o caso Roberto passa por `[PARK]` ou `[OFFTOPIC_SHORTCIRCUIT]`, sem resposta “Obrigado”, e que a mensagem enviada começa com a frase correta de fora de contexto.