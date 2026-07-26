## Objetivo

Criar a Central de Gestão de Agentes de IA, isolada do agente atual do WhatsApp. Nada do webhook, Twilio, máquina de estados ou pré-handoff será tocado.

## Estado atual (verificado)

- Configuração do modelo hoje vive em `llm_settings` (cascata provider/model) e em `system_config` (prompts/regras do bot).
- Fluxo, regras e estados estão em código, em `supabase/functions/whatsapp-webhook/` (`index.ts`, `lib/ai.ts`, `lib/extract.ts`, `overrides.ts`, `language.ts`).
- Base de conhecimento em `knowledge_base` + `match_knowledge_base`.
- Configurações são páginas dentro de `src/pages/settings/Settings.tsx` (abas), com acesso restrito a ADMIN/MANAGER.

Nenhuma dessas estruturas será alterada ou removida — as novas tabelas coexistem.

## Banco de dados (novas tabelas, com RLS)

Todas com `id`, `created_at`, `updated_at`, `created_by`, `updated_by`, GRANTs para `authenticated`/`service_role`, RLS liberando leitura/escrita apenas para ADMIN (e leitura para MANAGER).

1. `ai_agents` — nome, descrição, provider, model, status (`ATIVO`/`INATIVO`/`RASCUNHO`), temperature, max_tokens, default_language, prompt_base, prompt_behavior, fallback_message, handoff_message, `flow_id` (FK opcional → `ai_agent_flows`), `capabilities` jsonb (responder, consultar KB, RAG, perguntar, executar fluxo, encaminhar humano), `behavior` jsonb (personalidade, tom, idiomas, regras obrigatórias/proibidas, informações proibidas, comportamento sem resposta/fora de assunto/handoff), `current_version`, `parent_agent_id` (para orquestração futura, sem ciclo).
2. `ai_agent_versions` — `agent_id`, `version_number`, `config` jsonb (snapshot completo), status, `created_by`. Unique (agent_id, version_number).
3. `ai_agent_flows` — nome, descrição, status. Entidade independente do agente.
4. `ai_agent_flow_steps` — `flow_id`, `step_code`, nome, descrição, `message`, `answer_type` (texto/nome/email/número/data/sim-não/opção/botões/múltipla escolha), `validation` jsonb, `next_step_code`, `exit_condition`, `allow_parallel_question`, `allow_free_answer`, `handoff`, `order_index`.
5. `ai_agent_test_sessions` — `agent_id`, `agent_version_id`, título, status.
6. `ai_agent_test_messages` — `session_id`, role, content, `agent_id`, `model`, `provider`, latência, tokens (permite comparar agentes depois).

Trigger de `updated_at` reaproveitando `public.update_updated_at_column()`.

## Backend

- Nova edge function `ai-agent-sandbox`: recebe `agent_id`/`version_id` + histórico da sessão, monta o prompt final (prompt base + comportamento + regras do fluxo + configurações), chama Gemini ou OpenAI conforme o provider do agente, grava a resposta em `ai_agent_test_messages` e devolve ao painel.
- Não usa Twilio, não envia WhatsApp, não toca em `whatsapp-webhook` nem em `llm-config`.
- Montagem do prompt em módulo próprio (`lib/prompt-builder.ts`) para poder ser reutilizado quando os agentes forem plugados no atendimento real.

## Frontend

Novos arquivos em `src/pages/ai-agents/`:
- `AIAgents.tsx` — lista/tabela: nome, descrição, modelo, provedor, status, versão, atualizado em, criado em, ações (visualizar, editar, duplicar, ativar/desativar, testar).
- `AgentForm.tsx` — cadastro/edição com abas: Geral (modelo, temperatura, tokens, idioma, prompts, mensagens), Comportamento, Capacidades, Fluxo (seleciona um `ai_agent_flow` existente — nunca duplica o fluxo), Versões (histórico).
- `FlowsManagement.tsx` + `FlowStepsEditor.tsx` — CRUD de fluxos e etapas.
- `AgentSandbox.tsx` — escolher agente + versão, conversar, limpar, novo teste.
- Hooks em `src/hooks/useAIAgents.ts` com React Query.
- Rota `/ai-agents` em `src/App.tsx` (guard ADMIN) e item na sidebar/Configurações seguindo o padrão atual.

Duplicar agente copia apenas o registro do agente e aponta para o mesmo `flow_id`.

## Não será feito nesta etapa

Conexão com o atendimento real, orquestrador, A/B automático, rollback de versão, alteração de qualquer arquivo do `whatsapp-webhook`.
