import type { MultiLangText } from '@/types/ai-agents';

/** Natureza da etapa dentro do desenho do fluxo. */
export type StepKind = 'INICIO' | 'PERGUNTA' | 'PERGUNTA_GERAL' | 'INFORMATIVA' | 'FIM';

export const STEP_KINDS: { value: StepKind; label: string; hint: string }[] = [
  { value: 'INICIO', label: 'Início', hint: 'Ponto de entrada do fluxo. Só pode existir um.' },
  { value: 'PERGUNTA', label: 'Pergunta', hint: 'Envia a mensagem e espera a resposta do cliente.' },
  {
    value: 'PERGUNTA_GERAL',
    label: 'Pergunta geral',
    hint: 'Pergunta aberta: a IA interpreta a resposta, preenche vários campos e pula as perguntas já respondidas.',
  },
  {
    value: 'INFORMATIVA',
    label: 'Informativa',
    hint: 'Só envia mensagens e segue direto para a próxima etapa, sem esperar resposta.',
  },
  { value: 'FIM', label: 'Fim', hint: 'Encerra o fluxo (pode encaminhar para um especialista).' },
];

/** Dados que a IA sabe interpretar numa "Pergunta geral". */
export const CAPTURE_SOURCE_OPTIONS: { value: string; label: string; default_target: string }[] = [
  { value: 'full_name', label: 'Nome', default_target: 'contact.full_name' },
  { value: 'email', label: 'E-mail', default_target: 'contact.email' },
  { value: 'age', label: 'Idade', default_target: 'outside.age' },
  { value: 'city', label: 'Cidade onde mora', default_target: 'funnel.empadronado_city' },
  { value: 'in_spain', label: 'Está na Espanha?', default_target: 'funnel.location_known' },
  { value: 'intent', label: 'Objetivo / serviço de interesse', default_target: 'funnel.interest_confirmed' },
  { value: 'arrival_date', label: 'Data de chegada', default_target: 'funnel.entry_date_confirmed' },
  { value: 'empadronado', label: 'Está empadronado?', default_target: 'funnel.empadronado_confirmed' },
  { value: 'empadronado_city', label: 'Cidade do empadronamento', default_target: 'funnel.empadronado_city' },
  { value: 'education_superior', label: 'Possui formação superior?', default_target: 'contact.education_level' },
  { value: 'eu_family', label: 'Possui familiar europeu?', default_target: 'contact.has_eu_family_member' },
  { value: 'europe_6m', label: 'Esteve na Europa nos últimos 6 meses?', default_target: 'contact.eu_entry_last_6_months' },
];

/** Configuração de interpretação multi-campo da etapa "Pergunta geral". */
export interface StepGeneralCapture {
  enabled?: boolean;
  fields?: { source: string; target_field: string }[];
  min_confidence?: number;
}


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
  /** Equivalentes aceitos (traduções e variações) além do valor principal. */
  synonyms?: string[];
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

/** O que fazer quando a resposta é diferente do esperado. */
export type UnexpectedAnswerMode = 'INSISTIR' | 'ACEITAR_APROXIMADO' | 'PULAR' | 'ENCAMINHAR';
/** @deprecated use UnexpectedAnswerMode */
export type UnknownAnswerMode = UnexpectedAnswerMode;

export const UNEXPECTED_ANSWER_MODES: { value: UnexpectedAnswerMode; label: string; hint: string }[] = [
  {
    value: 'INSISTIR',
    label: 'Insistir na pergunta',
    hint: 'O agente acolhe e volta a fazer a mesma pergunta (comportamento padrão).',
  },
  {
    value: 'ACEITAR_APROXIMADO',
    label: 'Aceitar valor aproximado',
    hint: 'Pede uma estimativa; se o cliente continuar sem responder no formato, grava o valor de reserva e segue.',
  },
  {
    value: 'PULAR',
    label: 'Pular a etapa',
    hint: 'Aceita o desvio, grava o valor de reserva e segue para a próxima etapa normal.',
  },
  {
    value: 'ENCAMINHAR',
    label: 'Ir para a etapa de fallback',
    hint: 'Desvia para a etapa de fallback configurada na aba Validação.',
  },
];

/** @deprecated use UNEXPECTED_ANSWER_MODES */
export const UNKNOWN_ANSWER_MODES = UNEXPECTED_ANSWER_MODES;

/** Situações em que a resposta é diferente do esperado. */
export type DeviationKind = 'unknown' | 'invalid_format' | 'no_match' | 'off_topic';

export const DEVIATION_KINDS: { value: DeviationKind; label: string; hint: string }[] = [
  {
    value: 'unknown',
    label: 'Cliente não sabe / não lembra',
    hint: 'Ex.: "não sei", "no recuerdo", "I don\'t know". É a regra padrão das demais situações.',
  },
  {
    value: 'invalid_format',
    label: 'Formato inválido',
    hint: 'A resposta não bate com o formato esperado (data, e-mail, número, nome completo).',
  },
  {
    value: 'no_match',
    label: 'Fora das opções previstas',
    hint: 'A resposta não corresponde a nenhum caminho/opção configurado na etapa.',
  },
  {
    value: 'off_topic',
    label: 'Resposta vazia / fora do assunto',
    hint: 'Cliente não respondeu, mudou de assunto ou devolveu uma pergunta.',
  },
];

/** Tratativa de uma situação de desvio. */
export interface UnexpectedRule {
  /** Quando falso, a situação segue a regra de "não sabe / não lembra". */
  enabled: boolean;
  mode: UnexpectedAnswerMode;
  /** Mensagem de acolhimento, por idioma. */
  messages: MultiLangText;
  /** Quantas vezes acolher antes de aplicar o comportamento. */
  attempts: number;
  /** Valor gravado quando o agente aceita/pula. */
  fallback_value: string;
  /** Frases adicionais que caracterizam o desvio. */
  phrases: string[];
}

/** Configuração por etapa para respostas diferentes do esperado. */
export type UnexpectedAnswerConfig = Record<DeviationKind, UnexpectedRule>;
/** @deprecated formato antigo (plano), mantido para leitura. */
export type UnknownAnswerConfig = UnexpectedRule;

export const DEFAULT_UNEXPECTED_RULE: UnexpectedRule = {
  enabled: false,
  mode: 'INSISTIR',
  messages: {},
  attempts: 1,
  fallback_value: '',
  phrases: [],
};

export function normalizeUnexpectedRule(raw: unknown, enabledDefault = false): UnexpectedRule {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<UnexpectedRule>;
  const mode = UNEXPECTED_ANSWER_MODES.some((m) => m.value === v.mode)
    ? (v.mode as UnexpectedAnswerMode)
    : 'INSISTIR';
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : enabledDefault,
    mode,
    messages: (v.messages && typeof v.messages === 'object' ? v.messages : {}) as MultiLangText,
    attempts: Number.isFinite(Number(v.attempts)) ? Math.max(0, Number(v.attempts)) : 1,
    fallback_value: String(v.fallback_value || ''),
    phrases: Array.isArray(v.phrases) ? v.phrases.map((p) => String(p ?? '')).filter(Boolean) : [],
  };
}

/**
 * Lê a configuração nova (`unexpected_answer`) e, na falta dela, converte o
 * formato antigo e plano (`unknown_answer`) sem precisar migrar o banco.
 */
export function normalizeUnexpectedAnswer(raw: unknown, legacy?: unknown): UnexpectedAnswerConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<UnexpectedAnswerConfig>;
  const hasNew = DEVIATION_KINDS.some((k) => v[k.value] && typeof v[k.value] === 'object');
  const unknownRaw = hasNew ? v.unknown : legacy;
  return {
    unknown: { ...normalizeUnexpectedRule(unknownRaw, true), enabled: true },
    invalid_format: normalizeUnexpectedRule(hasNew ? v.invalid_format : undefined),
    no_match: normalizeUnexpectedRule(hasNew ? v.no_match : undefined),
    off_topic: normalizeUnexpectedRule(hasNew ? v.off_topic : undefined),
  };
}

/** @deprecated use normalizeUnexpectedRule */
export const normalizeUnknownAnswer = (raw: unknown) => normalizeUnexpectedRule(raw, true);


/** O que fazer quando a resposta não é validada pela base de conhecimento. */
export type KbCheckOnInvalid = 'REPERGUNTAR' | 'SEGUIR' | 'ENCAMINHAR';

export const KB_CHECK_ON_INVALID: { value: KbCheckOnInvalid; label: string; hint: string }[] = [
  {
    value: 'REPERGUNTAR',
    label: 'Explicar e perguntar de novo',
    hint: 'O agente explica que não é um serviço/tema atendido e repete a pergunta.',
  },
  {
    value: 'SEGUIR',
    label: 'Registrar mesmo assim e seguir',
    hint: 'A resposta é gravada como está e o fluxo avança normalmente.',
  },
  {
    value: 'ENCAMINHAR',
    label: 'Ir para a etapa de fallback',
    hint: 'Depois das tentativas, desvia para a etapa de fallback configurada na aba Validação.',
  },
];

/** Checagem da resposta contra a base de conhecimento (só etapas Pergunta). */
export interface StepKbCheck {
  enabled: boolean;
  /** Instrução extra para a IA (o que considerar válido nesta etapa). */
  instruction: string;
  on_invalid: KbCheckOnInvalid;
  /** Mensagem por idioma enviada quando a resposta não é válida. */
  messages: Record<string, string>;
  /** Quantas vezes reperguntar antes de aplicar `on_invalid`. */
  attempts: number;
  /** Grava o nome oficial encontrado na base no lugar do texto do cliente. */
  normalize: boolean;
}

export const DEFAULT_KB_CHECK: StepKbCheck = {
  enabled: false,
  instruction: '',
  on_invalid: 'REPERGUNTAR',
  messages: {},
  attempts: 1,
  normalize: true,
};

export function normalizeKbCheck(raw: unknown): StepKbCheck {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<StepKbCheck>;
  const attempts = Number(v.attempts);
  return {
    enabled: !!v.enabled,
    instruction: String(v.instruction ?? ''),
    on_invalid: (['REPERGUNTAR', 'SEGUIR', 'ENCAMINHAR'] as const).includes(v.on_invalid as KbCheckOnInvalid)
      ? (v.on_invalid as KbCheckOnInvalid)
      : 'REPERGUNTAR',
    messages: (v.messages && typeof v.messages === 'object' ? v.messages : {}) as Record<string, string>,
    attempts: Number.isFinite(attempts) && attempts >= 0 ? Math.min(5, Math.round(attempts)) : 1,
    normalize: v.normalize !== false,
  };
}

/** Conteúdo estruturado da coluna `validation` (jsonb). */
export interface StepValidation {
  required?: boolean;
  format?: AnswerFormat;
  regex?: string;
  min?: number | null;
  max?: number | null;
  max_reasks?: number;
  options?: string[];
  /** Rótulos das opções traduzidos por idioma (mesma ordem de `options`). */
  options_i18n?: Partial<Record<'pt' | 'es' | 'en' | 'fr', string[]>>;
  /** Só para respostas do tipo Nome: exigir nome completo ou aceitar nome simples. */
  name_mode?: 'COMPLETO' | 'SIMPLES';


  save_to_field?: string;
  skip_mode?: SkipMode;
  skip_field?: string;
  skip_step_code?: string;
  /** Etapa de destino quando o cliente esgota as reperguntas. */
  fallback_step_code?: string;
  /** Natureza da etapa (início, pergunta, informativa, fim). */
  step_kind?: StepKind;
  /** Enviar a pergunta como botões Sim/Não no WhatsApp (só para SIM_NAO). */
  quick_reply?: boolean;
  /** Envia a frase de reconhecimento humano antes da próxima pergunta. */
  ack_enabled?: boolean;
  /** Reconhecimento gerado pela IA, comentando a resposta do cliente. */
  ack_ai?: boolean;
  /** Valida a resposta desta etapa na base de conhecimento. */
  kb_check?: StepKbCheck;
  /** Interpretação multi-campo da etapa "Pergunta geral". */
  general_capture?: StepGeneralCapture;


  /** @deprecated formato antigo e plano ("se não souber"). */
  unknown_answer?: UnknownAnswerConfig;
  /** Tratativas por situação quando a resposta é diferente do esperado. */
  unexpected_answer?: UnexpectedAnswerConfig;

  [key: string]: unknown;
}

export const DEFAULT_STEP_VALIDATION: StepValidation = {
  required: true,
  format: 'NENHUM',
  regex: '',
  min: null,
  max: null,
  max_reasks: 1,
  options: [],
  save_to_field: '',
  skip_mode: 'NUNCA',
  skip_field: '',
  skip_step_code: '',
  fallback_step_code: '',
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
      synonyms: Array.isArray(b.synonyms)
        ? b.synonyms.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
        : [],
      next_step_code: b.next_step_code || null,
    }));
}


export function firstText(t: MultiLangText | undefined, fallback = ''): string {
  if (!t) return fallback;
  return t['pt-BR'] || t.es || t.en || t.fr || fallback;
}

/* ------------------------- integridade dos códigos ------------------------ */

/** Normaliza um código de etapa (minúsculas, sem espaços/acentos). */
export function slugStepCode(raw: string): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Devolve um código único, acrescentando sufixo numérico quando necessário. */
export function uniqueStepCode(existing: Iterable<string>, base: string): string {
  const taken = new Set(Array.from(existing).filter(Boolean));
  const root = slugStepCode(base) || 'etapa';
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}_${i}`)) i++;
  return `${root}_${i}`;
}

type CodeRefStep = {
  step_code: string;
  next_step_code?: string | null;
  branches?: unknown;
};

/**
 * Renomeia o código de uma etapa e reaponta todas as referências das demais
 * (`next_step_code` e destinos das ramificações).
 */
export function renameStepCode<T extends CodeRefStep>(
  steps: T[],
  stepId: string,
  newCode: string,
  idOf: (s: T) => string,
): T[] {
  const target = steps.find((s) => idOf(s) === stepId);
  if (!target) return steps;
  const oldCode = target.step_code;
  if (oldCode === newCode) return steps;
  if (!newCode) return steps.map((s) => (idOf(s) === stepId ? { ...s, step_code: '' } : s));

  return steps.map((s) => {
    if (idOf(s) === stepId) return { ...s, step_code: newCode };
    if (!oldCode) return s;
    const branches = normalizeBranches((s as any).branches);
    const patched = branches.map((b) =>
      b.next_step_code === oldCode ? { ...b, next_step_code: newCode } : b,
    );
    const nextChanged = s.next_step_code === oldCode;
    if (!nextChanged && patched.every((b, i) => b.next_step_code === branches[i].next_step_code)) {
      return s;
    }
    return {
      ...s,
      next_step_code: nextChanged ? newCode : s.next_step_code,
      ...(branches.length ? { branches: patched } : {}),
    } as T;
  });
}

/**
 * Aceita posições salvas por id (formato novo) ou por `step_code` (formato
 * antigo) e devolve sempre um mapa indexado pelo id da etapa.
 */
export function migratePositions(
  saved: Record<string, { x: number; y: number }> | undefined,
  steps: { id: string; step_code: string }[],
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (!saved) return out;
  const byCode = new Map(steps.map((s) => [s.step_code, s.id]));
  const ids = new Set(steps.map((s) => s.id));
  Object.entries(saved).forEach(([key, pos]) => {
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
    if (ids.has(key)) out[key] = pos;
    else {
      const id = byCode.get(key);
      if (id && !out[id]) out[id] = pos;
    }
  });
  return out;
}

