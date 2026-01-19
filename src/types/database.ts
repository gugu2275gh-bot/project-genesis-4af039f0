// CB Asesoria Database Types

export type AppRole = 
  | 'ADMIN'
  | 'MANAGER'
  | 'ATENCAO_CLIENTE'
  | 'JURIDICO'
  | 'FINANCEIRO'
  | 'TECNICO'
  | 'CLIENTE';

export type OriginChannel = 
  | 'WHATSAPP'
  | 'SITE'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'EMAIL'
  | 'INDICACAO'
  | 'OUTRO';

export type ServiceInterest = 
  | 'VISTO_ESTUDANTE'
  | 'VISTO_TRABALHO'
  | 'REAGRUPAMENTO'
  | 'RENOVACAO_RESIDENCIA'
  | 'NACIONALIDADE_RESIDENCIA'
  | 'NACIONALIDADE_CASAMENTO'
  | 'OUTRO';

export type LeadStatus = 
  | 'NOVO'
  | 'DADOS_INCOMPLETOS'
  | 'INTERESSE_PENDENTE'
  | 'INTERESSE_CONFIRMADO'
  | 'ARQUIVADO_SEM_RETORNO';

export type OpportunityStatus = 
  | 'ABERTA'
  | 'CONTRATO_EM_ELABORACAO'
  | 'CONTRATO_ENVIADO'
  | 'CONTRATO_ASSINADO'
  | 'PAGAMENTO_PENDENTE'
  | 'FECHADA_GANHA'
  | 'FECHADA_PERDIDA'
  | 'CONGELADA';

export type InteractionChannel = 
  | 'WHATSAPP'
  | 'EMAIL'
  | 'LIGACAO'
  | 'REUNIAO'
  | 'OUTRO';

export type InteractionDirection = 'INBOUND' | 'OUTBOUND';

export type ContractStatus = 
  | 'EM_ELABORACAO'
  | 'EM_REVISAO'
  | 'ENVIADO'
  | 'ASSINADO'
  | 'CANCELADO';

export type PaymentMethod = 
  | 'CARTAO'
  | 'TRANSFERENCIA'
  | 'PIX'
  | 'PAYPAL'
  | 'PARCELAMENTO_MANUAL'
  | 'OUTRO';

export type PaymentStatus = 
  | 'PENDENTE'
  | 'EM_ANALISE'
  | 'CONFIRMADO'
  | 'PARCIAL'
  | 'ESTORNADO';

export type TechnicalStatus = 
  | 'CONTATO_INICIAL'
  | 'AGUARDANDO_DOCUMENTOS'
  | 'DOCUMENTOS_EM_CONFERENCIA'
  | 'PRONTO_PARA_SUBMISSAO'
  | 'SUBMETIDO'
  | 'EM_ACOMPANHAMENTO'
  | 'EXIGENCIA_ORGAO'
  | 'AGUARDANDO_RECURSO'
  | 'ENCERRADO_APROVADO'
  | 'ENCERRADO_NEGADO';

export type ServiceSector = 
  | 'ESTUDANTE'
  | 'TRABALHO'
  | 'REAGRUPAMENTO'
  | 'RENOVACAO'
  | 'NACIONALIDADE';

export type DocumentStatus = 
  | 'NAO_ENVIADO'
  | 'ENVIADO'
  | 'EM_CONFERENCIA'
  | 'APROVADO'
  | 'REJEITADO';

export type TaskStatus = 
  | 'PENDENTE'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'CANCELADA';

export type RequirementStatus = 
  | 'ABERTA'
  | 'RESPONDIDA'
  | 'ENCERRADA';

export type DecisionResult = 
  | 'APROVADO'
  | 'NEGADO'
  | 'EM_ANDAMENTO'
  | 'NULO';

export type LanguageCode = 'pt' | 'es' | 'en' | 'fr' | 'ca';

// Entity interfaces
export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Contact {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  country_of_origin?: string;
  nationality?: string;
  preferred_language: LanguageCode;
  origin_channel: OriginChannel;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  contact_id: string;
  service_interest: ServiceInterest;
  status: LeadStatus;
  interest_confirmed: boolean;
  notes?: string;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  contact?: Contact;
}

export interface Opportunity {
  id: string;
  lead_id: string;
  status: OpportunityStatus;
  reason_lost?: string;
  total_amount?: number;
  currency: string;
  created_at: string;
  updated_at: string;
  // Relations
  lead?: Lead;
}

export interface Interaction {
  id: string;
  lead_id?: string;
  contact_id?: string;
  channel: InteractionChannel;
  direction: InteractionDirection;
  content?: string;
  created_by_user_id?: string;
  origin_bot: boolean;
  created_at: string;
  // Relations
  created_by?: Profile;
}

export interface Contract {
  id: string;
  opportunity_id: string;
  status: ContractStatus;
  service_type: ServiceInterest;
  scope_summary?: string;
  total_fee?: number;
  currency: string;
  installment_conditions?: string;
  refund_policy_text?: string;
  language: LanguageCode;
  external_signature_id?: string;
  signed_at?: string;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  opportunity?: Opportunity;
}

export interface Payment {
  id: string;
  opportunity_id: string;
  contract_id?: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  transaction_id?: string;
  payment_link?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  // Relations
  opportunity?: Opportunity;
  contract?: Contract;
}

export interface ServiceCase {
  id: string;
  client_user_id?: string;
  opportunity_id: string;
  service_type: ServiceInterest;
  technical_status: TechnicalStatus;
  sector: ServiceSector;
  assigned_to_user_id?: string;
  protocol_number?: string;
  submission_date?: string;
  decision_date?: string;
  decision_result: DecisionResult;
  created_at: string;
  updated_at: string;
  // Relations
  opportunity?: Opportunity;
  assigned_to?: Profile;
  client?: Profile;
}

export interface ServiceDocumentType {
  id: string;
  service_type: ServiceInterest;
  name: string;
  description?: string;
  is_required: boolean;
  needs_translation: boolean;
  needs_apostille: boolean;
  created_at: string;
}

export interface ServiceDocument {
  id: string;
  service_case_id: string;
  document_type_id: string;
  file_url?: string;
  status: DocumentStatus;
  rejection_reason?: string;
  uploaded_by_user_id?: string;
  uploaded_at?: string;
  updated_at: string;
  // Relations
  document_type?: ServiceDocumentType;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  related_lead_id?: string;
  related_opportunity_id?: string;
  related_service_case_id?: string;
  assigned_to_user_id?: string;
  status: TaskStatus;
  due_date?: string;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
  // Relations
  assigned_to?: Profile;
  created_by?: Profile;
}

export interface RequirementFromAuthority {
  id: string;
  service_case_id: string;
  description: string;
  official_deadline_date?: string;
  internal_deadline_date?: string;
  status: RequirementStatus;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  is_read: boolean;
  created_at: string;
}

export interface NpsSurvey {
  id: string;
  service_case_id: string;
  score: number;
  comment?: string;
  created_at: string;
}

export interface SystemConfig {
  id: string;
  key: string;
  value?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Helper mappings for display
export const SERVICE_INTEREST_LABELS: Record<ServiceInterest, string> = {
  VISTO_ESTUDANTE: 'Visto Estudante',
  VISTO_TRABALHO: 'Visto Trabalho',
  REAGRUPAMENTO: 'Reagrupamento Familiar',
  RENOVACAO_RESIDENCIA: 'Renovação de Residência',
  NACIONALIDADE_RESIDENCIA: 'Nacionalidade por Residência',
  NACIONALIDADE_CASAMENTO: 'Nacionalidade por Casamento',
  OUTRO: 'Outro',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  DADOS_INCOMPLETOS: 'Dados Incompletos',
  INTERESSE_PENDENTE: 'Interesse Pendente',
  INTERESSE_CONFIRMADO: 'Interesse Confirmado',
  ARQUIVADO_SEM_RETORNO: 'Arquivado',
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  ABERTA: 'Aberta',
  CONTRATO_EM_ELABORACAO: 'Contrato em Elaboração',
  CONTRATO_ENVIADO: 'Contrato Enviado',
  CONTRATO_ASSINADO: 'Contrato Assinado',
  PAGAMENTO_PENDENTE: 'Pagamento Pendente',
  FECHADA_GANHA: 'Fechada (Ganha)',
  FECHADA_PERDIDA: 'Fechada (Perdida)',
  CONGELADA: 'Congelada',
};

export const ORIGIN_CHANNEL_LABELS: Record<OriginChannel, string> = {
  WHATSAPP: 'WhatsApp',
  SITE: 'Site',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  EMAIL: 'Email',
  INDICACAO: 'Indicação',
  OUTRO: 'Outro',
};

export const TECHNICAL_STATUS_LABELS: Record<TechnicalStatus, string> = {
  CONTATO_INICIAL: 'Contato Inicial',
  AGUARDANDO_DOCUMENTOS: 'Aguardando Documentos',
  DOCUMENTOS_EM_CONFERENCIA: 'Documentos em Conferência',
  PRONTO_PARA_SUBMISSAO: 'Pronto para Submissão',
  SUBMETIDO: 'Submetido',
  EM_ACOMPANHAMENTO: 'Em Acompanhamento',
  EXIGENCIA_ORGAO: 'Exigência do Órgão',
  AGUARDANDO_RECURSO: 'Aguardando Recurso',
  ENCERRADO_APROVADO: 'Encerrado (Aprovado)',
  ENCERRADO_NEGADO: 'Encerrado (Negado)',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  EM_ELABORACAO: 'Em Elaboração',
  EM_REVISAO: 'Em Revisão',
  ENVIADO: 'Enviado',
  ASSINADO: 'Assinado',
  CANCELADO: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em Análise',
  CONFIRMADO: 'Confirmado',
  PARCIAL: 'Parcial',
  ESTORNADO: 'Estornado',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  NAO_ENVIADO: 'Não Enviado',
  ENVIADO: 'Enviado',
  EM_CONFERENCIA: 'Em Conferência',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
};

export const SERVICE_SECTOR_LABELS: Record<ServiceSector, string> = {
  ESTUDANTE: 'Estudante',
  TRABALHO: 'Trabalho',
  REAGRUPAMENTO: 'Reagrupamento',
  RENOVACAO: 'Renovação',
  NACIONALIDADE: 'Nacionalidade',
};

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  pt: 'Português',
  es: 'Espanhol',
  en: 'Inglês',
  fr: 'Francês',
  ca: 'Catalão',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  PIX: 'PIX',
  PAYPAL: 'PayPal',
  PARCELAMENTO_MANUAL: 'Parcelamento Manual',
  OUTRO: 'Outro',
};

export const INTERACTION_CHANNEL_LABELS: Record<InteractionChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  LIGACAO: 'Ligação',
  REUNIAO: 'Reunião',
  OUTRO: 'Outro',
};

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  ABERTA: 'Aberta',
  RESPONDIDA: 'Respondida',
  ENCERRADA: 'Encerrada',
};

export const DECISION_RESULT_LABELS: Record<DecisionResult, string> = {
  APROVADO: 'Aprovado',
  NEGADO: 'Negado',
  EM_ANDAMENTO: 'Em Andamento',
  NULO: 'Nulo',
};
