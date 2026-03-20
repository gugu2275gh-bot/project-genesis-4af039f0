

# Plano: Smart Session Reactivation Engine

## Resumo

Motor de reativação inteligente que detecta sessões expiradas, identifica pendências abertas por setor, usa OpenAI (existente) para classificar a intenção da nova mensagem, e roteia ou pede confirmação ao cliente via WhatsApp.

## Implementação em 5 Fases

### Fase 1: Banco de Dados

**Migration 1 -- Novas configs no system_config** (INSERT via insert tool):
- `active_session_timeout_minutes` = `120`
- `enable_smart_reactivation` = `true`
- `llm_confidence_threshold_direct_route` = `0.90`
- `llm_confidence_threshold_confirmation` = `0.70`
- `reactivation_context_message_limit` = `5`

**Migration 2 -- Tabela `customer_sector_pending_items`**:
- `id`, `contact_id` (FK contacts), `service_case_id` (FK service_cases, nullable), `sector` (text), `lead_id` (FK leads, nullable)
- `status` (open/waiting_customer/in_progress/resolved/cancelled)
- `pending_subject_title`, `pending_reason`, `pending_context_summary`, `last_question_to_customer`
- `awaiting_customer_reply` (boolean), `priority` (int)
- `last_company_message_at`, `last_customer_message_at`
- `created_at`, `updated_at`, `resolved_at`, `closed_by_user_id`, `metadata_json` (jsonb)
- RLS: staff autenticado pode ler/escrever

**Migration 3 -- Tabela `reactivation_resolutions`**:
- `id`, `contact_id` (FK contacts), `incoming_message_text`
- `session_expired`, `open_pending_count`, `llm_input_snapshot` (jsonb), `llm_output_snapshot` (jsonb)
- `selected_sector`, `selected_pending_id` (FK pending_items, nullable), `confidence_score` (decimal)
- `action_taken` (enum: direct_route/ask_confirmation/ask_disambiguation/new_subject/fallback_manual/insufficient_context)
- `user_confirmation_status` (pending/confirmed/denied/no_response), `confirmation_attempt_count`
- `secondary_pending_id`, `ranked_candidates_json` (jsonb)
- `created_at`, `updated_at`
- RLS: staff autenticado pode ler/escrever

### Fase 2: Edge Function `smart-reactivation`

Nova edge function com a lógica do SmartSessionReactivationEngine:

1. **Input**: `contactId`, `incomingMessageText`, `phoneNumber`, `leadId`
2. **Carregar configs** do `system_config` (timeout, thresholds, enable flag)
3. **Calcular expiração**: buscar `MAX(created_at)` de `mensagens_cliente` para leads do contato. Se `now() - last_message < timeout` → retornar `CURRENT_FLOW`
4. **Verificar resolução pendente**: se existe `reactivation_resolutions` com `user_confirmation_status = 'pending'` para este contato → processar como resposta de confirmação (sim/não mapping)
5. **Buscar pendências abertas** em `customer_sector_pending_items` com `status IN ('open','waiting_customer')` para este `contact_id`
6. **Se zero pendências** → retornar `NEW_SUBJECT`
7. **Montar contexto por pendência**: últimas N mensagens relevantes de cada lead/caso vinculado
8. **Chamar OpenAI** (usando `openai_api_key` existente no system_config) com o prompt classificador + tool calling para JSON estruturado
9. **Aplicar decisão** baseada nos thresholds configurados
10. **Registrar em `reactivation_resolutions`**
11. **Retornar** `{ action, message_to_customer, selected_pending_id, selected_sector }`

**Fallback sem LLM**: se OpenAI falhar → pendência única = confirmar; múltiplas = listar opções; registrar como fallback_manual.

**Confirmation reply mapping** (hardcoded):
- Positivo: sim, isso, correto, exatamente, pode seguir, é esse
- Negativo: não, não é isso, outro assunto, nada a ver, errado
- Max 2 tentativas de desambiguação

### Fase 3: Integrar no `whatsapp-webhook`

Modificar o webhook existente, inserindo a lógica de reativação **antes** da seção de IA (linha ~875):

```text
Fluxo modificado:
1. Parse message, find/create contact & lead (existente)
2. Store message in mensagens_cliente (existente)
3. >>> NOVO: Chamar smart-reactivation via fetch interno
   - Se CURRENT_FLOW → seguir fluxo normal (IA agent)
   - Se action retorna mensagem → enviar via WhatsApp e SKIP IA agent
   - Se direct_route → vincular mensagem ao setor/pendência
   - Se NEW_SUBJECT → seguir fluxo normal
4. AI Agent section (existente, só executa se reactivation retornou CURRENT_FLOW ou NEW_SUBJECT)
```

### Fase 4: Interface Administrativa

**4.1 SystemSettings.tsx -- Nova seção "Reativação Inteligente"**:
- Adicionar configs ao `SYSTEM_CONFIGS` array com `category: 'reactivation'`:
  - Timeout em minutos (input number)
  - Toggle habilitar/desabilitar (switch)
  - Threshold roteamento direto (input number)
  - Threshold confirmação (input number)
  - Limite mensagens contexto (input number)

**4.2 Componente de Pendências no ContactDetail**:
- Nova seção "Pendências por Setor" na ficha do contato
- Lista pendências abertas com status, setor, resumo, data
- Botão para criar pendência manual (dialog com campos: setor, título, motivo, pergunta ao cliente)
- Botão para resolver/cancelar pendência
- Hook `usePendingItems(contactId)` para CRUD

**4.3 Componente de Log de Reativações**:
- Nova aba ou seção no ContactDetail com histórico de decisões
- Exibir: data, mensagem recebida, candidatos, confiança, ação tomada, status confirmação
- Hook `useReactivationLog(contactId)` para leitura

### Fase 5: Atualização Automática de Pendências (sessão expirada)

Lógica no `whatsapp-webhook`:
- Quando um operador envia mensagem via SISTEMA com pergunta/solicitação → criar/atualizar pendência com `awaiting_customer_reply = true` e `last_question_to_customer` = conteúdo
- Quando `service_case` muda para status final (APROVADO/NEGADO/CONCLUIDO) → marcar pendências relacionadas como `resolved`
- A criação manual de pendências continua disponível no frontend

## Arquivos Afetados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/` | 2 novas migrations (tabelas + RLS) |
| `system_config` (dados) | 5 novos registros via insert |
| `supabase/functions/smart-reactivation/index.ts` | Novo (~350 linhas) |
| `supabase/functions/whatsapp-webhook/index.ts` | Modificar (~50 linhas adicionais) |
| `supabase/config.toml` | Adicionar smart-reactivation |
| `src/pages/settings/SystemSettings.tsx` | Adicionar seção reativação |
| `src/pages/crm/ContactDetail.tsx` | Adicionar seções pendências + log |
| `src/hooks/usePendingItems.ts` | Novo hook CRUD |
| `src/hooks/useReactivationLog.ts` | Novo hook leitura |
| `src/integrations/supabase/types.ts` | Atualizado automaticamente |

## Ordem de Execução

1. Migrations (tabelas + RLS) + inserts de configs
2. Edge function `smart-reactivation`
3. Modificar `whatsapp-webhook` para chamar reativação
4. Frontend: configs em SystemSettings
5. Frontend: pendências e log no ContactDetail
6. Lógica de atualização automática de pendências

