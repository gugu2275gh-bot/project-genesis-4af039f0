## Objetivo

Criar um novo fluxo pré-handoff chamado **"teste aberto"** que reproduz exatamente o exemplo pedido: saudação já com o nome vindo do WhatsApp, uma **pergunta geral aberta** que interpreta a resposta e preenche vários campos, e perguntas de complemento só para o que não foi entendido.

Verificado no banco: hoje existem só dois fluxos (`Pré-Handsoff` e `Pré-Handsoff Aberto`), ambos em RASCUNHO — o novo será criado do zero, sem alterar os existentes.

## Como o fluxo vai conversar

```text
1) Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊
   Para entender melhor o seu caso, farei algumas perguntas...
   me comente um pouco sobre você (idade, onde você mora, possui
   formação superior, possui algum familiar europeu, esteve na Europa
   nos últimos 6 meses).
   E qual o seu objetivo na Espanha? Visto de estudos, residência para
   nômades, arraigos, nacionalidade espanhola, já possui oferta de
   trabalho ou outros?

2) [cliente responde em texto livre]
   -> IA interpreta idade, cidade, formação, familiar europeu,
      Europa 6 meses e objetivo; grava nos campos e PULA as perguntas
      correspondentes.

3) Só o que faltou é perguntado, uma pergunta por vez.

4) E-mail -> encerramento com encaminhamento ao especialista.
```

`{nome}` vem do perfil do WhatsApp (ou do contato já cadastrado); se não houver nome utilizável, a saudação usa a versão sem nome e a pergunta de nome entra na lista de pendências.

## Etapas do fluxo

| # | Etapa | Tipo | Grava em |
|---|-------|------|----------|
| 1 | Saudação + pergunta geral | **PERGUNTA_GERAL** | interpretação multi-campo |
| 2 | Nome completo (só se faltar) | PERGUNTA | `contact.full_name` |
| 3 | Idade | PERGUNTA | idade |
| 4 | Cidade onde mora | PERGUNTA | cidade |
| 5 | Formação superior (Sim/Não) | PERGUNTA | formação |
| 6 | Familiar europeu (Sim/Não) | PERGUNTA | familiar europeu |
| 7 | Esteve na Europa nos últimos 6 meses (Sim/Não) | PERGUNTA | Europa 6m |
| 8 | Objetivo na Espanha | PERGUNTA (opções) | objetivo/serviço |
| 9 | E-mail | PERGUNTA | `contact.email` |
| 10 | Encerramento / encaminhamento | FIM (handoff) | — |

Todas as etapas 2–9 ficam com "pular se o campo já estiver preenchido", para que nada seja perguntado duas vezes depois da pergunta geral.

## Configurações

- **Etapa 1 (Pergunta geral)**: interpretação ligada, confiança mínima 0,7, campos marcados — nome, idade, cidade, formação superior, familiar europeu, Europa nos últimos 6 meses, objetivo/serviço, e-mail. Mensagem de reforço caso nada seja entendido.
- **Primeira mensagem (intake)**: ligada, com os mesmos campos, saudação personalizada `{nome}` e saudação padrão sem nome.
- **Sim/Não**: etapas 5, 6 e 7 com botões de resposta rápida.
- **Idiomas**: todas as mensagens gravadas em pt-BR, es, en e fr, para nada sair em português numa conversa em outro idioma.
- **Status**: criado como **RASCUNHO** (inativo), para você revisar no editor visual e testar no Sandbox antes de ativar.

## Detalhes técnicos

- Migração de dados: `insert` em `ai_agent_flows` (`name: 'teste aberto'`, `phase: 'PRE_HANDOFF'`, `status: 'RASCUNHO'`, `intake_config` preenchido) + `insert` das 10 linhas em `ai_agent_flow_steps` com `step_code`, `order_index`, `next_step_code`, `field_mapping`, `messages` (jsonb multi-idioma) e `validation` contendo `step_kind`, `skip_mode`, `general_capture`, `name_mode`, `options_i18n` e `unexpected_answer`.
- `canvas` com posições em coluna para o editor visual abrir já organizado.
- Sem mudanças de código: a modalidade `PERGUNTA_GERAL`, o prefill por nome do WhatsApp e o pulo de etapas já respondidas já existem no motor.
- Verificação: abrir o fluxo em Agentes de IA > Fluxos e rodar um teste no Sandbox com a resposta livre do exemplo ("tenho 34 anos, moro em Valencia, sou formado, minha avó é italiana, cheguei em maio, quero nacionalidade") conferindo que só e-mail é perguntado depois.
