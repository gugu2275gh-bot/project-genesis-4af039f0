import type { AgentFlowStep, FlowPhase } from '@/types/ai-agents';
import { DEFAULT_STEP_VALIDATION, type FlowBranch } from '@/types/ai-agent-flow-builder';

export interface ImportedFlow {
  steps: AgentFlowStep[];
  positions: Record<string, { x: number; y: number }>;
  warnings: string[];
  processName: string;
}

const TASK_TAGS = [
  'task',
  'userTask',
  'manualTask',
  'sendTask',
  'receiveTask',
  'serviceTask',
  'scriptTask',
  'businessRuleTask',
  'callActivity',
  'subProcess',
];
const GATEWAY_TAGS = ['exclusiveGateway', 'inclusiveGateway', 'eventBasedGateway', 'parallelGateway'];
const EVENT_TAGS = ['startEvent', 'endEvent', 'intermediateThrowEvent', 'intermediateCatchEvent'];

function localName(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, '');
}

function all(root: Document | Element, names: string[]): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => names.includes(localName(el)));
}

export function slugify(input: string, fallback: string): string {
  const base = (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || fallback;
}

interface RawNode {
  id: string;
  kind: 'task' | 'gateway' | 'start' | 'end' | 'event';
  name: string;
  documentation: string;
}

interface RawFlow {
  id: string;
  source: string;
  target: string;
  name: string;
}

/**
 * Converte um arquivo BPMN 2.0 (exportado pelo Bizagi Modeler) em etapas do agente.
 * Gateways viram ramificações da etapa anterior; sequence flows viram destinos.
 */
export function parseBizagiBpmn(
  xml: string,
  opts: { flowId: string; phase: FlowPhase; startIndex?: number },
): ImportedFlow {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('Arquivo inválido: não foi possível ler o XML do BPMN.');
  }

  const processEl = all(doc, ['process'])[0];
  if (!processEl) {
    throw new Error(
      'Nenhum processo BPMN encontrado. No Bizagi use Exportar > BPMN 2.0 (arquivo .bpmn ou .xml).',
    );
  }
  const processName = processEl.getAttribute('name') || 'Processo importado';

  const nodes = new Map<string, RawNode>();
  const pushNode = (el: Element, kind: RawNode['kind']) => {
    const id = el.getAttribute('id');
    if (!id) return;
    const docEl = Array.from(el.children).find((c) => localName(c) === 'documentation');
    nodes.set(id, {
      id,
      kind,
      name: el.getAttribute('name') || '',
      documentation: (docEl?.textContent || '').trim(),
    });
  };

  all(doc, TASK_TAGS).forEach((el) => pushNode(el, 'task'));
  all(doc, GATEWAY_TAGS).forEach((el) => pushNode(el, 'gateway'));
  all(doc, EVENT_TAGS).forEach((el) => {
    const n = localName(el);
    pushNode(el, n === 'startEvent' ? 'start' : n === 'endEvent' ? 'end' : 'event');
  });

  const flows: RawFlow[] = all(doc, ['sequenceFlow'])
    .map((el) => ({
      id: el.getAttribute('id') || '',
      source: el.getAttribute('sourceRef') || '',
      target: el.getAttribute('targetRef') || '',
      name: el.getAttribute('name') || '',
    }))
    .filter((f) => f.source && f.target);

  // Posições do diagrama (BPMNShape -> bpmnElement)
  const shapePos = new Map<string, { x: number; y: number }>();
  all(doc, ['BPMNShape']).forEach((shape) => {
    const ref = shape.getAttribute('bpmnElement');
    const bounds = Array.from(shape.children).find((c) => localName(c) === 'Bounds');
    if (!ref || !bounds) return;
    shapePos.set(ref, {
      x: Number(bounds.getAttribute('x') || 0),
      y: Number(bounds.getAttribute('y') || 0),
    });
  });

  // Nós que viram etapas: tarefas, start e end (gateways são absorvidos)
  const stepNodes = Array.from(nodes.values()).filter(
    (n) => n.kind === 'task' || n.kind === 'start' || n.kind === 'end',
  );
  if (stepNodes.length === 0) {
    throw new Error('O processo não contém tarefas ou eventos que possam virar etapas.');
  }

  const ignored = Array.from(nodes.values()).filter((n) => n.kind === 'event');
  if (ignored.length) {
    warnings.push(`${ignored.length} evento(s) intermediário(s) foram ignorados na importação.`);
  }

  // step_code único por nó
  const codes = new Map<string, string>();
  const used = new Set<string>();
  stepNodes.forEach((n, i) => {
    const fallback = n.kind === 'start' ? 'inicio' : n.kind === 'end' ? 'fim' : `etapa_${i + 1}`;
    let code = slugify(n.name, fallback);
    if (used.has(code)) {
      let k = 2;
      while (used.has(`${code}_${k}`)) k += 1;
      warnings.push(`Nome duplicado "${n.name || fallback}" — código ajustado para ${code}_${k}.`);
      code = `${code}_${k}`;
    }
    used.add(code);
    codes.set(n.id, code);
  });

  const outgoing = (id: string) => flows.filter((f) => f.source === id);

  /** Segue gateways/eventos até encontrar um nó que virou etapa. */
  const resolveTargets = (
    fromId: string,
    label: string,
    seen: Set<string>,
  ): { code: string; label: string }[] => {
    if (seen.has(fromId)) return [];
    seen.add(fromId);
    const node = nodes.get(fromId);
    if (!node) return [];
    if (codes.has(fromId)) return [{ code: codes.get(fromId) as string, label }];
    // gateway ou evento intermediário: continua
    return outgoing(fromId).flatMap((f) =>
      resolveTargets(f.target, f.name || label, new Set(seen)),
    );
  };

  const startIndex = opts.startIndex || 0;
  const now = new Date().toISOString();

  const steps: AgentFlowStep[] = stepNodes.map((n, i) => {
    const code = codes.get(n.id) as string;
    const targets = outgoing(n.id).flatMap((f) => resolveTargets(f.target, f.name, new Set([n.id])));

    let branches: FlowBranch[] = [];
    let nextCode: string | null = null;

    if (targets.length <= 1) {
      nextCode = targets[0]?.code || null;
    } else {
      const labeled = targets.filter((t) => t.label.trim());
      if (!labeled.length) {
        warnings.push(
          `A etapa "${n.name || code}" tem ${targets.length} caminhos sem rótulo — defina as condições manualmente.`,
        );
      }
      branches = targets.map((t, idx) => ({
        id: `b_${code}_${idx + 1}`,
        label: t.label || `Caminho ${idx + 1}`,
        match_type: t.label ? 'CONTEM' : 'INTENCAO',
        value: t.label || '',
        next_step_code: t.code,
      }));
    }

    const pos = shapePos.get(n.id);

    return {
      id: `tmp_bpmn_${n.id}_${i}`,
      flow_id: opts.flowId,
      step_code: code,
      name: n.name || (n.kind === 'start' ? 'Início' : n.kind === 'end' ? 'Fim' : `Etapa ${i + 1}`),
      description: n.documentation || '',
      message: '',
      messages: {},
      reask_messages: {},
      phase: opts.phase,
      answer_type: 'TEXTO_LIVRE',
      validation: { ...DEFAULT_STEP_VALIDATION, required: n.kind === 'task' },
      next_step_code: nextCode,
      exit_condition: '',
      allow_parallel_question: true,
      allow_free_answer: true,
      handoff: false,
      branches,
      order_index: startIndex + i + 1,
      created_at: now,
      updated_at: now,
      _bpmn_pos: pos,
    } as unknown as AgentFlowStep;
  });

  // Normaliza posições do BPMN para o canvas
  const positions: Record<string, { x: number; y: number }> = {};
  const raw = steps
    .map((s) => ({ code: s.step_code, pos: (s as any)._bpmn_pos as { x: number; y: number } | undefined }))
    .filter((r) => r.pos);
  if (raw.length) {
    const minX = Math.min(...raw.map((r) => r.pos!.x));
    const minY = Math.min(...raw.map((r) => r.pos!.y));
    raw.forEach((r) => {
      positions[r.code] = { x: (r.pos!.x - minX) * 1.6, y: (r.pos!.y - minY) * 1.6 };
    });
  }
  steps.forEach((s) => delete (s as any)._bpmn_pos);

  return { steps, positions, warnings, processName };
}
