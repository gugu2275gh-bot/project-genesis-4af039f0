# Pre-hands-off-g-v2 — novo fluxo de qualificação

Criar um novo fluxo de atendimento chamado **Pre-hands-off-g-v2**, seguindo a especificação enviada, sem alterar o fluxo "Pre-Hands off G" atual (que continua ativo até você trocar).

## Sequência do atendimento

```text
1. Nome (o usuário precisa dizer o próprio nome)
2. Dados pessoais (nascimento, país, formação, familiar europeu, Europa em 6 meses)
3. Objetivo na Espanha
4. Identificação do serviço no catálogo ativo
5. Handoff para o especialista + agente silenciado
```

Regra central: a cada mensagem o agente lê o texto inteiro, aproveita tudo que for válido e **só pergunta o que ainda falta**.

## Etapas do fluxo (como ficarão no editor visual)

| Etapa | Tipo | Conteúdo |
|---|---|---|
| `nome` | Pergunta geral (só `full_name` obrigatório) | "Olá! Eu sou a assistente virtual da CB ASESORIA. 😊 Qual o seu nome?" — reask: "Não consegui identificar o seu nome. Poderia informá-lo novamente, por favor?" |
| `dados_pessoais` | Pergunta geral | Texto exato da seção 6.3, com os 5 campos obrigatórios (data de nascimento, país, formação superior, familiar europeu, Europa nos últimos 6 meses) |
| `objetivo` | Pergunta geral | Texto exato da seção 6.4 (com quebra de linha), obrigatório `intent` + serviço |
| `transferencia` | Fim / handoff | "Perfeito, {nome}. Obrigada pelas informações. Já reuni os dados iniciais…" |

Todas as mensagens em PT-BR, ES, EN e FR (tradução automática já existente).

Quando o nome vier já na primeira mensagem, o agente envia a apresentação "Olá {nome}!Eu sou a assistente virtual da CB ASESORIA." e, no mesmo ciclo, já faz a próxima pergunta pendente — sem repetir nada que o usuário já informou.

## Ajustes de motor necessários

1. **Portão do nome (`flow-required.ts`)**: enquanto `full_name` não vier de uma mensagem escrita pelo usuário, o agente só envia a pergunta do nome. Dados extraídos antes do nome são guardados, não perguntados de novo. Nome de perfil/telefone do WhatsApp nunca preenche `full_name`; frases como "sou brasileiro"/"sou estudante" não contam como nome.
2. **Apresentação única**: marcador no estado da conversa para não repetir a apresentação nem em webhook duplicado; quando o nome é pedido pelo bot, a apresentação não é reenviada depois.
3. **Data de nascimento (`flow-birthdate.ts`)**: validação estrita `DD/MM/AAAA`, data real, sem data futura, mensagens específicas para formato inválido / data inexistente / data futura, e confirmação quando a data não bater com a idade declarada. Idade nunca gera data aproximada; gravação como `YYYY-MM-DD` sem conversão por fuso.
4. **País (`flow-intake.ts`)**: extrai só o país para `contacts.residence_country`; cidade sem país gera a pergunta "Em qual país você mora atualmente?"; nada é inferido do DDI. `contacts.is_in_spain` é derivado do país.
5. **Formação, familiar europeu e Europa em 6 meses**: interpretação semântica com resposta negativa válida (`false` conta como preenchido); "minha irmã mora na Espanha" pede esclarecimento sobre nacionalidade; período vago pede mês/ano.
6. **Serviço (`service-catalog.ts`)**: correspondência apenas em `service_types` com `is_active = true`, ordenada por `display_order`; ambiguidade pergunta com os nomes reais; sem correspondência pede nova explicação; grava `leads.service_type_id` e `leads.service_interest` (enum existente). "Quero trabalhar" pergunta se já existe oferta. Nenhum `service_cases` é criado no pré-handoff.
7. **Handoff**: só ocorre com todos os campos válidos; gera o resumo estruturado (seção 24) para o atendente, usa o mecanismo humano atual e silencia o agente. Webhook duplicado não repete handoff.
8. **Perguntas jurídicas**: preservadas no histórico e no resumo, com a resposta padrão de "vou usar sua dúvida para direcionar o atendimento".

## Detalhes técnicos

- Novo registro em `ai_agent_flows` (`status = RASCUNHO`) + 4 registros em `ai_agent_flow_steps`, criados via migração idempotente. Nada é apagado.
- Reuso da arquitetura atual: `flow-engine.ts`, `flow-turn.ts`, `flow-required.ts`, `flow-intake.ts`, `flow-birthdate.ts`, `flow-vars.ts`, `visual-flow.ts`, `service-catalog.ts`.
- Mensagens obrigatórias centralizadas nas `messages`/`reask_messages` das etapas (sem cópias espalhadas no código).
- `contacts.education_level` é texto livre no schema atual; será gravado com os rótulos padronizados usados hoje (superior completo / em andamento / incompleto / sem formação superior).
- Testes Deno cobrindo os cenários da seção 27 (nome, dados pessoais, data de nascimento, objetivo/serviço, handoff e idempotência), rodados junto com a suíte atual.

## Fora do escopo

- Não altera o fluxo "Pre-Hands off G" nem o comportamento pós-handoff existente.
- Não cria tabelas, colunas ou valores de enum novos.
- A ativação do v2 em produção fica com você, na tela de Agentes de IA.
