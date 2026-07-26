## Objetivo

Evoluir a área **Configurações → Agentes de IA** para que o AGENTE 1.0 (e qualquer agente novo) seja configurável por completo pela tela: modelos vindos do LLM, fluxos com fases, prompt dividido em blocos e todos os textos nos 4 idiomas. O comportamento em produção só muda quando o campo é preenchido — o código continua como fallback.

---

## 1. Seleção de modelos a partir das configurações de LLM

- Criar um hook `useLLMModels` que lê `llm_settings` e devolve apenas os itens da cascata com `enabled = true`, com rótulo `Provedor · modelo`.
- Na aba **Geral** do agente, trocar o campo livre "Modelo" por um **select** alimentado por esses modelos (o provedor passa a ser derivado do item escolhido). Manter opção "Outro modelo (manual)" para casos avançados.
- Na aba **Produção**, a cascata de modelos passa a usar o mesmo select em vez de texto livre, com botões de ordenar/remover.
- Se um agente estiver apontando para um modelo que não está mais ativo no LLM, exibir aviso visual no item.

## 2. Fluxos com fases (pré-handoff e handoff)

Banco:
- `ai_agent_flows`: adicionar `phase` (`PRE_HANDOFF` | `HANDOFF` | `GERAL`).
- `ai_agent_flow_steps`: adicionar `phase` (herda a do fluxo, editável por etapa).
- `ai_agents`: adicionar `pre_handoff_flow_id` e `handoff_flow_id` (o `flow_id` atual continua para compatibilidade).

Tela:
- Nova aba/tela **Fluxos** com criação de fluxo já pedindo a fase, listagem separada em duas seções: **Pré-handoff** e **Handoff**.
- Editor de etapas com: código, nome, mensagem (por idioma), tipo de resposta, validação, próxima etapa, condição de saída, permitir pergunta paralela, handoff, ordem — com reordenação por arrastar/subir-descer.
- Na aba **Fluxo** do agente: dois selects — "Fluxo de pré-handoff" e "Fluxo de handoff" — filtrados pela fase correspondente.
- Nada disso altera a máquina de estados atual; os fluxos ficam como configuração declarativa consumida pelo runtime apenas onde já existe override.

## 3. Prompt gigante dividido em blocos

O `prompt_flow` deixa de ser um único textão. Ele passa a ser montado a partir de blocos nomeados, guardados em `prompt_blocks` (JSON) no agente:

| Bloco | Onde é editado |
|---|---|
| Identidade / prompt base | Geral |
| Regra de idioma | Comportamento |
| Personalidade e tom, anti-repetição | Comportamento |
| Regra de datas | Comportamento |
| Escopo de atuação / assuntos proibidos | Comportamento |
| Objetivos da conversa (etapas) | Fluxo |
| Base de conhecimento e fallback | Geral |
| Handoff | Geral |

- Na primeira abertura, o texto atual é fatiado pelos cabeçalhos `##` e cada trecho vira o conteúdo inicial do bloco correspondente — nada se perde.
- O prompt final é remontado na ordem dos blocos, preservando os placeholders (`{{LANGUAGE_DIRECTIVE}}`, `{{TODAY}}`, `{{ASK_NAME}}`, etc.).
- A aba **Produção** ganha um "Pré-visualizar prompt final" (somente leitura) e um modo avançado para quem quiser editar o texto bruto.

## 4. Tooltips explicativos

Adicionar tooltip de ajuda (ícone de interrogação) em: **Temperatura** ("Controla o quanto o agente varia as respostas: valores baixos, como 0.2, deixam-no mais previsível e literal; valores altos, como 0.9, mais criativo e imprevisível. Para atendimento, recomenda-se entre 0.3 e 0.7"), **Limite de tokens**, **Cascata de modelos**, **Modo estrito da base**, **Fase do fluxo** e **Capacidades**.

## 5. Multi-idioma (PT, ES, EN, FR) com tradução por IA

- Todos os campos de texto voltados ao cliente passam a ser multi-idioma: mensagens do comportamento (não sei responder, fora do assunto, handoff), fallback, mensagem de encaminhamento e mensagens das etapas do fluxo.
- Cada campo desses ganha um seletor de idioma (PT/ES/EN/FR) e um botão **"Traduzir para os outros idiomas"** que usa a IA já integrada e preenche as demais versões — sempre editáveis depois.
- Botão global "Traduzir tudo o que estiver faltando" no topo do diálogo.
- Textos internos (prompt base, regras) continuam num idioma só, já que a diretiva de idioma cuida da tradução em execução.

## 6. Tom de voz com opções

O campo livre "Tom de voz" vira um select: Cordial e acolhedor, Profissional e objetivo, Formal, Consultivo, Informal e próximo, Empático, Direto — com opção "Personalizado" que libera o campo de texto.

---

## Detalhes técnicos

- Migração: colunas `phase` em `ai_agent_flows` e `ai_agent_flow_steps`; `pre_handoff_flow_id`/`handoff_flow_id` e `prompt_blocks` (jsonb) em `ai_agents`; `messages` (jsonb por idioma) em `ai_agent_flow_steps`. Todas com default seguro para não quebrar registros existentes; RLS/grants seguem o padrão já aplicado (somente ADMIN gerencia).
- Nova edge function `ai-agent-translate` (ADMIN) usando a cascata de LLM já configurada para traduzir os campos.
- `agent-runtime.ts` / `prompt-template.ts` passam a montar o prompt a partir de `prompt_blocks` quando presentes, caindo no `prompt_flow` e depois no default do código.
- Frontend: `AgentFormDialog.tsx` reorganizado, novos componentes `MultiLangField`, `ModelSelect` e `FlowPhaseEditor`; `FlowsManagement.tsx` reescrito com as duas fases.
- Nada é alterado na integração Twilio, no pré-handoff existente nem na máquina de estados.
