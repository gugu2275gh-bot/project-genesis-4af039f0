## Objetivo

Cadastrar na tela "Agentes de IA" um agente chamado **AGENTE 1.0** que não é uma cópia decorativa: ele carrega exatamente a configuração hoje em execução no atendimento WhatsApp e, ao ser editado, altera de fato o comportamento do agente em produção.

## Situação atual (verificada)

O agente ativo tem a configuração espalhada em quatro lugares:

1. **Banco (`system_config`)** — `whatsapp_bot_enabled = true`, `whatsapp_bot_system_prompt` (diretrizes da CB Asesoría), `kb_strict_mode = false`, `kb_strict_fallback_message`.
2. **Banco (`llm_settings`)** — cascata de 4 modelos: `gemini-3.6-flash` → `gemini-3-flash-preview` → `gemini-2.5-flash-lite` → `gpt-4o-mini`.
3. **Código (`whatsapp-webhook/index.ts`)** — o prompt principal (personalidade, regras anti-repetição, regra de datas DD/MM/YYYY, escopo de atuação, objetivos da conversa).
4. **Código (`lib/language.ts`, `lib/questions.ts`, `lib/flow-machine.ts`)** — os textos fixos do fluxo nos 4 idiomas (saudação, pergunta de nome, localização, blocos dentro/fora da Espanha, empadronamiento, pré-handoff e handoff) e o grafo de etapas.

## O que será feito

### 1. Banco de dados

- `ai_agents`: novos campos `is_production` (apenas um agente pode estar em produção), `runtime_config` (bot ligado/desligado, modo estrito da base de conhecimento, mensagem de fallback) e `model_cascade` (lista ordenada de provedor + modelo).
- `ai_agent_flow_steps`: campo `messages` com texto por idioma (PT, ES, EN, FR) e `reask_messages` (mensagem de repergunta quando a resposta é inválida).
- Nova tabela `ai_agent_texts`: catálogo de mensagens que não são etapas (saudação linha 1 e 2, introduções "dentro/fora da Espanha", catálogo de serviços, pré-handoff H1/H2, handoff H3, sufixo pós-handoff, repergunta de cidade inválida), cada uma com as 4 traduções.
- Migração de seed criando **AGENTE 1.0** (status ATIVO, em produção), o fluxo **"Fluxo CB Asesoría 1.0"** com as etapas reais (ABERTURA, NAME, LOCATION, INSIDE_ENTRY_DATE, INSIDE_EMPADRONADO, OUTSIDE_AGE, PRE_HANDOFF, HANDOFF, FREE_KB) e todos os textos atuais copiados literalmente do código e do `system_config`.
- RLS e GRANTs seguindo o padrão já aplicado: só ADMIN gerencia.

### 2. Runtime do WhatsApp (sem mudar o comportamento atual)

- Novo módulo `lib/agent-config.ts`: carrega, no início de cada requisição, o agente em produção + etapas + textos.
- `language.ts` e `questions.ts` passam a consultar um registro de sobreposições preenchido por esse módulo; **sem agente em produção ou sem texto configurado, cai no texto fixo de hoje**. Nenhuma chamada existente muda de assinatura.
- O prompt principal do `index.ts` vira o `prompt_base` do agente (com marcadores para idioma, nome do cliente, data de hoje e frases canônicas); se o carregamento falhar, usa o texto fixo atual.
- A cascata passa a vir do agente; `llm_settings` continua sincronizado para a aba LLM não divergir.
- `kb_strict_mode`, mensagem de fallback e liga/desliga do bot continuam em `system_config`, mas com escrita espelhada a partir da tela do agente.

### 3. Interface

- Lista de agentes: selo "EM PRODUÇÃO" e bloqueio de exclusão/desativação acidental do agente de produção (exige confirmação).
- Formulário do AGENTE 1.0 ganha:
  - **Modelos**: editor da cascata (ordenar, ativar/desativar, trocar provedor/modelo).
  - **Prompt**: prompt base + diretrizes da empresa.
  - **Mensagens do fluxo**: cada etapa com abas PT / ES / EN / FR, mensagem principal e repergunta.
  - **Mensagens gerais**: saudação, introduções, catálogo de serviços, pré-handoff, handoff e pós-handoff, também por idioma.
  - **Runtime**: bot ligado, modo estrito da base de conhecimento, mensagem de fallback.
- Cada salvamento gera uma nova versão com snapshot completo, permitindo comparar e restaurar.
- O sandbox de teste passa a usar exatamente a mesma configuração carregada em produção.

### 4. Validação

- Rodar a suíte Deno existente do `whatsapp-webhook` (mais de 40 arquivos de teste, incluindo os multi-idioma e de anti-repetição) antes e depois, garantindo 100% verde com o seed aplicado.
- Teste manual do sandbox com o AGENTE 1.0 nos 4 idiomas.

## Detalhes técnicos

- Os detectores anti-repetição (`preHandoffSummarySent`, `stripRepeatedOpener`, `isServicesOfferedMessage`, etc.) usam âncoras por expressão regular. Serão complementados com comparação normalizada contra o texto configurado, para continuarem funcionando quando o texto for editado na tela.
- O grafo de transições (`flow-machine.ts`) continua determinístico em código nesta etapa: a tela edita textos, validações e mensagens, não a ordem das etapas. Reordenação de etapas fica como etapa seguinte, se desejada.
- Carregamento com cache curto em memória por instância da função, para não adicionar latência por turno.

## Fora do escopo

- Trocar o motor de conversação por um agente novo.
- Alterar a integração Twilio, os quick replies ou a máquina de estados.
- Conectar outros agentes (além do AGENTE 1.0) ao atendimento real.
