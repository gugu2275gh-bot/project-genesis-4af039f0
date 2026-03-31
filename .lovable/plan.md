

## Classificação de Templates: SLA vs Operacional

### Objetivo
Adicionar campo `template_category` (`sla` | `operational`) à tabela `whatsapp_templates`. Templates SLA ficam vinculados a automações. Templates operacionais ficam disponíveis como dropdown no chat para envio manual quando a janela de 24h expirar.

### Alterações

#### 1. Migração SQL
Adicionar coluna `template_category` com default `sla` (todos existentes viram SLA automaticamente):
```sql
ALTER TABLE whatsapp_templates 
ADD COLUMN template_category text NOT NULL DEFAULT 'sla' 
CHECK (template_category IN ('sla', 'operational'));
```

#### 2. Hook `useWhatsAppTemplates.ts`
- Adicionar `template_category` à interface `WhatsAppTemplate`
- Adicionar `template_category` ao `createTemplate` mutation
- Aceitar `template_category` no `updateTemplate` mutation
- Exportar query filtrada para templates operacionais aprovados: `useOperationalTemplates()`

#### 3. Tela de Settings (`WhatsAppTemplatesSettings.tsx`)
- Adicionar campo **Categoria** (SLA / Operacional) no diálogo de criação
- Quando SLA: mostrar campo "Tipo de Automação" (dropdown com `AUTOMATION_LABELS`)
- Quando Operacional: ocultar campo de automação (usar `template_name` como identificador)
- Na tabela principal: mostrar badge "SLA" ou "Operacional" na coluna Tipo
- Adicionar botao **Salvar Alterações** para edição inline da categoria na tabela

#### 4. Chat (`LeadChat.tsx`)
- Buscar templates operacionais aprovados via `useOperationalTemplates()`
- Adicionar botao/dropdown ao lado do input de mensagem para selecionar template operacional
- Ao selecionar, preencher variáveis e enviar via `send-whatsapp` usando `ContentSid`

### Fluxo do usuário

```text
Criar Template
  ├─ Categoria: SLA
  │   └─ Tipo de Automação: [dropdown com AUTOMATION_LABELS]
  │   └─ Usado automaticamente pelas automações
  │
  └─ Categoria: Operacional
      └─ Tipo de Automação: livre (identificador)
      └─ Disponível no dropdown do chat dos setores
      └─ Usado para recontactar cliente fora da janela 24h
```

### Detalhes técnicos

**Migração**: Uma coluna `template_category` com check constraint. Default `sla` garante que os 13 templates existentes sejam marcados como SLA.

**Botão Salvar Alterações**: Na tabela de templates, a categoria será editável inline (dropdown). Um estado local rastreia alterações pendentes e o botão "Salvar Alterações" aparece quando há mudanças, fazendo batch update.

**Chat - dropdown operacional**: Novo componente dropdown no input area do chat que lista templates operacionais aprovados. Ao selecionar, substitui variáveis (nome do cliente, etc.) e envia via `supabase.functions.invoke('send-whatsapp')` com o `ContentSid` do template.

