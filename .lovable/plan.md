## Diagnóstico do Agente de Conversa (WhatsApp)

Analisei o fluxo completo do `supabase/functions/whatsapp-webhook/index.ts` (3.053 linhas) — orquestração, prompt, gates de roteiro, KB e overrides pós-LLM. Abaixo, os pontos em que o agente realmente perde contexto, se confunde ou alucina, com a causa-raiz de cada um.

---

### 1. Perda de contexto da conversa

**1.1 Janela de histórico arbitrária (80 mensagens)**
- `getConversationHistory(supabase, lead.id, 80)` (linha 2518) corta o histórico em 80 registros. Em conversas longas (cliente que volta dias depois, fluxo bilíngue, muitas mídias), as primeiras respostas (nome, e-mail, origem) somem do contexto do LLM.
- Mitigação parcial existe: `allAssistantRows` (linha 2621) faz uma 2ª query *só com mensagens do agente* limitada a 500, usada para **detecção de etapas concluídas** — mas não vai para o LLM. Resultado: o gate sabe que a etapa foi feita, mas o modelo não “lembra” da resposta do cliente e pode reabrir o assunto ou contradizer.
- Sintoma típico: agente confirma um dado e, 30 turnos depois, pergunta de novo.

**1.2 Histórico não é particionado por sessão**
- Não há corte por inatividade (24h, novo lead, novo serviço). Reativações e novos pedidos do mesmo contato puxam mensagens antigas misturadas, confundindo o LLM sobre qual é o caso atual (especialmente quando o lead foi reciclado em "Novo Serviço").

**1.3 Buffer de mensagens não-respondidas perde mídia**
- O bloco `unansweredQuery` (2492-2516) consolida mensagens do cliente desde a última saída — bom — mas substitui mídia por `getMediaPlaceholder()`. Áudio transcrito **não** é re-injetado aqui (a transcrição vive em outro fluxo do `transcribe-audio`), então o agente responde a um placeholder genérico tipo "[áudio]" perdendo o conteúdo real.

**1.4 Detecção de localização frágil**
- A varredura procura a primeira pergunta de localização e a próxima resposta do usuário (2649-2675). Se o cliente já mencionou país antes da pergunta oficial, ou se respondeu com algo ambíguo (“estou viajando”), nem `userInSpain` nem `userOutsideSpain` ficam true → o gate trava no aprofundamento e o agente fica girando.

---

### 2. Confusões / contradições do fluxo

**2.1 Conflito entre prompt e GATE**
- O system prompt (2374-2406) tem o roteiro de 9 objetivos. O GATE (2807-2819) reescreve a próxima etapa como "INSTRUÇÃO INTERNA" injetada na mensagem do usuário. Quando os dois discordam (ex.: GATE diz "pergunte e-mail", mas o prompt manda "agradeça o nome primeiro"), o LLM mistura: agradece, faz a pergunta, e adiciona um pedaço de outra etapa.
- Ainda pior: o GATE injeta texto em **português fixo** mesmo quando `detectedChatLanguage` é `es`/`en`/`fr`. O LLM precisa traduzir uma instrução em PT que cita frases-modelo em PT — gera vazamentos de português ("Perfeito" em meio a uma resposta em espanhol).

**2.2 Detecção de etapa por regex sobre TODO o histórico do agente**
- `aberturaDone`, `interesseDone`, `localizacaoAsked` etc. (2687-2789) testam regex contra `allAssistant` (todos os turnos do agente). Falsos positivos comuns:
  - `interesseDone` casa “nacionalidade/residência/etc.” — qualquer resposta da KB que cite esses termos marca a etapa como feita sem nunca ter sido perguntada.
  - `localizacaoAsked` casa qualquer menção a “Espanha” em pergunta — frases como “já estiveste na Espanha?” da etapa de aprofundamento marcam falsamente a etapa de localização como feita.
  - `preHandoffDone` casa “visão inicial do seu caso” — se o LLM antecipou essa frase numa explicação, o gate libera a KB sem ter terminado o cadastro.

**2.3 Sobreposição de overrides pós-LLM**
- Em `2908-2911` rodam, em sequência:
  - `forceSkipFullNameIfAlreadyKnown`
  - `forceReaskEmailIfMissing`
  - `forceAdvanceFromInterestQuestion`
  - `forceAdvanceFromEntryDateQuestion`
- Cada um pode **substituir totalmente** a resposta do LLM por uma frase fixa. Quando dois disparam ao mesmo tempo (cliente respondeu nome+e-mail+interesse na mesma mensagem), só o último vence — informação válida do LLM é descartada e o cliente vê uma frase “robotizada” que ignora o que ele disse.
- Sintoma: cliente manda "Sou Maria, maria@x.com, quero arraigo" e recebe só "Qual é o seu melhor e-mail?".

**2.4 Loop anti-repetição com retry agressivo**
- `isLikelyQuestionLoop` (974) refaz a chamada Gemini com prompt anti-repetição. Mas como a heurística de "isValidAnswer" é restrita (2 ou 3 tipos), respostas livres do cliente (ex.: "tenho 32, moro em Madri") não disparam o retry quando deveriam, ou disparam mesmo quando o agente apenas reformulou a pergunta — gerando avanço prematuro de etapa.

**2.5 Detecção de idioma volátil**
- Linha 2306-2331: cada mensagem reavalia o idioma com regex. Uma palavra portuguesa isolada num chat em espanhol força `pt-BR` e persiste no contato. O próximo turno volta para espanhol e o agente troca de idioma no meio da conversa.

---

### 3. Alucinações

**3.1 KB ainda pode ser ignorada mesmo em STRICT**
- Em `kbStrictMode` (2846), se `knowledgeContext` está vazio, manda fallback. Mas quando há contexto, o prompt instrui *"é PROIBIDO usar conhecimento geral"* — porém o GATE injeta antes a regra "PROIBIDO dizer que NÃO TEM essa informação" (2815). Quando o cadastro não está completo e a KB não tem resposta, o LLM fica entre duas regras conflitantes e alucina uma resposta intermediária (“Sim, é possível, vou te explicar quando terminarmos”).

**3.2 Prompt anti-honestidade força invenção**
- Regra do GATE: *"NUNCA diga 'não tenho essa informação', 'preciso confirmar'..."* (2815). Combinada com **bloqueio de KB durante o cadastro**, o modelo é treinado a **não admitir desconhecimento** e ainda assim **não pode consultar a KB** — receita clássica para alucinação de prazos, valores, requisitos.

**3.3 Boost de KB por nome de arquivo (lexical)**
- `scoreTopicFileName` + `topicPreloaded` (374-396) força preferência por chunks do arquivo cujo nome contém o tópico. Se o nome do PDF não bate com o termo usado pelo cliente (ex.: cliente diz "papeles", arquivo se chama "RESIDENCIA…"), o boost vai para o PDF errado e o LLM responde com base em conteúdo incorreto, parecendo fato.

**3.4 Backfill silencioso de nome a partir do histórico**
- `findExplicitFullNameAnswer` (851) varre o histórico e grava o **primeiro** texto com 2+ palavras alfabéticas que veio depois de uma pergunta de nome. Falsos positivos: cliente respondeu "minha mãe" ou "São Paulo" → grava como `full_name` no contato. Daí em diante, o agente o trata por esse "nome".

**3.5 Extração paralela com `extractAndSuggestContactData`**
- Linha 2477 dispara extração via Gemini sobre cada mensagem. Sugestões automáticas viram dados estruturados sem confirmação humana — quando o LLM erra, o contato fica com data de nascimento, profissão ou nacionalidade incorretas, e o agente passa a tratar isso como fato.

**3.6 Mistura de idioma em frases-modelo do prompt**
- O prompt (2381-2398) lista frases-exemplo em PT e instrui "traduza fielmente". Em conversas curtas em espanhol/francês, o Gemini frequentemente copia a frase em PT no meio da resposta — não é alucinação factual mas é percebido como "o bot trocou de idioma".

---

### 4. Problemas estruturais que amplificam tudo acima

- **3.053 linhas em um único `index.ts`** dificulta enxergar overrides conflitantes. O fluxo principal (`2300-3000`) acumula: detecção de idioma, prompt, gate, KB, overrides, envio Twilio, persistência.
- **Sem testes de regressão** para o gate, overrides e detecção de etapa — qualquer ajuste em regex quebra silenciosamente cenários antigos.
- **Logs ricos mas dispersos** (`[KB]`, `[GATE]`, `[KB-STRICT]`) — sem um log único por turno mostrando “estado decidido” (etapa, idioma, dados conhecidos, fonte da resposta), debugar caso a caso é caro.
- **Race condition latente**: a backfill de nome (2522-2549) e a extração paralela (2477) podem escrever em `contacts` na mesma janela; o que persiste é o último a chegar.

---

### 5. Recomendações priorizadas (para um próximo plano de correção)

1. **Unificar a fonte de verdade do estado**: gerar um objeto `convoState` (campos conhecidos, etapa atual, idioma confirmado, última pergunta, última resposta válida) **uma única vez** por turno, e passá-lo tanto ao prompt quanto aos overrides. Acaba o conflito prompt × GATE.
2. **Reescrever as regex de "etapa concluída"** para casarem só **perguntas do agente** (não respostas/explicações) e exigirem **resposta válida do cliente** logo após.
3. **Tornar overrides cumulativos, não substitutivos**: cada `force*` deve produzir um patch (frase a remover/adicionar), e um único reducer aplica tudo.
4. **Sessionizar o histórico**: cortar por inatividade (>48h) ou por novo lead, com header explícito "[NOVA SESSÃO]" no contexto.
5. **Travar idioma após 2 turnos consistentes**, e não permitir flip por uma palavra isolada.
6. **Suavizar a regra anti-honestidade** durante o gate: permitir “vou confirmar com o especialista” em vez de proibir admissão de desconhecimento (causa direta de alucinação).
7. **Mover o prompt para um arquivo dedicado** (`whatsapp-webhook/prompt.ts`) e dividir o `index.ts` em módulos (`gate.ts`, `overrides.ts`, `kb.ts`, `language.ts`).
8. **Adicionar testes Deno** cobrindo: cliente responde nome+email+interesse juntos; cliente em espanhol responde uma palavra em PT; cliente nunca foi à Espanha; KB sem hit em STRICT; backfill com falso positivo de nome.
9. **Log único `[TURN]`** por mensagem, com JSON: `{leadId, etapa, dados, idioma, gate, kbHit, override}`. Facilita auditoria de regressão.
10. **Confirmar dados extraídos antes de gravar**: `extractAndSuggestContactData` deve gravar em `contact_data_suggestions` (já existe a tabela) e nunca escrever direto em `contacts.full_name` sem confirmação.

---

### Detalhes técnicos

- Arquivo principal afetado pelo diagnóstico: `supabase/functions/whatsapp-webhook/index.ts`
- Funções críticas citadas: `getConversationHistory`, `getKnowledgeBaseContext`, `detectKnowledgeTopicHint`, `forceSkipFullNameIfAlreadyKnown`, `forceReaskEmailIfMissing`, `forceAdvanceFromEntryDateQuestion`, `forceAdvanceFromInterestQuestion`, `isLikelyQuestionLoop`, `findExplicitFullNameAnswer`, `extractAndSuggestContactData`.
- Modelos: Gemini 2.5 Flash-Lite (primário) com fallback para gpt-4o-mini.
- Sem mudanças de schema ou edge function neste documento — é apenas diagnóstico.

### O que NÃO está incluído

- Não alterei nenhum arquivo.
- Não escrevi correções: este documento foca em mapear as causas. Posso transformar qualquer item das **Recomendações** acima em plano de implementação separado quando você indicar a prioridade.
