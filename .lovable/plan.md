# Gravação de conversas do WhatsApp (período de testes)

Objetivo: guardar uma cópia permanente de tudo o que foi conversado no WhatsApp (cliente e agente), que sobreviva à limpeza da base de testes, sem alterar em nada o comportamento atual do atendimento.

## Como vai funcionar

- Nova chave em **Configurações > Sistema**: "Gravar conversas do WhatsApp (auditoria de testes)". Ligada/desligada por ADMIN.
- Com a chave ligada, toda mensagem registrada no chat (entrada do cliente e saída do agente/atendente) é copiada para um arquivo separado de auditoria.
- Junto de cada conversa também ficam gravados os **campos identificados pelo agente** (nome, idade, país/cidade, formação, familiar europeu, esteve na Europa, objetivo/serviço etc.), com o valor reconhecido, a etapa do fluxo e o campo do CRM em que foi gravado.
- O arquivo de auditoria **nunca** é apagado pela limpeza de base — ele só cresce. Ao limpar a base, o contador de "rodada de testes" avança: as conversas seguintes do mesmo número entram como conversa nova, e todas as rodadas anteriores continuam consultáveis.
- Nada é lido de volta pelo agente: o arquivo é apenas documental, não entra no contexto da IA nem em nenhuma regra de fluxo.

## Consulta

Nova aba em Configurações: **Logs de Conversas**.

- Lista agrupada por rodada de testes + telefone, com nome do contato (quando existia), data de início/fim e nº de mensagens.
- Ao abrir, mostra a transcrição em ordem cronológica, marcando cada linha como Cliente ou Agente, com data/hora e canal, e ao lado um painel com os campos identificados naquela conversa (valor, quando foi capturado e onde foi gravado).
- Botão de exportar a conversa (ou o filtro atual) em CSV, incluindo os campos identificados.

## Detalhes técnicos

**Banco (migração):**
- Tabela `whatsapp_conversation_archive`: `id`, `session_seq` (rodada de testes), `phone` (text), `lead_id`, `contact_id`, `contact_name`, `direction` (`INBOUND`/`OUTBOUND`), `body`, `media_url`, `media_type`, `origem`, `setor`, `source_message_id`, `created_at`. Índices em `(session_seq, phone, created_at)` e `created_at`.
- Tabela `whatsapp_conversation_fields`: `id`, `session_seq`, `phone`, `lead_id`, `contact_id`, `field_key` (ex.: `full_name`, `age`, `residence_country`, `objetivo`), `field_label`, `value_text`, `value_raw` (jsonb), `crm_target` (campo do CRM alvo, ex.: `contact.full_name`), `flow_id`, `step_code`, `captured_at`, `created_at`. Índice em `(session_seq, phone)` e único por `(session_seq, phone, field_key, captured_at)`.
- GRANTs em ambas: `SELECT` para `authenticated`, `ALL` para `service_role` (sem `anon`). RLS ligada; leitura apenas para ADMIN/MANAGER/SUPERVISOR/DIRETORIA via `has_any_role`; escrita apenas via trigger/edge function com `service_role`.
- Trigger `AFTER INSERT` em `mensagens_cliente` (função security definer) que, se `system_config.whatsapp_conversation_logging_enabled = 'true'`, grava uma linha por lado preenchido (`mensagem_cliente` → INBOUND, `mensagem_IA` → OUTBOUND) com o `session_seq` atual. Trigger com tratamento de exceção para nunca quebrar o atendimento.
- Chaves em `system_config`: `whatsapp_conversation_logging_enabled` (default `true`) e `whatsapp_conversation_log_session` (default `1`).
- `cleanup_test_data()`: incrementar `whatsapp_conversation_log_session` ao final e **não** incluir `whatsapp_conversation_archive` nem `whatsapp_conversation_fields` na lista de tabelas apagadas.

**Captura dos campos identificados:**
- Ponto único de gravação em `supabase/functions/whatsapp-webhook/lib/visual-flow.ts`, onde os `captured_fields` do turno já são consolidados e persistidos no CRM: além da gravação atual, enviar (fire-and-forget) o diff de campos novos/alterados para `whatsapp_conversation_fields`, junto com `flow_id`/`step_code` e o `crm_target` derivado do `field_mapping` da etapa.
- A gravação é assíncrona e protegida por try/catch: falha na auditoria nunca interrompe o atendimento; se a chave estiver desligada, nada é enviado.

**Frontend:**
- `src/pages/settings/SystemSettings.tsx`: nova entrada booleana na categoria de integrações.
- Novo `src/pages/settings/ConversationLogs.tsx` + hook `src/hooks/useConversationArchive.ts` (React Query, filtros por rodada/telefone/período), registrado como aba em `src/pages/settings/Settings.tsx`, visível só para os papéis acima.

Escolha do trigger em vez de instrumentar o edge function: `mensagens_cliente` recebe inserts de mais de 15 pontos diferentes do webhook, e o trigger cobre todos sem tocar no fluxo em execução.
