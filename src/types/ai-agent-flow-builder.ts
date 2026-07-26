import type { MultiLangText } from '@/types/ai-agents';

/** Tipo de comparação usado para decidir a ramificação. */
export type BranchMatchType = 'IGUAL' | 'CONTEM' | 'REGEX' | 'INTENCAO' | 'QUALQUER';

export const BRANCH_MATCH_TYPES: { value: BranchMatchType; label: string; hint: string }[] = [
  { value: 'IGUAL', label: 'É igual a', hint: 'A resposta é exatamente igual ao valor.' },
  { value: 'CONTEM', label: 'Contém', hint: 'A resposta contém o texto informado.' },
  { value: 'REGEX', label: 'Expressão regular', hint: 'Avaliação por regex.' },
  { value: 'INTENCAO', label: 'Intenção (IA)', hint: 'A IA classifica a intenção da resposta.' },
  { value: 'QUALQUER', label: 'Qualquer resposta', hint: 'Sempre verdadeiro (caminho padrão).' },
];

/** Uma resposta possível da etapa, com destino próprio. */
export interface FlowBranch {
  id: string;
  label: string;
  match_type: BranchMatchType;
  value: string;
  next_step_code: string | null;
}

/** Formatos aceitos na validação da resposta. */
export type AnswerFormat =
  | 'NENHUM'
  | 'EMAIL'
  | 'NUMERO'
  | 'DATA_DDMMYYYY'
  | 'TELEFONE'
  | 'REGEX';

export const ANSWER_FORMATS: { value: AnswerFormat; label: string }[] = [
  { value: 'NENHUM', label: 'Sem formato específico' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'NUMERO', label: 'Número' },
  { value: 'DATA_DDMMYYYY', label: 'Data (DD/MM/AAAA)' },
  { value: 'TELEFONE', label: 'Telefone (texto)' },
  { value: 'REGEX', label: 'Expressão regular' },
];

/** Condição para pular uma etapa já cumprida. */
export type SkipMode = 'NUNCA' | 'CAMPO_PREENCHIDO' | 'ETAPA_CONCLUIDA' | 'UMA_VEZ_POR_CONTATO';

export const SKIP_MODES: { value: SkipMode; label: string }[] = [
  { value: 'NUNCA', label: 'Sempre perguntar' },
  { value: 'CAMPO_PREENCHIDO', label: 'Pular se o campo já estiver preenchido' },
  { value: 'ETAPA_CONCLUIDA', label: 'Pular se outra etapa já foi concluída' },
  { value: 'UMA_VEZ_POR_CONTATO', label: 'Perguntar apenas uma vez por contato' },
];

/** Conteúdo estruturado da coluna `validation` (jsonb). */
export interface StepValidation {
  required?: boolean;
  format?: AnswerFormat;
  regex?: string;
  min?: number | null;
  max?: number | null;
  max_reasks?: number;
  options?: string[];
  save_to_field?: string;
  skip_mode?: SkipMode;
  skip_field?: string;
  skip_step_code?: string;
  [key: string]: unknown;
}

export const DEFAULT_STEP_VALIDATION: StepValidation = {
  required: true,
  format: 'NENHUM',
  regex: '',
  min: null,
  max: null,
  max_reasks: 2,
  options: [],
  save_to_field: '',
  skip_mode: 'NUNCA',
  skip_field: '',
  skip_step_code: '',
};

/** Posições dos nós no editor visual (coluna `canvas` de `ai_agent_flows`). */
export interface FlowCanvasData {
  positions?: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface FlowIssue {
  level: 'error' | 'warning';
  message: string;
  stepCode?: string;
}

export function normalizeValidation(raw: unknown): StepValidation {
  const v = (raw && typeof raw === 'object' ? raw : {}) as StepValidation;
  return { ...DEFAULT_STEP_VALIDATION, ...v, options: Array.isArray(v.options) ? v.options : [] };
}

export function normalizeBranches(raw: unknown): FlowBranch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b === 'object')
    .map((b: any, i: number) => ({
      id: String(b.id || `b${i}`),
      label: String(b.label || ''),
      match_type: (b.match_type || 'IGUAL') as BranchMatchType,
      value: String(b.value ?? ''),
      next_step_code: b.next_step_code || null,
    }));
}

export function firstText(t: MultiLangText | undefined, fallback = ''): string {
  if (!t) return fallback;
  return t['pt-BR'] || t.es || t.en || t.fr || fallback;
}
