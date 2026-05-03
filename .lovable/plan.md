## Diagnóstico

Olhando o fluxo da conversa:
1. Agente perguntou: *"Em qual serviço você tem interesse?"* → cliente respondeu "Residência para Práticas"
2. Agente perguntou e-mail
3. Cliente respondeu apenas: **"Requisitos e documentos — O que é necessário"**
4. Agente respondeu que "não tinha essa lista"

No `whatsapp-webhook/index.ts` (linha 2191–2195), a busca na Base de Conhecimento usa **apenas a mensagem isolada do cliente** (`rawCustomerMessage`). A frase "Requisitos e documentos — O que é necessário" é genérica e ambígua — a busca semântica acaba pontuando outros PDFs (Renovação, Comunitária etc.) acima do PDF correto (`RESIDENCIA PARA PRACTICAS.pdf`), porque a query não contém o termo "Residência para Práticas". É exatamente o tipo de pergunta de continuidade onde o tópico já foi estabelecido turnos antes.

Adicionalmente, suspeito que alguns PDFs ainda não tenham embeddings gerados (depende do botão "Gerar embeddings"). Quando não têm, cai no lexical, que também não sabe sobre o tópico do turno anterior.

## Correção proposta

### 1. Construir a query da KB com contexto curto da conversa

Em `supabase/functions/whatsapp-webhook/index.ts`, antes de chamar `getKnowledgeBaseContext`:

- Recuperar o serviço de interesse já capturado no lead (`lead.servico_interesse` / `service_type` / `interesse`) — se existir, anexar à query.
- Recuperar a **última pergunta do agente** (`lastAssistantQuestion`) e os tópicos das últimas 2 mensagens do agente (já temos `assistantMsgs`).
- Montar `kbQuery` como concatenação:
  ```
  [Tópico atual: <serviço de interesse, se houver>]
  [Pergunta anterior do agente: <lastAssistantQuestion>]
  Pergunta do cliente: <rawCustomerMessage>
  ```
- Isso enriquece o embedding sem poluir com o longo "ESTADO DA CONVERSA".

### 2. Garantir cobertura de embeddings

- Após a correção da query, registrar log claro indicando se a query semântica retornou 0 hits e qual PDF venceu, para debug futuro.
- Adicionar ao log o top-3 com `file_name + similarity` (hoje só logamos o top 1).

### 3. Aumentar threshold mínimo apenas quando contextual

- Manter `similarity_threshold: 0.3` mas, quando query contém o tópico (ex.: "Residência para Práticas"), filtrar resultados para preferir chunks cujo `file_name` contenha o tópico — boost simples no resultado semântico.

### 4. Verificação

Após o deploy:
- Pedir ao cliente para reenviar a pergunta "Requisitos e documentos — O que é necessário" no mesmo chat.
- Conferir nos logs do webhook se o top hit é `OK - RESIDENCIA PARA PRACTICAS.pdf`.
- Se ainda falhar, rodar "Gerar embeddings (busca semântica)" no painel para garantir que todos os PDFs têm vetores.

## Detalhes técnicos

- Arquivo único alterado: `supabase/functions/whatsapp-webhook/index.ts`.
- Função `getKnowledgeBaseContext` ganha um parâmetro opcional `topicHint?: string` para reforçar a pontuação dos chunks cujo `file_name` contenha o termo.
- Sem mudanças de schema, sem migrations.
- Função reimplantada via deploy de edge function.

## O que NÃO vou fazer

- Não alterar o "STRICT MODE" nem o fallback message.
- Não mudar a lógica de pausa por handoff humano.
- Não alterar o processamento dos PDFs.