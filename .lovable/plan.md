## Objetivo

1. Poder **duplicar qualquer fluxo** (inclusive o ativo), gerando uma cópia inativa para editar.
2. Criar a modalidade de etapa **"Pergunta geral"**: faz uma pergunta aberta e ampla, interpreta a resposta, preenche automaticamente vários campos do banco e **pula** as etapas seguintes já respondidas.
3. **Aproveitar o nome do perfil do WhatsApp** para não perguntar o nome desnecessariamente.

## Resultado esperado (exemplo real)

Com essas três peças, o agente passa a conseguir atuar assim:

```text
Olá, [NOME]! Eu sou a assistente virtual da CB ASESORIA. 😊
Para entender melhor o seu caso, farei algumas perguntas… me comente um
pouco sobre você (idade, onde você mora, possui formação superior, possui
algum familiar europeu, esteve na Europa nos últimos 6 meses).

E qual o seu objetivo na Espanha?
Visto de estudos, residência para nômades, arraigos, nacionalidade
espanhola, já possui oferta de trabalho ou outros?
```

- `[NOME]` vem do **perfil do WhatsApp** (ou do contato já cadastrado), sem precisar perguntar.
- A resposta livre do cliente ("tenho 34 anos, moro em Valencia, sou formado, minha avó é italiana, cheguei em maio") é interpretada pela etapa **Pergunta geral**, que grava idade, cidade, formação, familiar europeu e data de entrada nos campos configurados.
- As etapas seguintes que perguntariam esses mesmos dados são **puladas automaticamente**; o fluxo segue direto na primeira pergunta ainda pendente.

Para isso, a lista de campos interpretáveis é ampliada com: **idade**, **cidade onde mora**, **formação superior (sim/não)**, **familiar europeu (sim/não + parentesco/nacionalidade)** e **esteve na Europa nos últimos 6 meses (sim/não)**, além dos já existentes (nome, e-mail, está na Espanha, objetivo/serviço, data de entrada, empadronamento).

## 1. Duplicação de fluxos

- Botão **"Duplicar"** na lista de fluxos (Agentes de IA > Fluxos), ao lado de Editar/Excluir.
- Cópia com nome `<nome original> (cópia)`, **inativa** (rascunho), mantendo configuração geral, `intake_config`, todas as etapas, mensagens em todos os idiomas, ramificações, validações e posições do canvas.
- Códigos de etapa preservados dentro da cópia; `next_step_code` e ramificações continuam apontando para as etapas da própria cópia.
- Confirmação antes de duplicar e navegação direta para o editor da cópia.

## 2. Nova modalidade "Pergunta geral"

### Configuração (editor de etapas)
- Novo tipo **PERGUNTA_GERAL** no seletor "Tipo de etapa", com aba **"Interpretação"**:
  - Lista pronta de **campos que podem ser interpretados** (incluindo os novos: idade, cidade, formação superior, familiar europeu, viagem à Europa nos últimos 6 meses).
  - Para cada campo marcado, o **campo do banco** que será gravado vem da lista pronta existente (contato / lead / funil).
  - **Confiança mínima** (0 a 1).
  - Mensagens opcionais de **reconhecimento** e de **reforço** quando nada é entendido (multilíngue, passando pela camada de idioma já existente).

### Comportamento em execução
- A etapa envia a pergunta e **aguarda a resposta**.
- Ao receber a resposta, roda a extração por IA (mesma da primeira mensagem), restrita aos campos marcados.
- Cada valor aceito é gravado no campo configurado e marca a etapa correspondente como respondida.
- O fluxo **pula as etapas já respondidas** e segue na primeira pergunta pendente.
- Se nada for entendido, envia a mensagem de reforço e mantém o comportamento de "resposta diferente do esperado" da etapa.
- Vale no **Sandbox** e no **WhatsApp em produção**.

## 3. Nome vindo do WhatsApp

- O webhook passa a ler o **nome de perfil do remetente** (`ProfileName` da Twilio) e a gravá-lo no contato quando ele ainda não tiver nome.
- O nome entra como dado pré-preenchido do fluxo e pode ser usado como `{nome}` na saudação, respeitando `name_mode`:
  - **nome simples** → pergunta de nome é pulada;
  - **nome completo** → se o perfil trouxer só o primeiro nome, o agente pergunta de forma personalizada ("Oi, Rose! Pode me confirmar seu nome completo?").
- Prioridade: nome dito na conversa > nome já cadastrado > nome do perfil do WhatsApp.
- Nomes de perfil inúteis (vazio, só números, igual ao telefone, só emojis) são ignorados.

## Detalhes técnicos

- `src/hooks/useAIAgents.ts`: `useDuplicateFlow` (copia `ai_agent_flows` + `ai_agent_flow_steps`, `is_active: false`).
- `src/components/ai-agents/FlowsManagement.tsx`: botão Duplicar; novo tipo em `STEP_KINDS`.
- `src/types/ai-agent-flow-builder.ts`: `StepKind` ganha `PERGUNTA_GERAL`; `StepValidation` ganha `general_capture: { enabled, fields: Array<{ source, target_field }>, min_confidence }`.
- `src/components/ai-agents/FlowIntakeSettings.tsx` / `INTAKE_FIELDS`: novos campos (idade, cidade, formação, familiar europeu, Europa 6 meses) compartilhados entre a "Primeira mensagem" e a "Pergunta geral".
- Novo `src/components/ai-agents/flow-builder/StepGeneralCaptureEditor.tsx` (aba Interpretação).
- `supabase/functions/_shared/flow-intake.ts`: prompt de extração ampliado com os novos campos; `profileNameToFieldValues` para o nome do WhatsApp; reuso de `runIntake` / `prefillFromFieldValues` com a lista da etapa.
- `supabase/functions/_shared/flow-engine.ts`: `PERGUNTA_GERAL` como pergunta que aguarda resposta + prefill em meio ao fluxo (`applyPrefillFromStep`).
- `supabase/functions/whatsapp-webhook/*`: capturar `ProfileName`, persistir em `contacts.full_name` quando vazio e injetar no prefill inicial.
- `supabase/functions/_shared/flow-turn.ts`, `whatsapp-webhook/lib/visual-flow.ts`, `ai-agent-sandbox/index.ts`: acionar a extração quando a etapa respondida for `PERGUNTA_GERAL`.
- Testes Deno: extração multi-campo parcial, campos fora da lista ignorados, pulo de etapas respondidas, continuidade multilíngue e nome de perfil (simples vs completo, valores inválidos).
- Campos novos que ainda não existam em `contacts`/`lead_funnel_state` (ex.: idade, formação superior, familiar europeu, viagem recente) exigem uma pequena migração de colunas — feita antes das mudanças de código.
