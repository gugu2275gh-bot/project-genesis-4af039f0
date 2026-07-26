import type { MultiLangText } from '@/types/ai-agents';

/** Natureza da etapa dentro do desenho do fluxo. */
export type StepKind = 'INICIO' | 'PERGUNTA' | 'INFORMATIVA' | 'FIM';

export const STEP_KINDS: { value: StepKind; label: string; hint: string }[] = [
  { value: 'INICIO', label: 'Início', hint: 'Ponto de entrada do fluxo. Só pode existir um.' },
  { value: 'PERGUNTA', label: 'Pergunta', hint: 'Envia a mensagem e espera a resposta do cliente.' },
  {
    value: 'INFORMATIVA',
    label: 'Informativa',
    hint: 'Só envia mensagens e segue direto para a próxima etapa, sem esperar resposta.',
  },
  { value: 'FIM', label: 'Fim', hint: 'Encerra o fluxo (pode encaminhar para um especialista).' },
];

/** Mensagens da etapa: por idioma, uma ou várias mensagens em sequência. */
export type MultiLangMessages = Record<string, string | string[]>;

const asList = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];

/** Quantidade de mensagens em sequência configuradas na etapa. */
export function messageCount(messages: MultiLangMessages | undefined): number {
  if (!messages) return 1;
  const counts = Object.values(messages).map((v) => asList(v).length);
  return Math.max(1, ...counts, 0) || 1;
}

/** Mensagens de um idioma, na ordem de envio. */
export function messageList(
  messages: MultiLangMessages | undefined,
  lang: string,
  fallbacks: string[] = ['pt-BR', 'es', 'en', 'fr'],
): string[] {
  if (!messages) return [];
  const direct = asList(messages[lang]).filter((t) => t.trim());
  if (direct.length) return direct;
  for (const f of fallbacks) {
    const alt = asList(messages[f]).filter((t) => t.trim());
    if (alt.length) return alt;
  }
  return [];
}

/** Extrai a mensagem de índice `i` em todos os idiomas (formato do MultiLangField). */
export function messageAt(messages: MultiLangMessages | undefined, i: number): MultiLangText {
  const out: MultiLangText = {};
  Object.entries(messages || {}).forEach(([lang, v]) => {
    const item = asList(v)[i];
    if (typeof item === 'string') out[lang] = item;
  });
  return out;
}

/** Grava a mensagem de índice `i` em todos os idiomas informados. */
export function setMessageAt(
  messages: MultiLangMessages | undefined,
  i: number,
  value: MultiLangText,
): MultiLangMessages {
  const langs = new Set([...Object.keys(messages || {}), ...Object.keys(value)]);
  const out: MultiLangMessages = {};
  langs.forEach((lang) => {
    const list = asList(messages?.[lang]).slice();
    while (list.length <= i) list.push('');
    list[i] = value[lang] ?? list[i] ?? '';
    out[lang] = list;
  });
  return out;
}

/** Remove a mensagem de índice `i` de todos os idiomas. */
export function removeMessageAt(messages: MultiLangMessages | undefined, i: number): MultiLangMessages {
  const out: MultiLangMessages = {};
  Object.entries(messages || {}).forEach(([lang, v]) => {
    const list = asList(v).slice();
    list.splice(i, 1);
    out[lang] = list;
  });
  return out;
}

/** Converte qualquer formato antigo (`message`, `messages` string) para lista. */
export function normalizeMessages(
  messages: unknown,
  legacyMessage?: string,
): MultiLangMessages {
  const raw = (messages && typeof messages === 'object' ? messages : {}) as MultiLangMessages;
  const entries = Object.entries(raw).filter(([, v]) => asList(v).length > 0);
  if (entries.length === 0) {
    return legacyMessage ? { 'pt-BR': [legacyMessage] } : { 'pt-BR': [''] };
  }
  const out: MultiLangMessages = {};
  entries.forEach(([lang, v]) => {
    out[lang] = asList(v);
  });
  return out;
}


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
  /** Natureza da etapa (início, pergunta, informativa, fim). */
  step_kind?: StepKind;
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
  step_kind: 'PERGUNTA',
};

/** Natureza da etapa, com retrocompatibilidade para etapas antigas. */
export function stepKindOf(step: { validation?: unknown; handoff?: boolean }): StepKind {
  const v = (step.validation && typeof step.validation === 'object' ? step.validation : {}) as StepValidation;
  if (v.step_kind) return v.step_kind;
  return step.handoff ? 'FIM' : 'PERGUNTA';
}


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
