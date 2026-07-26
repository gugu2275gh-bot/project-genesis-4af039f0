export type AgentProvider = 'gemini' | 'openai' | 'lovable';
export type AgentStatus = 'ATIVO' | 'INATIVO' | 'RASCUNHO';

/** Idiomas suportados pelo agente. */
export type AgentLanguage = 'pt-BR' | 'es' | 'en' | 'fr';

export const AGENT_LANGUAGES: { code: AgentLanguage; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'es', label: 'Espanhol' },
  { code: 'en', label: 'Inglês' },
  { code: 'fr', label: 'Francês' },
];

/** Texto com uma versão por idioma. */
export type MultiLangText = Partial<Record<AgentLanguage, string>>;

/** Fase do fluxo de atendimento. */
export type FlowPhase = 'PRE_HANDOFF' | 'HANDOFF' | 'GERAL';

export const FLOW_PHASES: { value: FlowPhase; label: string; description: string }[] = [
  {
    value: 'PRE_HANDOFF',
    label: 'Pré-handoff',
    description: 'Etapas que o agente executa sozinho, antes de encaminhar para um atendente.',
  },
  {
    value: 'HANDOFF',
    label: 'Handoff',
    description: 'Etapas executadas no momento do encaminhamento e depois dele.',
  },
  { value: 'GERAL', label: 'Geral', description: 'Etapas que valem para as duas fases.' },
];

export const TONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'CORDIAL_ACOLHEDOR', label: 'Cordial e acolhedor' },
  { value: 'PROFISSIONAL_OBJETIVO', label: 'Profissional e objetivo' },
  { value: 'FORMAL', label: 'Formal' },
  { value: 'CONSULTIVO', label: 'Consultivo' },
  { value: 'INFORMAL_PROXIMO', label: 'Informal e próximo' },
  { value: 'EMPATICO', label: 'Empático' },
  { value: 'DIRETO', label: 'Direto' },
  { value: 'PERSONALIZADO', label: 'Personalizado…' },
];

export interface AgentCapabilities {
  answer_questions: boolean;
  use_knowledge_base: boolean;
  use_rag: boolean;
  ask_questions: boolean;
  run_structured_flow: boolean;
  handoff_to_human: boolean;
}

export interface AgentBehavior {
  personality: string;
  tone: string;
  /** Texto livre quando `tone` = PERSONALIZADO. */
  tone_custom?: string;
  allowed_languages: string[];
  required_rules: string[];
  forbidden_rules: string[];
  forbidden_information: string[];
  on_unknown: string;
  on_off_topic: string;
  on_handoff: string;
  /** Versões por idioma dos textos voltados ao cliente. */
  i18n?: {
    on_unknown?: MultiLangText;
    on_off_topic?: MultiLangText;
    on_handoff?: MultiLangText;
    fallback_message?: MultiLangText;
    handoff_message?: MultiLangText;
  };
}


export interface AIAgent {
  id: string;
  name: string;
  description: string | null;
  provider: AgentProvider;
  model: string;
  status: AgentStatus;
  temperature: number;
  max_tokens: number;
  default_language: string;
  prompt_base: string;
  prompt_behavior: string;
  fallback_message: string;
  handoff_message: string;
  flow_id: string | null;
  capabilities: AgentCapabilities;
  behavior: AgentBehavior;
  current_version: number;
  parent_agent_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  /** Marca o agente que controla o atendimento real de WhatsApp (AGENTE 1.0). */
  is_production?: boolean;
  /** Toggles de execução aplicados ao webhook (bot ligado, modo estrito da base, etc.). */
  runtime_config?: AgentRuntimeConfig | null;
  /** Cascata de modelos usada em produção (sobrepõe llm_settings). */
  model_cascade?: ModelCascadeItem[] | null;
  /** Prompt estruturado do fluxo, com placeholders. */
  prompt_flow?: string | null;
}

export interface ModelCascadeItem {
  provider: AgentProvider | string;
  model: string;
}

export interface AgentRuntimeConfig {
  whatsapp_bot_enabled?: boolean;
  kb_strict_mode?: boolean;
  kb_strict_fallback_message?: string;
  [key: string]: unknown;
}

export interface AgentText {
  id: string;
  agent_id: string;
  text_key: string;
  label: string | null;
  description: string | null;
  translations: Record<string, string>;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export const AGENT_TEXT_LANGUAGES: { code: string; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'es', label: 'Espanhol' },
  { code: 'en', label: 'Inglês' },
  { code: 'fr', label: 'Francês' },
];

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  config: Record<string, unknown>;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AgentFlow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type AnswerType =
  | 'TEXTO_LIVRE'
  | 'NOME'
  | 'EMAIL'
  | 'NUMERO'
  | 'DATA'
  | 'SIM_NAO'
  | 'SELECAO'
  | 'BOTOES'
  | 'MULTIPLA_ESCOLHA';

export const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
  { value: 'TEXTO_LIVRE', label: 'Texto livre' },
  { value: 'NOME', label: 'Nome' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'NUMERO', label: 'Número' },
  { value: 'DATA', label: 'Data' },
  { value: 'SIM_NAO', label: 'Sim/Não' },
  { value: 'SELECAO', label: 'Seleção de opção' },
  { value: 'BOTOES', label: 'Botões' },
  { value: 'MULTIPLA_ESCOLHA', label: 'Múltipla escolha' },
];

export interface AgentFlowStep {
  id: string;
  flow_id: string;
  step_code: string;
  name: string;
  description: string | null;
  message: string;
  answer_type: AnswerType;
  validation: Record<string, unknown>;
  next_step_code: string | null;
  exit_condition: string | null;
  allow_parallel_question: boolean;
  allow_free_answer: boolean;
  handoff: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AgentTestSession {
  id: string;
  agent_id: string;
  agent_version_id: string | null;
  title: string | null;
  status: string;
  created_at: string;
}

export interface AgentTestMessage {
  id: string;
  session_id: string;
  agent_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  tokens_used: number | null;
  created_at: string;
}

export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  answer_questions: true,
  use_knowledge_base: false,
  use_rag: false,
  ask_questions: true,
  run_structured_flow: false,
  handoff_to_human: true,
};

export const DEFAULT_BEHAVIOR: AgentBehavior = {
  personality: 'PROFISSIONAL',
  tone: '',
  allowed_languages: ['pt'],
  required_rules: [],
  forbidden_rules: [],
  forbidden_information: [],
  on_unknown: '',
  on_off_topic: '',
  on_handoff: '',
};

export const PERSONALITIES = ['PROFISSIONAL', 'FORMAL', 'ACOLHEDOR', 'OBJETIVO'] as const;
