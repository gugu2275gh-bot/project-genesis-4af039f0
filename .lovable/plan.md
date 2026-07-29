## O que muda (em linguagem simples)

Na conversa do Julio a primeira mensagem trazia 3 dados (nome, país, objetivo), mas o agente não aproveitou tudo: "Brasil" não encaixa em nenhum campo (o fluxo só tem **Cidade onde mora**), "morar na Espanha" ficou como texto solto sem virar serviço válido, a pergunta do nome exigia nome completo, e a etapa não avançou mesmo com dados suficientes.

Cinco mudanças:

1. **País onde mora** vira um dado próprio do fluxo (substitui "Cidade onde mora" no fluxo "Conversa Natural Fred") e é gravado como parte do **endereço residencial** do contato.
2. **Nome**: pergunta passa a pedir só o nome ("Como você se chama?"), aceitando primeiro nome.
3. **Objetivo**: "morar na Espanha", "vivir en España", "live in Spain" passam a ser entendidos como **Residência** — serviço válido, sem repetir a pergunta.
4. **Pergunta própria por campo obrigatório**: ao marcar um campo como obrigatório, abre um campo de texto para escrever a pergunta; ao salvar, ela é **traduzida automaticamente** para PT/ES/EN/FR.
5. **"Dados suficientes para pular esta etapa" passa a valer de verdade**: atingida a quantidade mínima, o agente vai para a próxima pergunta.

## Regra de avanço da "Pergunta geral" (o ponto da imagem)

Ordem de decisão, a cada resposta do cliente:

1. Conta quantos dados marcados na etapa já são conhecidos (da 1ª mensagem + respostas + o que foi dito agora).
2. **Falta algum obrigatório?** → o agente pergunta o obrigatório que falta (um por vez) e permanece na etapa. Obrigatório continua sendo garantia absoluta.
3. **Nenhum obrigatório pendente e a contagem atingiu o mínimo** → a etapa é dada como respondida e o fluxo **avança imediatamente para a próxima pergunta**, sem insistir nos dados opcionais que faltam.
4. Não atingiu o mínimo → o agente segue coletando na mesma etapa (respeitando o limite de reperguntas).

Ou seja: o "mínimo" governa os dados **opcionais**; o "obrigatório" nunca é pulado. Se todos os campos marcados como obrigatórios já foram preenchidos e o mínimo foi atingido, a etapa termina no mesmo turno.

## Como fica na prática

- Cliente: "Oi, sou o Julio, moro no Brasil e quero morar na Espanha".
- Entendido: **nome = Julio**, **país = Brasil** (logo, fora da Espanha), **objetivo = Residência** → 3 dados.
- O agente não repergunta nada disso; cobra só os obrigatórios que faltam (idade, formação, familiar europeu, Europa nos últimos 6 meses).
- Assim que os obrigatórios estiverem completos e o mínimo atingido, ele passa para a etapa seguinte e depois transfere ao especialista.

## Detalhes técnicos

**Avanço por `min_fields`**
- `flow-turn.ts` / `flow-engine.ts`: após cada resposta em etapa `PERGUNTA_GERAL`, recontar os campos conhecidos; com `missingRequired = []` e `hits >= min_fields`, fechar a etapa e seguir para `next_step_code` no mesmo turno (hoje a etapa só fecha via prefill do intake).
- `flow-required.ts`: `applyRequiredGate` continua tendo prioridade sobre o avanço; só libera quando não há obrigatório pendente.
- Texto de ajuda do seletor em `StepGeneralCaptureEditor.tsx` atualizado para refletir a regra ("obrigatórios sempre perguntados; atingido o mínimo, o fluxo avança").

**Novo dado `residence_country`**
- `flow-intake.ts`: chave `residence_country` no prompt de extração e em `extractionToSourceValues` / `extractionToFieldValues`; país diferente de Espanha deriva `in_spain = nao` (e `sim` quando for Espanha).
- Novo alvo `contact.residence_country` em `STEP_FIELD_MAPPINGS` e opção "País onde mora" em `CAPTURE_SOURCE_OPTIONS`.
- Migração: coluna `residence_country` em `public.contacts`, exibida/editável no bloco de **Endereço residencial** em `ContactDetail.tsx`.
- `flow-vars.ts`: variável `{pais}` e grupo de apelidos para o novo campo; persistência incluída no `whatsapp-webhook`.

**Nome simples**
- `flow-required.ts`: prompt padrão de `full_name` vira "Como você se chama?" (4 idiomas); `name_mode: 'SIMPLES'` como padrão nas etapas de Pergunta geral.

**Objetivo → serviço válido**
- Normalização multilíngue de intenção em `flow-intake.ts` mapeando "morar/viver/residir/live/vivir" → `residência`, mantendo estudos, trabalho, nômade, arraigo e nacionalidade; instrução equivalente adicionada ao prompt de extração.

**Pergunta por campo obrigatório, com tradução**
- `StepGeneralCaptureEditor.tsx`: ao marcar "Obrigatório", exibir `MultiLangField` com botão de tradução (`useAgentTranslate`), gravando em `fields[].prompts` (`pt-BR`, `es`, `en`, `fr`) — estrutura já lida pelo motor em `requiredPrompt()`. Ao salvar, traduzir automaticamente o que estiver faltando.

**Fluxo "Conversa Natural Fred" (migração de dados)**
- Trocar o obrigatório `city` por `residence_country`, ajustar o texto da etapa ("onde você mora" → "em que país você mora") nos 4 idiomas e semear `prompts` de cada obrigatório.

**Testes**
- `flow_intake_test.ts` / `flow_required_gate_test.ts`: mensagem do Julio (nome + país + residência); país fora da Espanha define `in_spain = nao`; avanço automático ao atingir o mínimo sem obrigatório pendente; permanência quando há obrigatório pendente mesmo com o mínimo atingido; pergunta personalizada usada no idioma do atendimento.
