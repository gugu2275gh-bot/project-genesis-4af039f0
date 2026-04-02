

## Atualizar Status Reais do WhatsApp + Submeter Templates para Aprovação

### Problema
Os status atuais no sistema (draft, pending, approved, rejected, error) não cobrem todos os estados reais retornados pela API do WhatsApp/Twilio. A imagem do Twilio mostra templates com status como "WhatsApp business initiated" e "WhatsApp user initiated" que indicam elegibilidade real.

### O que será feito

#### 1. Expandir STATUS_CONFIG com todos os status reais
Adicionar status que a Twilio Content API retorna via ApprovalRequests:

| Status | Label | Cor |
|---|---|---|
| `draft` | Rascunho | Azul |
| `pending` | Pendente | Amarelo |
| `approved` | Aprovado | Verde |
| `rejected` | Rejeitado | Vermelho |
| `paused` | Pausado | Laranja |
| `disabled` | Desabilitado | Cinza |
| `unsubmitted` | Não Submetido | Cinza claro |
| `received` | Recebido | Azul |
| `error` | Erro | Vermelho |

#### 2. Submeter TODOS os templates para aprovação
Adicionar um botão "Submeter Todos para Aprovação" que chama `submitTemplates.mutate()` sem filtro de tipo, submetendo todos os templates que não estão aprovados. A edge function já faz skip de templates aprovados.

#### 3. Atualizar edge function para mapear status corretamente
No `check_status` e `sync_from_twilio`, aceitar e persistir os status adicionais retornados pela Twilio (paused, disabled, received, unsubmitted) em vez de ignorá-los.

### Detalhes técnicos

- **`WhatsAppTemplatesSettings.tsx`**: Expandir `STATUS_CONFIG` com os novos status e cores. Adicionar botão de submissão em massa.
- **`submit-whatsapp-templates/index.ts`**: No `sync_from_twilio`, aceitar todos os status retornados (não apenas approved/rejected/pending). No `check_status`, mapear status adicionais.
- **`useWhatsAppTemplates.ts`**: Interface `WhatsAppTemplate.status` já é string, sem alteração necessária.

### Arquivos modificados
- `src/pages/settings/WhatsAppTemplatesSettings.tsx`
- `supabase/functions/submit-whatsapp-templates/index.ts`

