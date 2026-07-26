/**
 * Divisão do "prompt do fluxo" (texto único e gigante) em blocos editáveis.
 *
 * O prompt é fatiado pelos cabeçalhos markdown de nível 2 (`## TÍTULO`).
 * Cada trecho vira um bloco com título + conteúdo, e o prompt final é
 * remontado exatamente na mesma ordem — nada se perde e os placeholders
 * ({{LANGUAGE_DIRECTIVE}}, {{TODAY}}, …) continuam intactos.
 */

export type PromptBlockTab = 'geral' | 'comportamento' | 'fluxo' | 'producao';

export interface PromptBlock {
  id: string;
  title: string;
  content: string;
  tab: PromptBlockTab;
}

export const PROMPT_BLOCK_TABS: { value: PromptBlockTab; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'comportamento', label: 'Comportamento do agente' },
  { value: 'fluxo', label: 'Fluxo' },
  { value: 'producao', label: 'Produção (avançado)' },
];

const INTRO_TITLE = 'IDENTIDADE DO AGENTE';

/** Palavras-chave que definem em qual aba o bloco é editado. */
const TAB_RULES: { tab: PromptBlockTab; keywords: string[] }[] = [
  { tab: 'geral', keywords: ['identidade', 'base de conhecimento', 'handoff', 'encaminh', 'fallback'] },
  {
    tab: 'comportamento',
    keywords: ['idioma', 'personalidade', 'tom', 'anti-repet', 'repetição', 'data', 'datas', 'escopo', 'diretriz', 'proibid'],
  },
  { tab: 'fluxo', keywords: ['objetivo', 'etapa', 'fluxo', 'pergunta', 'roteiro', 'pré-handoff', 'pre-handoff'] },
];

export function inferTabForTitle(title: string): PromptBlockTab {
  const t = (title || '').toLowerCase();
  for (const rule of TAB_RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.tab;
  }
  return 'producao';
}

function slug(title: string, index: number): string {
  const base = (title || 'bloco')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'bloco'}-${index}`;
}

/** Fatia um prompt bruto em blocos usando os cabeçalhos `## `. */
export function splitPromptIntoBlocks(prompt: string): PromptBlock[] {
  const text = (prompt || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const blocks: PromptBlock[] = [];
  let currentTitle = INTRO_TITLE;
  let buffer: string[] = [];

  const push = () => {
    const content = buffer.join('\n').trim();
    if (!content && blocks.length === 0 && currentTitle === INTRO_TITLE) return;
    if (!content && !currentTitle) return;
    const index = blocks.length;
    blocks.push({
      id: slug(currentTitle, index),
      title: currentTitle,
      content,
      tab: inferTabForTitle(currentTitle),
    });
  };

  for (const line of lines) {
    const match = /^##\s+(.*)$/.exec(line);
    if (match) {
      push();
      currentTitle = match[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  push();

  return blocks;
}

/** Remonta o prompt final a partir dos blocos, na ordem em que estão. */
export function composePromptFromBlocks(blocks: PromptBlock[]): string {
  return (blocks || [])
    .filter((b) => (b.content || '').trim() || (b.title || '').trim())
    .map((b, i) => {
      const content = (b.content || '').trim();
      if (i === 0 && b.title === INTRO_TITLE) return content;
      return `## ${b.title}\n${content}`;
    })
    .join('\n\n')
    .trim();
}

/** Garante blocos válidos a partir do que está salvo no agente. */
export function normalizeBlocks(raw: unknown, fallbackPrompt: string): PromptBlock[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((b: any) => b && typeof b === 'object')
      .map((b: any, i: number) => ({
        id: String(b.id || slug(String(b.title || ''), i)),
        title: String(b.title || `Bloco ${i + 1}`),
        content: String(b.content ?? ''),
        tab: (['geral', 'comportamento', 'fluxo', 'producao'].includes(b.tab)
          ? b.tab
          : inferTabForTitle(String(b.title || ''))) as PromptBlockTab,
      }));
  }
  return splitPromptIntoBlocks(fallbackPrompt || '');
}
