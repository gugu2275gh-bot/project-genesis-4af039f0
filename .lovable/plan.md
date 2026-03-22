

# Plano: Multichat com Roteamento Inteligente por Setor

## Resumo

Adicionar uma camada de controle de contexto que rastreia quais setores estao ativos em cada conversa de cliente, permitindo roteamento automatico de respostas. Incremental -- sem reescrever o sistema atual.

## O Que Ja Existe

- **`customer_sector_pending_items`**: rastreia pendencias por setor/contato (usado pelo smart-reactivation apos expiracao de sessao)
- **`smart-reactivation`**: roteamento inteligente, mas so atua quando a sessao expira
- **`send-whatsapp`**: envia mensagem mas nao registra o setor do remetente
- **`useLeadMessages`**: prefixa mensagens com `*Nome - Cargo*` mas nao grava setor no banco
- **`user_sectors`**: tabela que mapeia usuarios a setores (ja existe)

## O Que Falta

Durante a sessao ativa, nao ha controle de qual setor esta interagindo. O roteamento so funciona apos timeout.

---

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────┐
│                  ENVIO (Operador)                    │
│                                                     │
│  LeadChat → send-whatsapp → grava mensagem          │
│                ↓                                    │
│  UPDATE customer_chat_context                       │
│  (ultimo_setor, setores_ativos, ultima_interacao)   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              RECEBIMENTO (Cliente)                   │
│                                                     │
│  whatsapp-webhook → recebe mensagem                 │
│        ↓                                            │
│  CONSULTA customer_chat_context                     │
│        ↓                                            │
│  1 setor ativo? → rota direta                       │
│  N setores?     → LLM classifica entre os ativos    │
│  Baixa confiança? → pergunta ao cliente             │
│        ↓                                            │
│  Notifica setor correto                             │
└─────────────────────────────────────────────────────┘
```

---

## Alteracoes

### 1. Nova tabela: `customer_chat_context`

Migração SQL para criar a tabela de estado por cliente.

| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | uuid PK | |
| `contact_id` | uuid FK UNIQUE | Referencia a `contacts` |
| `ultimo_setor` | text | Ultimo setor que enviou mensagem |
| `setores_ativos` | jsonb | Array de `{setor, user_id, last_sent_at}` |
| `ultima_interacao` | timestamptz | Timestamp da ultima msg enviada por operador |
| `created_at` / `updated_at` | timestamptz | |

RLS: staff autenticado com roles pode ler/escrever.

### 2. Edge Function `send-whatsapp` -- registrar setor ao enviar

- Receber novo parametro opcional `sector` no body
- Apos envio bem-sucedido, fazer upsert em `customer_chat_context`:
  - Atualizar `ultimo_setor` com o setor do operador
  - Adicionar/atualizar o setor em `setores_ativos` (sem duplicar, com timestamp)
  - Atualizar `ultima_interacao`
- Para descobrir o setor do operador: consultar `user_sectors` + `service_sectors` pelo `user.id`

### 3. Frontend `useLeadMessages` -- enviar setor junto

- No `sendMessage`, buscar o setor principal do usuario logado (da query `user-info-for-chat` ja existente, expandir para incluir setor)
- Passar `sector` no body da chamada a `send-whatsapp`

### 4. Edge Function `whatsapp-webhook` -- roteamento ao receber

Antes do bloco de smart-reactivation (linha ~882), adicionar logica:

1. Buscar `customer_chat_context` do contato
2. Limpar setores expirados de `setores_ativos` (>1h sem interacao)
3. Se 1 setor ativo restante:
   - Notificar usuarios daquele setor (via `notifications`)
   - Marcar `routed_to_sector` nos logs
4. Se N setores ativos:
   - Usar LLM (se disponivel) para classificar mensagem entre os setores ativos
   - Se confianca >= 0.85: rota direta
   - Se confianca < 0.85: enviar mensagem ao cliente pedindo esclarecimento (lista numerada dos setores ativos)
5. Se 0 setores ativos: fluxo normal (IA ou atendente geral)

### 5. Notificacoes por setor

- Quando o roteamento identifica o setor, buscar usuarios com aquele setor em `user_sectors` e criar `notifications` para eles
- Adicionar campo opcional `sector` na tabela `notifications` para filtrar no frontend

### 6. Indicador visual no chat (frontend)

- No `LeadChat`, mostrar badge do setor ativo atual do contexto
- Quando ha multiplos setores ativos, mostrar todos como badges

---

## Arquivos Afetados

| Arquivo | Acao |
|---|---|
| Nova migracao SQL | Criar tabela `customer_chat_context`, adicionar coluna `sector` em `notifications` |
| `supabase/functions/send-whatsapp/index.ts` | Receber `sector`, fazer upsert no contexto |
| `supabase/functions/whatsapp-webhook/index.ts` | Consultar contexto, rotear, notificar por setor |
| `src/hooks/useLeadMessages.ts` | Enviar setor do usuario na chamada |
| `src/components/crm/LeadChat.tsx` | Exibir badges de setores ativos |

## Detalhes Tecnicos

### Migracao SQL

```sql
CREATE TABLE customer_chat_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  ultimo_setor text,
  setores_ativos jsonb DEFAULT '[]'::jsonb,
  ultima_interacao timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(contact_id)
);

ALTER TABLE customer_chat_context ENABLE ROW LEVEL SECURITY;

-- Staff pode gerenciar
CREATE POLICY "Staff can manage chat context" ON customer_chat_context
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR',
    'ATENCAO_CLIENTE','ATENDENTE_WHATSAPP','JURIDICO','FINANCEIRO','TECNICO']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['ADMIN','MANAGER','SUPERVISOR',
    'ATENCAO_CLIENTE','ATENDENTE_WHATSAPP','JURIDICO','FINANCEIRO','TECNICO']::app_role[]));

-- Opcional: coluna sector em notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sector text;
```

### Logica de expiracao em `setores_ativos`

No webhook, ao consultar o contexto, filtrar o array JSON:
```typescript
const SECTOR_TIMEOUT_MS = 60 * 60 * 1000 // 1 hora
const now = Date.now()
const activeCtx = context.setores_ativos.filter(
  s => now - new Date(s.last_sent_at).getTime() < SECTOR_TIMEOUT_MS
)
```

### Roteamento LLM (reusa infraestrutura existente)

Prompt compacto enviado ao OpenAI:
```
Classifique a mensagem do cliente entre APENAS estes setores: [Financeiro, Jurídico].
Responda JSON: {"sector":"...","confidence":0.0-1.0}
```

Usa a mesma chave OpenAI ja configurada em `system_config`.

### Timeout configuravel

Adicionar `chat_sector_timeout_minutes` em `system_config` (default: 60), consultavel no webhook.

