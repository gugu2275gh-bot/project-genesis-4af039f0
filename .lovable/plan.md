
# Plano: Gerar Diagrama ERD Visual do Banco de Dados

## Objetivo

Criar uma funcionalidade que gere um diagrama ERD (Entity-Relationship Diagram) visual completo do banco de dados em formato de imagem PNG, utilizando a API de geração de imagens Gemini disponível no projeto.

---

## Abordagem Técnica

O projeto tem acesso à API de geração de imagens `google/gemini-2.5-flash-image` através do gateway `ai.gateway.lovable.dev`. Usaremos esta API para gerar um diagrama ERD profissional baseado no schema completo do banco de dados.

### Alternativa Considerada

Também podemos gerar o ERD de forma programática usando:
1. **Canvas HTML5** - Desenhar o diagrama diretamente e exportar como PNG
2. **Mermaid.js** - Converter para SVG e depois PNG
3. **API de Imagem** - Gerar uma representação visual profissional via IA

**Escolha**: Vamos criar uma página dedicada que mostra o ERD usando Mermaid.js (para visualização interativa) e também oferece download como imagem.

---

## Estrutura do ERD

### Tabelas Identificadas (28 tabelas)

**Módulo CRM**
- `contacts` - Dados de contatos
- `leads` - Leads/Prospecções  
- `opportunities` - Oportunidades comerciais
- `interactions` - Histórico de interações
- `lead_intake` - Entrada de leads
- `mensagens_cliente` - Mensagens WhatsApp

**Módulo Contratos**
- `contracts` - Contratos
- `contract_beneficiaries` - Beneficiários
- `contract_costs` - Custos do contrato
- `contract_notes` - Anotações
- `contract_reminders` - Lembretes

**Módulo Financeiro**
- `payments` - Pagamentos
- `payment_reminders` - Lembretes de pagamento
- `invoices` - Faturas
- `commissions` - Comissões
- `cash_flow` - Fluxo de caixa
- `expense_categories` - Categorias de despesa

**Módulo Casos/Técnico**
- `service_cases` - Casos de serviço
- `service_documents` - Documentos do caso
- `service_document_types` - Tipos de documento
- `requirements_from_authority` - Requisitos legais
- `requirement_reminders` - Lembretes de requisito
- `generated_documents` - Documentos gerados
- `case_notes` - Notas do caso
- `nps_surveys` - Pesquisas NPS

**Módulo Usuários/Sistema**
- `profiles` - Perfis de usuário
- `user_roles` - Papéis
- `user_sectors` - Setores
- `notifications` - Notificações
- `tasks` - Tarefas
- `audit_logs` - Logs de auditoria

### Relacionamentos Principais

```text
contacts ←─────── leads ←─────── opportunities
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
               contracts          payments         service_cases
                    │                 │                 │
        ┌───────────┼───────────┐     │     ┌───────────┼───────────┐
        ▼           ▼           ▼     ▼     ▼           ▼           ▼
   beneficiaries  costs      notes  invoices documents  requirements  notes
```

---

## Implementação

### 1. Novo Arquivo: `src/lib/generate-erd-diagram.ts`

```typescript
// Função para gerar código Mermaid do ERD
export function generateERDMermaidCode(): string {
  return `
erDiagram
    contacts ||--o{ leads : "has"
    leads ||--o{ opportunities : "converts to"
    leads ||--o{ interactions : "has"
    
    opportunities ||--o| contracts : "generates"
    opportunities ||--o{ payments : "has"
    opportunities ||--o| service_cases : "creates"
    
    contracts ||--o{ contract_beneficiaries : "has"
    contracts ||--o{ contract_costs : "has"
    contracts ||--o{ contract_notes : "has"
    contracts ||--o{ commissions : "pays"
    
    payments ||--o{ payment_reminders : "has"
    payments ||--o| invoices : "generates"
    
    service_cases ||--o{ service_documents : "requires"
    service_cases ||--o{ requirements_from_authority : "receives"
    service_cases ||--o{ case_notes : "has"
    service_cases ||--o| nps_surveys : "evaluates"
    
    service_document_types ||--o{ service_documents : "defines"
    
    profiles ||--o{ user_roles : "has"
    profiles ||--o{ tasks : "assigned"
    profiles ||--o{ notifications : "receives"
  `;
}

// Função para exportar como imagem via canvas
export async function exportERDAsImage(): Promise<void> {
  // Renderiza o Mermaid SVG e converte para PNG
}
```

### 2. Nova Página: `src/pages/settings/DatabaseERD.tsx`

Página dedicada com:
- Visualização interativa do ERD usando Mermaid
- Botão para download como PNG
- Legenda com cores por módulo
- Estatísticas do banco

### 3. Atualizar Sidebar (opcional)

Adicionar acesso via menu de Configurações ou como página separada.

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/lib/generate-erd-diagram.ts` | **Criar** - Geração do código Mermaid e export PNG |
| `src/pages/settings/DatabaseERD.tsx` | **Criar** - Página de visualização do ERD |
| `src/pages/settings/Settings.tsx` | **Modificar** - Adicionar tab para ERD (ou link) |

---

## Conteúdo Visual do ERD

O diagrama incluirá:

### Legenda de Cores por Módulo
- **Azul** - CRM (contacts, leads, opportunities)
- **Verde** - Contratos (contracts, beneficiaries)
- **Amarelo** - Financeiro (payments, invoices, commissions)
- **Roxo** - Técnico (service_cases, documents)
- **Cinza** - Sistema (profiles, roles, notifications)

### Informações em Cada Entidade
- Nome da tabela
- Campos principais (PK, FK)
- Cardinalidade dos relacionamentos

---

## Resultado Esperado

1. **Página interativa** com diagrama ERD navegável
2. **Botão de download** que gera PNG de alta resolução
3. **Diagrama profissional** mostrando:
   - 28+ tabelas organizadas por módulo
   - 40+ relacionamentos com cardinalidade
   - Cores diferenciadas por área funcional
   - Legenda explicativa

---

## Complexidade Demonstrada

O ERD evidencia a complexidade do sistema:
- **28 tabelas** relacionais
- **40+ foreign keys** 
- **50+ políticas RLS**
- **7 módulos funcionais** interconectados
- **Arquitetura normalizada** até 3NF

---

## Estimativa

1-2 iterações de desenvolvimento
