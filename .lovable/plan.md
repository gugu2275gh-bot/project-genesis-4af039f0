

## Plano: Gerar Relatório de Auditoria Completa do Sistema (PDF)

### Escopo

Gerar um PDF abrangente com auditoria de todas as funcionalidades, regras de negócio, integração WhatsApp, controle de acesso (RBAC), RLS, Edge Functions e pontos de atenção identificados.

### Conteúdo do Relatório

O PDF cobrirá as seguintes seções:

1. **Visão Geral do Sistema** - Stack, arquitetura, módulos
2. **Autenticação e Controle de Acesso (RBAC)** - Roles, Sidebar, RLS policies, admin vs comum
3. **Módulos do Sistema** - CRM, Financeiro, Jurídico, Técnico, Portal do Cliente
4. **Integração WhatsApp** - Webhook, send-whatsapp, roteamento multichat, reativação inteligente
5. **Automações SLA** - Tipos, configuração, lembretes
6. **Banco de Dados** - Tabelas, triggers, functions, RLS
7. **Edge Functions** - Inventário e análise
8. **Pontos de Atenção e Bugs Identificados** - Inconsistências, riscos de segurança, melhorias recomendadas

### Implementação

- Gerar via script Python usando reportlab
- Salvar em `/mnt/documents/auditoria_sistema_cb_asesoria.pdf`
- QA visual antes de entregar

### Achados Preliminares

Problemas identificados durante a análise:
- Sidebar não inclui SUPERVISOR, DIRETORIA, ATENDENTE_WHATSAPP na maioria dos menus
- Bootstrap key hardcoded na Edge Function admin-create-user
- Webhook log update usa `eq('raw_payload', payload)` que pode não funcionar com JSONB
- Tarefas visíveis para todos (sem filtro de role no Sidebar)
- isStaff() não inclui SUPERVISOR, DIRETORIA, ATENDENTE_WHATSAPP
- Lead Intake sem role EXPEDIENTE nas RLS
- Falta role EXPEDIENTE em várias RLS policies

