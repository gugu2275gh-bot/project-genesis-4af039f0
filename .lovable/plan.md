## O que aconteceu

Sim, é duplicidade — e a causa está confirmada nos dados:

1. O fluxo **Conversa natural** (`intake_config.greeting_personalized` pt-BR) envia:
   `"Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊 {resumo}"`
2. A **1ª etapa** (`dados_pessoais`, `PERGUNTA_GERAL`) tem como mensagem:
   `"Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊\nPara entender melhor o seu caso, farei algumas perguntas…"`

O intake prefixa a saudação como mensagem separada (`prependIntakeGreeting` → `prependMessage`), e a etapa repete a mesma linha de abertura. Resultado: as duas bolhas da imagem.

## Correção proposta

1. **Dedup na camada de saudação** (`supabase/functions/_shared/flow-intake.ts`)
   - Antes de prefixar, comparar a saudação já renderizada (com `{nome}`/`{resumo}` resolvidos) com o início da primeira mensagem do turno, usando normalização (minúsculas, sem acentos/emoji/pontuação/espaços extras).
   - Se houver sobreposição relevante (a primeira linha da mensagem da etapa contém a saudação ou vice-versa, ou similaridade alta do primeiro trecho), **não prefixar**; em vez disso, se a saudação for personalizada e trouxer `{resumo}`, injetar só a parte do resumo antes da pergunta, para não perder o "entendi X, Y e Z".
   - Vale para todos os idiomas, pois a comparação é feita sobre o texto já localizado.

2. **Limpeza do conteúdo do fluxo** (migração SQL)
   - Remover a linha de saudação duplicada da mensagem da etapa `dados_pessoais` nos 4 idiomas do fluxo "Conversa natural", deixando a etapa começar em "Para entender melhor o seu caso…". A saudação passa a ser responsabilidade única do intake (personalizada quando há nome do WhatsApp, padrão caso contrário).

3. **Testes** (`supabase/functions/_shared/flow_intake_test.ts`)
   - "oi" + nome do WhatsApp → exatamente **uma** bolha de saudação seguida da pergunta geral.
   - 1ª mensagem com dados → saudação personalizada com resumo, sem repetir a abertura da etapa.
   - Caso ES/EN/FR → mesma garantia de não duplicar.

## Detalhes técnicos

- Alterações concentradas em `flow-intake.ts` (`prependIntakeGreeting` e helper novo `greetingAlreadyPresent`), sem mexer em `flow-engine.ts`/`flow-turn.ts`.
- Produção (`_shared/visual-flow.ts` via `whatsapp-webhook`) e sandbox (`ai-agent-sandbox`) herdam a correção automaticamente por usarem a mesma função.
- A migração toca apenas as linhas `messages` da etapa `dados_pessoais` do fluxo `a3e2a1d1-66d7-4527-b215-f66ae134f4ef`.
