
# Plano: Adicionar Diagramas Visuais à Página ERD

## Objetivo

Expandir a página ERD existente para incluir três novos diagramas visuais, todos usando o mesmo padrão de visualização Mermaid.js e exportação de imagem:

1. **Arquitetura Adotada** - Diagrama de arquitetura do sistema
2. **Diagrama de Componentes de Alto Nível** - Estrutura de componentes React
3. **Documentação Funcional dos Módulos** - Fluxograma dos módulos funcionais

---

## Implementação

### 1. Atualizar: `src/lib/generate-erd-diagram.ts`

Adicionar três novas funções geradoras de código Mermaid:

```typescript
// Arquitetura do Sistema
export function generateArchitectureMermaidCode(): string {
  return `flowchart TB
    subgraph Cliente["🖥️ Frontend"]
      React["React 18.3.1"]
      Vite["Vite 6.3.5"]
      TailwindCSS["Tailwind CSS"]
      ReactQuery["TanStack Query"]
    end
    
    subgraph Edge["⚡ Edge Functions"]
      WhatsApp["WhatsApp Webhook"]
      Stripe["Stripe Webhook"]
      SLA["SLA Automations"]
      AdminUser["Admin Create User"]
    end
    
    subgraph Supabase["☁️ Supabase Cloud"]
      Auth["Auth (JWT)"]
      PostgREST["PostgREST API"]
      Realtime["Realtime Subscriptions"]
      Storage["Storage Buckets"]
    end
    
    subgraph Database["🗄️ PostgreSQL"]
      RLS["Row Level Security"]
      Triggers["Database Triggers"]
      Functions["PL/pgSQL Functions"]
    end
    
    subgraph External["🔗 Integrações Externas"]
      WhatsAppAPI["WhatsApp Business API"]
      StripeAPI["Stripe Payments"]
      N8N["N8N Workflows"]
    end
    
    Cliente --> Supabase
    Cliente --> Edge
    Edge --> Database
    Edge --> External
    Supabase --> Database
  `;
}

// Componentes de Alto Nível
export function generateComponentsMermaidCode(): string {
  return `flowchart LR
    subgraph Pages["📄 Pages (15+)"]
      Dashboard
      CRM["CRM (Leads, Contacts, Opportunities)"]
      Contracts
      Finance["Finance (Payments, Invoices)"]
      Cases["Legal/Technical Cases"]
      Portal["Client Portal"]
      Settings
    end
    
    subgraph Components["🧩 Components (70+)"]
      Layout["Layout (Header, Sidebar, MainLayout)"]
      UI["UI Library (40+ components)"]
      Forms["Form Components"]
      Tables["Data Tables"]
      Charts["Charts & Reports"]
    end
    
    subgraph Hooks["🪝 Hooks (40+)"]
      DataHooks["Data Hooks (useCases, usePayments...)"]
      AuthHooks["Auth Hooks"]
      UIHooks["UI Hooks (useToast, useMobile)"]
    end
    
    subgraph State["📊 State Management"]
      ReactQuery["TanStack Query (Server State)"]
      Context["React Context (Auth, Language)"]
    end
    
    Pages --> Components
    Pages --> Hooks
    Components --> Hooks
    Hooks --> State
  `;
}

// Documentação Funcional dos Módulos
export function generateModulesMermaidCode(): string {
  return `flowchart TD
    subgraph CRM["📞 CRM"]
      Lead["Lead Intake"]
      Contact["Gestão de Contatos"]
      Opp["Oportunidades"]
      Lead --> Contact
      Contact --> Opp
    end
    
    subgraph Contracts["📋 Contratos"]
      Contract["Criação de Contrato"]
      Beneficiary["Beneficiários"]
      Costs["Custos & Honorários"]
      Contract --> Beneficiary
      Contract --> Costs
    end
    
    subgraph Finance["💰 Financeiro"]
      Payment["Pagamentos"]
      Invoice["Faturas"]
      Commission["Comissões"]
      CashFlow["Fluxo de Caixa"]
      Payment --> Invoice
      Payment --> CashFlow
      Contract --> Commission
    end
    
    subgraph Technical["⚙️ Técnico"]
      Case["Casos de Serviço"]
      Docs["Documentos"]
      Requirements["Requerimentos"]
      NPS["Pesquisa NPS"]
      Case --> Docs
      Case --> Requirements
      Case --> NPS
    end
    
    subgraph Portal["🌐 Portal Cliente"]
      PortalDash["Dashboard"]
      PortalDocs["Meus Documentos"]
      PortalPay["Meus Pagamentos"]
      PortalMsg["Mensagens"]
    end
    
    Opp --> Contract
    Opp --> Payment
    Opp --> Case
    Case --> Portal
  `;
}
```

### 2. Atualizar: `src/pages/settings/DatabaseERD.tsx`

Transformar a página em uma visualização com Tabs para os 4 diagramas:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function DatabaseERD() {
  const [activeTab, setActiveTab] = useState('erd');
  
  // Refs para cada diagrama
  const erdContainerRef = useRef<HTMLDivElement>(null);
  const archContainerRef = useRef<HTMLDivElement>(null);
  const compContainerRef = useRef<HTMLDivElement>(null);
  const modulesContainerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="erd">
            <Database className="h-4 w-4 mr-2" />
            ERD Banco de Dados
          </TabsTrigger>
          <TabsTrigger value="architecture">
            <Server className="h-4 w-4 mr-2" />
            Arquitetura
          </TabsTrigger>
          <TabsTrigger value="components">
            <Layers className="h-4 w-4 mr-2" />
            Componentes
          </TabsTrigger>
          <TabsTrigger value="modules">
            <GitBranch className="h-4 w-4 mr-2" />
            Módulos Funcionais
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="erd">
          {/* ERD existente */}
        </TabsContent>
        
        <TabsContent value="architecture">
          {/* Diagrama de Arquitetura */}
        </TabsContent>
        
        <TabsContent value="components">
          {/* Diagrama de Componentes */}
        </TabsContent>
        
        <TabsContent value="modules">
          {/* Documentação Funcional */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Estrutura dos Novos Diagramas

### Diagrama 1: Arquitetura Adotada

Mostrará a arquitetura em camadas:

```text
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  React 18 │ Vite │ Tailwind CSS │ TanStack Query        │
├─────────────────────────────────────────────────────────┤
│                  Edge Functions (Deno)                   │
│  WhatsApp │ Stripe │ SLA Automations │ Admin Functions  │
├─────────────────────────────────────────────────────────┤
│                   Supabase Cloud                         │
│  Auth (JWT) │ PostgREST │ Realtime │ Storage            │
├─────────────────────────────────────────────────────────┤
│                   PostgreSQL 15                          │
│  RLS Policies │ Triggers │ PL/pgSQL Functions           │
├─────────────────────────────────────────────────────────┤
│                Integrações Externas                      │
│  WhatsApp API │ Stripe Payments │ N8N Workflows         │
└─────────────────────────────────────────────────────────┘
```

### Diagrama 2: Componentes de Alto Nível

Estrutura de componentes React:

| Categoria | Quantidade | Exemplos |
|-----------|------------|----------|
| Pages | 15+ | Dashboard, CRM, Contracts, Finance, Portal |
| Components | 70+ | Layout, UI Library, Forms, Tables, Charts |
| Hooks | 40+ | useCases, usePayments, useLeads, useAuth |
| Contexts | 2 | AuthContext, LanguageContext |

### Diagrama 3: Documentação Funcional dos Módulos

Fluxo operacional entre módulos:

```text
Lead Intake → Contato → Oportunidade
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
      Contrato         Pagamentos      Caso Técnico
          │                │                │
    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
    ▼           ▼    ▼           ▼    ▼           ▼
Beneficiários Custos Faturas  Fluxo  Docs    Requerimentos
                                               │
                                               ▼
                                          Portal Cliente
```

---

## Funcionalidades Mantidas

Cada diagrama terá:
- Controles de zoom (Zoom In/Out, Reset)
- Botão de download PNG (alta resolução)
- Botão de download SVG
- Legenda explicativa
- Cards com estatísticas relevantes

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/lib/generate-erd-diagram.ts` | **Modificar** - Adicionar 3 novas funções de geração |
| `src/pages/settings/DatabaseERD.tsx` | **Modificar** - Adicionar tabs e renderização dos novos diagramas |

---

## Estatísticas por Diagrama

### Arquitetura
- 5 camadas principais
- 6 Edge Functions
- 4 serviços Supabase
- 3 integrações externas

### Componentes
- 15+ páginas
- 70+ componentes
- 40+ hooks customizados
- 2 contexts globais

### Módulos Funcionais
- 5 módulos principais
- 7 fases da jornada do cliente
- 28 tabelas de banco
- Fluxo end-to-end documentado

---

## Resultado Esperado

Uma página de visualização completa com 4 abas:
1. **ERD** - Diagrama de entidade-relacionamento (já existe)
2. **Arquitetura** - Stack técnica em camadas
3. **Componentes** - Estrutura de componentes React
4. **Módulos Funcionais** - Fluxo operacional do sistema

Cada aba terá visualização interativa com zoom e exportação para imagem PNG/SVG.
