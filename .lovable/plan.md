## Objetivo

Na primeira mensagem do cliente, além de detectar o idioma, extrair informações que já respondem etapas do fluxo pré-handoff (nome, está na Espanha, intenção etc.), marcar essas etapas como respondidas, saudar a pessoa pelo nome reconhecendo o que já foi dito, e retomar o fluxo na **primeira pergunta pendente** — não simplesmente na etapa seguinte à última aproveitada.

## Comportamento alvo

Exemplo 1 — "Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar"
- Extrai: nome = Fred, está na Espanha = Sim, intenção = estudos, chegada ≈ 5 dias atrás.
- Envia saudação personalizada ("Olá, Fred! 😊 Que bom que você já está na Espanha e quer estudar…") com o resumo do que foi entendido.
- Marca essas etapas como respondidas e faz a **primeira pergunta ainda sem resposta**, mesmo que ela esteja antes das etapas aproveitadas na ordem do fluxo.

Exemplo 2 — "My name is Robert. I live in US and want to go to Spain to work."
- Idioma travado em inglês; nome = Robert; está na Espanha = Não; intenção = trabalho.
- Saudação em inglês e salto para a primeira pergunta pendente do ramo "fora da Espanha".

## O que será construído

### 1. Extração de intake na primeira mensagem (backend)
Novo módulo `supabase/functions/_shared/flow-intake.ts`:
- Recebe a primeira mensagem, o idioma detectado e as etapas do fluxo (com `field_mapping` e `answer_type`).
- Uma única chamada ao LLM (cascata atual) com schema mínimo: nome, está_na_espanha, intenção/serviço, data de chegada, empadronado, cidade — "somente o que foi dito explicitamente", com nível de confiança.
- Converte cada campo extraído em resposta de etapa via `field_mapping`.
- Só aceita valores que passem em `validateAnswer` da etapa; ambíguos ou de baixa confiança são descartados e a pergunta é feita normalmente.

### 2. Retomada na primeira pergunta pendente (motor de fluxo)
Em `supabase/functions/_shared/flow-engine.ts`, nova função `startFlowWithPrefill(steps, lang, prefilledAnswers)`:
- Injeta as respostas em `state.answers` e marca essas etapas como `visited`.
- Percorre o grafo **a partir da etapa inicial**, seguindo `branches` já resolvidas pelas respostas conhecidas, e **para na primeira etapa `PERGUNTA` que ainda não tem resposta** — não avança a partir da última etapa aproveitada.
- Se ao responder essa pergunta as próximas já estiverem preenchidas, o motor volta a aplicar a mesma varredura e pula direto para a próxima pendente (a lógica de "próxima pendente" vale em todo o fluxo, não só no 1º turno).
- Devolve `captured` para gravação normal nos campos do CRM (reaproveita `applyCapturedFields`).
- Se não sobrar nenhuma pergunta pendente, o fluxo segue direto para o fim/handoff como hoje.

### 3. Saudação humana com reconhecimento
- Mensagem inicial montada por template configurável, com variáveis `{nome}`, `{intencao}`, `{localizacao}`, `{resumo}`.
- Sem dados extraídos → texto de saudação padrão atual (sem regressão).
- Para respostas abertas durante o fluxo, um breve reconhecimento humano antes da próxima pergunta ("Perfeito, Fred. Obrigada!"), configurável por etapa e por idioma (nova opção "Confirmação humana" no inspetor de etapa, desligada por padrão).

### 4. Tela de configuração no editor de fluxos
Nova aba **"Primeira mensagem"** (`FlowsManagement.tsx` + novo `FlowIntakeSettings.tsx`):
- Liga/desliga do aproveitamento da primeira mensagem.
- Quais campos podem ser aproveitados (checkboxes ligados às etapas/`field_mapping` do fluxo).
- Confiança mínima para aceitar um dado extraído.
- Editor multi-idioma (pt-BR, es, en, fr) da saudação padrão, da saudação personalizada e da frase de reconhecimento.
- Prévia com texto de exemplo, mostrando o que seria extraído e **qual seria a primeira pergunta pendente**.

### 5. Persistência
- Migration: coluna `intake_config jsonb not null default '{}'` em `public.ai_agent_flows` (RLS/GRANTs existentes preservados; nenhuma tabela nova).
- `useSaveFlow` grava `intake_config`; tipos atualizados em `src/types/ai-agents.ts`.

### 6. Integração em produção e sandbox
- `whatsapp-webhook/index.ts`: no primeiro turno do fluxo visual, roda a extração antes de iniciar e usa `startFlowWithPrefill`.
- `ai-agent-sandbox`: mesmo caminho, para teste pela tela.
- Falha/timeout do LLM de extração → fluxo normal sem prefill (nunca bloqueia a resposta).

## Detalhes técnicos

- A extração roda no caminho crítico apenas no 1º turno, com timeout curto (~3s); a extração passiva atual (`extractAndSuggestContactData`) continua em background.
- Idioma continua travado pela detecção já existente; o prefill nunca altera `flow_state.lang`.
- Datas relativas ("tem 5 dias") normalizadas para DD/MM/YYYY antes da validação.
- Novos testes em `supabase/functions/ai-agent-sandbox/flow-intake_test.ts`: os dois exemplos (pt e en), caso sem dados, dado inválido descartado, e o caso em que a informação aproveitada está no meio do fluxo (deve retomar na primeira pendente anterior).
