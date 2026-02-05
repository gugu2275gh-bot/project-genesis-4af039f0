 // ERD Diagram Generator using Mermaid.js
 
 export function generateERDMermaidCode(): string {
   return `erDiagram
     %% Módulo CRM (Azul)
     contacts {
         uuid id PK
         text full_name
         bigint phone
         text email
         text nationality
     }
     leads {
         uuid id PK
         uuid contact_id FK
         text status
         text service_interest
         uuid assigned_to_user_id FK
     }
     opportunities {
         uuid id PK
         uuid lead_id FK
         text status
         numeric total_amount
     }
     interactions {
         uuid id PK
         uuid contact_id FK
         uuid lead_id FK
         text channel
         text content
     }
     lead_intake {
         uuid id PK
         text phone
         text status
         uuid contact_id FK
         uuid lead_id FK
     }
     mensagens_cliente {
         bigint id PK
         uuid id_lead FK
         text mensagem_cliente
         text mensagem_IA
     }
     
     %% Módulo Contratos (Verde)
     contracts {
         uuid id PK
         uuid opportunity_id FK
         text status
         numeric total_fee
         text service_type
     }
     contract_beneficiaries {
         uuid id PK
         uuid contract_id FK
         text full_name
         text relationship
     }
     contract_costs {
         uuid id PK
         uuid contract_id FK
         numeric amount
         text description
     }
     contract_notes {
         uuid id PK
         uuid contract_id FK
         text note
         text note_type
     }
     contract_reminders {
         uuid id PK
         uuid contract_id FK
         text reminder_type
     }
     
     %% Módulo Financeiro (Amarelo)
     payments {
         uuid id PK
         uuid opportunity_id FK
         uuid contract_id FK
         numeric amount
         text status
     }
     payment_reminders {
         uuid id PK
         uuid payment_id FK
         text reminder_type
     }
     invoices {
         uuid id PK
         uuid contract_id FK
         uuid payment_id FK
         text invoice_number
         numeric total_amount
     }
     commissions {
         uuid id PK
         uuid contract_id FK
         numeric commission_amount
         text status
     }
     cash_flow {
         uuid id PK
         uuid related_contract_id FK
         uuid related_payment_id FK
         numeric amount
         text type
     }
     expense_categories {
         uuid id PK
         text name
         text type
     }
     
     %% Módulo Casos/Técnico (Roxo)
     service_cases {
         uuid id PK
         uuid opportunity_id FK
         uuid contract_id FK
         text status
         uuid client_user_id FK
     }
     service_documents {
         uuid id PK
         uuid service_case_id FK
         uuid document_type_id FK
         text status
     }
     service_document_types {
         uuid id PK
         text name
         text category
     }
     requirements_from_authority {
         uuid id PK
         uuid service_case_id FK
         text description
         text status
     }
     requirement_reminders {
         uuid id PK
         uuid requirement_id FK
         text reminder_type
     }
     generated_documents {
         uuid id PK
         uuid service_case_id FK
         text document_type
     }
     case_notes {
         uuid id PK
         uuid service_case_id FK
         text note
     }
     nps_surveys {
         uuid id PK
         uuid service_case_id FK
         integer score
     }
     
     %% Módulo Sistema (Cinza)
     profiles {
         uuid id PK
         text email
         text full_name
     }
     user_roles {
         uuid id PK
         uuid user_id FK
         text role
     }
     user_sectors {
         uuid id PK
         uuid user_id FK
         text sector
     }
     notifications {
         uuid id PK
         uuid user_id FK
         text title
         text type
     }
     tasks {
         uuid id PK
         uuid assigned_to FK
         text title
         text status
     }
     audit_logs {
         uuid id PK
         uuid user_id FK
         text table_name
         text action
     }
     
     %% Relacionamentos CRM
     contacts ||--o{ leads : "has"
     contacts ||--o{ interactions : "has"
     leads ||--o{ opportunities : "converts"
     leads ||--o{ interactions : "has"
     leads ||--o{ mensagens_cliente : "receives"
     lead_intake ||--o| contacts : "creates"
     lead_intake ||--o| leads : "creates"
     
     %% Relacionamentos Contratos
     opportunities ||--o| contracts : "generates"
     contracts ||--o{ contract_beneficiaries : "has"
     contracts ||--o{ contract_costs : "has"
     contracts ||--o{ contract_notes : "has"
     contracts ||--o{ contract_reminders : "has"
     contracts ||--o{ commissions : "pays"
     
     %% Relacionamentos Financeiro
     opportunities ||--o{ payments : "has"
     contracts ||--o{ payments : "has"
     payments ||--o{ payment_reminders : "has"
     payments ||--o| invoices : "generates"
     contracts ||--o{ invoices : "has"
     contracts ||--o{ cash_flow : "tracks"
     payments ||--o{ cash_flow : "tracks"
     
     %% Relacionamentos Técnico
     opportunities ||--o| service_cases : "creates"
     contracts ||--o| service_cases : "has"
     service_cases ||--o{ service_documents : "requires"
     service_cases ||--o{ requirements_from_authority : "receives"
     service_cases ||--o{ generated_documents : "produces"
     service_cases ||--o{ case_notes : "has"
     service_cases ||--o| nps_surveys : "evaluates"
     service_document_types ||--o{ service_documents : "defines"
     requirements_from_authority ||--o{ requirement_reminders : "has"
     
     %% Relacionamentos Sistema
     profiles ||--o{ user_roles : "has"
     profiles ||--o{ user_sectors : "belongs"
     profiles ||--o{ notifications : "receives"
     profiles ||--o{ tasks : "assigned"
     profiles ||--o{ audit_logs : "creates"
     profiles ||--o{ leads : "manages"
     profiles ||--o{ contracts : "manages"
     profiles ||--o{ service_cases : "handles"`;
 }
 
 export const ERD_STATS = {
   tables: 28,
   relationships: 42,
   rlsPolicies: 50,
   modules: 5,
   foreignKeys: 45
 };
 
 export const ERD_MODULES = [
   { name: 'CRM', color: '#3B82F6', tables: ['contacts', 'leads', 'opportunities', 'interactions', 'lead_intake', 'mensagens_cliente'] },
   { name: 'Contratos', color: '#10B981', tables: ['contracts', 'contract_beneficiaries', 'contract_costs', 'contract_notes', 'contract_reminders'] },
   { name: 'Financeiro', color: '#F59E0B', tables: ['payments', 'payment_reminders', 'invoices', 'commissions', 'cash_flow', 'expense_categories'] },
   { name: 'Técnico', color: '#8B5CF6', tables: ['service_cases', 'service_documents', 'service_document_types', 'requirements_from_authority', 'requirement_reminders', 'generated_documents', 'case_notes', 'nps_surveys'] },
   { name: 'Sistema', color: '#6B7280', tables: ['profiles', 'user_roles', 'user_sectors', 'notifications', 'tasks', 'audit_logs'] }
 ];

// Architecture Diagram Generator
export function generateArchitectureMermaidCode(): string {
  return `flowchart TB
    subgraph Cliente["Frontend - React"]
      React["React 18.3.1"]
      Vite["Vite Build Tool"]
      TailwindCSS["Tailwind CSS"]
      ReactQuery["TanStack Query"]
      Router["React Router v6"]
    end
    
    subgraph Edge["Edge Functions - Deno"]
      WhatsApp["whatsapp-webhook"]
      Stripe["stripe-webhook"]
      SLA["sla-automations"]
      AdminUser["admin-create-user"]
      PaymentLink["create-payment-link"]
      SendWA["send-whatsapp"]
    end
    
    subgraph Supabase["Supabase Cloud"]
      Auth["Auth - JWT"]
      PostgREST["PostgREST API"]
      Realtime["Realtime Subscriptions"]
      Storage["Storage Buckets"]
    end
    
    subgraph Database["PostgreSQL 15"]
      RLS["Row Level Security"]
      Triggers["Database Triggers"]
      Functions["PL/pgSQL Functions"]
      Tables["28 Tables"]
    end
    
    subgraph External["Integracoes Externas"]
      WhatsAppAPI["WhatsApp Business API"]
      StripeAPI["Stripe Payments"]
      N8N["N8N Workflows"]
    end
    
    Cliente --> Supabase
    Cliente --> Edge
    Edge --> Database
    Edge --> External
    Supabase --> Database
    External --> Edge`;
}

export const ARCHITECTURE_STATS = {
  layers: 5,
  edgeFunctions: 6,
  supabaseServices: 4,
  externalIntegrations: 3,
  frontendLibs: 5
};

export const ARCHITECTURE_LAYERS = [
  { name: 'Frontend', color: '#3B82F6', items: ['React 18.3.1', 'Vite', 'Tailwind CSS', 'TanStack Query', 'React Router'] },
  { name: 'Edge Functions', color: '#F59E0B', items: ['whatsapp-webhook', 'stripe-webhook', 'sla-automations', 'admin-create-user', 'create-payment-link', 'send-whatsapp'] },
  { name: 'Supabase', color: '#10B981', items: ['Auth (JWT)', 'PostgREST', 'Realtime', 'Storage'] },
  { name: 'PostgreSQL', color: '#8B5CF6', items: ['RLS Policies', 'Triggers', 'Functions', '28 Tables'] },
  { name: 'Integrações', color: '#EF4444', items: ['WhatsApp API', 'Stripe', 'N8N'] }
];

// Components Diagram Generator
export function generateComponentsMermaidCode(): string {
  return `flowchart LR
    subgraph Pages["Pages - 15+"]
      Dashboard["Dashboard"]
      CRM["CRM Module"]
      Contracts["Contracts"]
      Finance["Finance"]
      Cases["Legal Cases"]
      Portal["Client Portal"]
      Settings["Settings"]
      Reports["Reports"]
    end
    
    subgraph Components["Components - 70+"]
      Layout["Layout Components"]
      UI["UI Library - 40+"]
      Forms["Form Components"]
      Tables["Data Tables"]
      Charts["Charts and Reports"]
      Modals["Dialogs and Sheets"]
    end
    
    subgraph Hooks["Hooks - 40+"]
      DataHooks["Data Hooks"]
      AuthHooks["Auth Hooks"]
      UIHooks["UI Hooks"]
      RealtimeHooks["Realtime Hooks"]
    end
    
    subgraph State["State Management"]
      ReactQuery["TanStack Query"]
      Context["React Context"]
      LocalState["Local State"]
    end
    
    subgraph Services["Services"]
      SupabaseClient["Supabase Client"]
      I18n["i18n - 4 languages"]
      Utils["Utility Functions"]
    end
    
    Pages --> Components
    Pages --> Hooks
    Components --> Hooks
    Hooks --> State
    Hooks --> Services
    State --> Services`;
}

export const COMPONENTS_STATS = {
  pages: 15,
  components: 70,
  hooks: 40,
  contexts: 2,
  uiComponents: 40,
  languages: 4
};

export const COMPONENTS_CATEGORIES = [
  { name: 'Pages', color: '#3B82F6', count: 15, items: ['Dashboard', 'CRM (Leads, Contacts, Opportunities)', 'Contracts', 'Finance', 'Cases', 'Portal', 'Settings', 'Reports'] },
  { name: 'Components', color: '#10B981', count: 70, items: ['Layout (Header, Sidebar)', 'UI Library (40+ shadcn)', 'Forms', 'Tables', 'Charts'] },
  { name: 'Hooks', color: '#F59E0B', count: 40, items: ['useCases', 'usePayments', 'useLeads', 'useContracts', 'useAuth', 'useToast'] },
  { name: 'Contexts', color: '#8B5CF6', count: 2, items: ['AuthContext', 'LanguageContext'] },
  { name: 'Services', color: '#EF4444', count: 5, items: ['Supabase Client', 'i18n', 'Utils', 'Export Utils', 'Notifications'] }
];

// Modules Functional Documentation Generator
export function generateModulesMermaidCode(): string {
  return `flowchart TD
    subgraph CRM["CRM - Gestao Comercial"]
      LeadIntake["Lead Intake"]
      Contact["Gestao de Contatos"]
      Lead["Qualificacao de Leads"]
      Opp["Oportunidades"]
      LeadIntake --> Contact
      Contact --> Lead
      Lead --> Opp
    end
    
    subgraph Contracts["Contratos"]
      Contract["Criacao de Contrato"]
      Beneficiary["Beneficiarios"]
      Costs["Custos e Honorarios"]
      Notes["Notas do Contrato"]
      Contract --> Beneficiary
      Contract --> Costs
      Contract --> Notes
    end
    
    subgraph Finance["Financeiro"]
      Payment["Pagamentos"]
      Invoice["Faturas"]
      Commission["Comissoes"]
      CashFlow["Fluxo de Caixa"]
      Payment --> Invoice
      Payment --> CashFlow
      Commission --> CashFlow
    end
    
    subgraph Technical["Tecnico - Casos"]
      Case["Casos de Servico"]
      Docs["Documentos"]
      Requirements["Requerimentos"]
      GenDocs["Docs Gerados"]
      NPS["Pesquisa NPS"]
      Case --> Docs
      Case --> Requirements
      Case --> GenDocs
      Case --> NPS
    end
    
    subgraph Portal["Portal do Cliente"]
      PortalDash["Dashboard"]
      PortalDocs["Meus Documentos"]
      PortalPay["Meus Pagamentos"]
      PortalMsg["Mensagens"]
    end
    
    Opp --> Contract
    Opp --> Payment
    Opp --> Case
    Contract --> Commission
    Case --> Portal
    Payment --> PortalPay
    Docs --> PortalDocs`;
}

export const MODULES_STATS = {
  modules: 5,
  journeyPhases: 7,
  tables: 28,
  automations: 6,
  integrations: 3
};

export const MODULES_INFO = [
  { name: 'CRM', color: '#3B82F6', description: 'Gestão comercial: leads, contatos, oportunidades', tables: 6 },
  { name: 'Contratos', color: '#10B981', description: 'Gestão de contratos, beneficiários e custos', tables: 5 },
  { name: 'Financeiro', color: '#F59E0B', description: 'Pagamentos, faturas, comissões e fluxo de caixa', tables: 6 },
  { name: 'Técnico', color: '#8B5CF6', description: 'Casos de serviço, documentos e requerimentos', tables: 8 },
  { name: 'Portal', color: '#EF4444', description: 'Interface do cliente para acompanhamento', tables: 3 }
];