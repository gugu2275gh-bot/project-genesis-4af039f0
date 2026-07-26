import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, LayoutGrid, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { StepNode } from './StepNode';
import { StepInspector } from './StepInspector';
import { autoLayout } from '@/lib/flow-layout';
import { validateFlow } from '@/lib/flow-validation';
import { useFlowSteps, useSaveFlowCanvas } from '@/hooks/useAIAgents';
import { ImportBizagiDialog } from './ImportBizagiDialog';
import type { ImportedFlow } from '@/lib/bizagi-bpmn-import';
import type { AgentFlow, AgentFlowStep, FlowPhase } from '@/types/ai-agents';

import {
  DEFAULT_STEP_VALIDATION,
  migratePositions,
  normalizeBranches,
  renameStepCode,
  slugStepCode,
  uniqueStepCode,
  type FlowCanvasData,
} from '@/types/ai-agent-flow-builder';

const nodeTypes = { step: StepNode };

type PosMap = Record<string, { x: number; y: number }>;

const idOf = (s: AgentFlowStep) => s.id;

/** Converte posições calculadas por código para o formato indexado por id. */
function layoutById(steps: AgentFlowStep[]): PosMap {
  const byCode = autoLayout(steps);
  const out: PosMap = {};
  steps.forEach((s, i) => {
    out[s.id] = byCode[s.step_code] || { x: (i % 4) * 320, y: Math.floor(i / 4) * 200 };
  });
  return out;
}

function newStep(flowId: string, phase: FlowPhase, existingCodes: string[], index: number): AgentFlowStep {
  const code = uniqueStepCode(existingCodes, `etapa_${index + 1}`);
  return {
    id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    flow_id: flowId,
    step_code: code,
    name: `Etapa ${index + 1}`,
    description: '',
    message: '',
    messages: {},
    reask_messages: {},
    phase,
    answer_type: 'TEXTO_LIVRE',
    validation: { ...DEFAULT_STEP_VALIDATION } as any,
    next_step_code: null,
    exit_condition: '',
    allow_parallel_question: true,
    allow_free_answer: true,
    handoff: false,
    order_index: index + 1,
    created_at: '',
    updated_at: '',
  } as AgentFlowStep;
}

function FlowCanvasInner({ flow, onDirtyChange }: { flow: AgentFlow; onDirtyChange?: (d: boolean) => void }) {
  const { data: savedSteps } = useFlowSteps(flow.id);
  const saveCanvas = useSaveFlowCanvas();

  const [steps, setSteps] = useState<AgentFlowStep[]>([]);
  const [positions, setPositions] = useState<PosMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const deleteStepRef = useRef<(id: string) => void>(() => {});
  const dirtyRef = useRef(false);
  const loadedFlowRef = useRef<string | null>(null);

  dirtyRef.current = dirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const loadFromServer = useCallback(
    (list: AgentFlowStep[]) => {
      const canvas = ((flow as any).canvas || {}) as FlowCanvasData;
      const saved = migratePositions(canvas.positions, list);
      const fallback = layoutById(list);
      const merged: PosMap = {};
      list.forEach((s) => {
        merged[s.id] = saved[s.id] || fallback[s.id];
      });
      setSteps(list);
      setPositions(merged);
      setSelectedId(null);
      setRemovedIds([]);
      setDirty(false);
    },
    [flow],
  );

  // Só sincroniza com o servidor quando não há rascunho pendente, para nunca
  // descartar alterações do usuário em um refetch do React Query.
  useEffect(() => {
    if (!savedSteps) return;
    const flowChanged = loadedFlowRef.current !== flow.id;
    if (!flowChanged && dirtyRef.current) return;
    loadedFlowRef.current = flow.id;
    loadFromServer(savedSteps);
  }, [savedSteps, flow.id, loadFromServer]);

  const issues = useMemo(() => validateFlow(steps), [steps]);
  const errorCodes = useMemo(
    () => new Set(issues.filter((i) => i.stepCode).map((i) => i.stepCode as string)),
    [issues],
  );

  const handleDelete = useCallback((id: string) => deleteStepRef.current(id), []);

  const nodes: Node[] = useMemo(
    () =>
      steps.map((s, i) => ({
        id: s.id,
        type: 'step',
        position: positions[s.id] || { x: (i % 4) * 320, y: Math.floor(i / 4) * 200 },
        data: { step: s, hasIssue: errorCodes.has(s.step_code), onDelete: handleDelete },
        selected: selectedId === s.id,
      })),
    [steps, positions, selectedId, errorCodes, handleDelete],
  );

  const edges: Edge[] = useMemo(() => {
    // Primeiro código vence quando há duplicados, evitando arestas cruzadas.
    const byCode = new Map<string, AgentFlowStep>();
    steps.forEach((s) => {
      if (s.step_code && !byCode.has(s.step_code)) byCode.set(s.step_code, s);
    });
    const list: Edge[] = [];
    steps.forEach((s) => {
      normalizeBranches((s as any).branches).forEach((b) => {
        const target = b.next_step_code ? byCode.get(b.next_step_code) : null;
        if (!target) return;
        list.push({
          id: `${s.id}-${b.id}`,
          source: s.id,
          sourceHandle: `branch-${b.id}`,
          target: target.id,
          label: b.label || b.value,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      });
      const def = s.next_step_code ? byCode.get(s.next_step_code) : null;
      if (def) {
        list.push({
          id: `${s.id}-default`,
          source: s.id,
          sourceHandle: 'default',
          target: def.id,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      }
    });
    return list;
  }, [steps]);

  const patchStep = useCallback((id: string, patch: Partial<AgentFlowStep>) => {
    setSteps((prev) => {
      let next = prev.map((s) => (s.id === id ? ({ ...s, ...patch } as AgentFlowStep) : s));
      if (patch.step_code !== undefined) {
        const raw = slugStepCode(String(patch.step_code));
        const current = prev.find((s) => s.id === id);
        if (current && raw && raw !== current.step_code) {
          next = renameStepCode(next.map((s) => (s.id === id ? { ...s, step_code: current.step_code } : s)), id, raw, idOf);
        } else {
          next = next.map((s) => (s.id === id ? { ...s, step_code: raw } : s));
        }
      }
      return next;
    });
    setDirty(true);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    let moved = false;
    let finished = false;
    setPositions((prev) => {
      let next = prev;
      changes.forEach((c) => {
        if (c.type === 'position' && (c as any).position) {
          next = { ...next, [c.id]: (c as any).position };
          moved = true;
          if ((c as any).dragging === false) finished = true;
        }
      });
      return moved ? next : prev;
    });
    const sel = changes.find((c) => c.type === 'select') as any;
    if (sel) setSelectedId(sel.selected ? sel.id : (prev) => (prev === sel.id ? null : prev) as any);
    if (finished) setDirty(true);
  }, []);

  const onConnect = useCallback(
    (conn: Connection) => {
      const source = steps.find((s) => s.id === conn.source);
      const target = steps.find((s) => s.id === conn.target);
      if (!source || !target || !target.step_code) return;
      if (conn.sourceHandle && conn.sourceHandle.startsWith('branch-')) {
        const branchId = conn.sourceHandle.replace('branch-', '');
        const branches = normalizeBranches((source as any).branches).map((b) =>
          b.id === branchId ? { ...b, next_step_code: target.step_code } : b,
        );
        patchStep(source.id, { branches } as any);
      } else {
        patchStep(source.id, { next_step_code: target.step_code });
      }
    },
    [steps, patchStep],
  );

  const addStep = () => {
    const step = newStep(
      flow.id,
      (flow.phase || 'GERAL') as FlowPhase,
      steps.map((s) => s.step_code),
      steps.length,
    );
    setSteps((prev) => [...prev, step]);
    setPositions((prev) => ({
      ...prev,
      [step.id]: { x: (steps.length % 4) * 320, y: Math.floor(steps.length / 4) * 200 + 60 },
    }));
    setSelectedId(step.id);
    setDirty(true);
  };

  const deleteStep = useCallback(
    (id: string) => {
      const step = steps.find((s) => s.id === id);
      if (!step) return;
      const refs = steps.filter(
        (s) =>
          s.id !== id &&
          (s.next_step_code === step.step_code ||
            normalizeBranches((s as any).branches).some((b) => b.next_step_code === step.step_code)),
      );
      const msg = refs.length
        ? `Excluir a etapa "${step.name || step.step_code}"? ${refs.length} ligação(ões) de outras etapas serão removidas.`
        : `Excluir a etapa "${step.name || step.step_code}"?`;
      if (!window.confirm(msg)) return;
      if (!String(step.id).startsWith('tmp_')) setRemovedIds((prev) => [...prev, step.id]);
      setSteps((prev) =>
        prev
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            next_step_code: s.next_step_code === step.step_code ? null : s.next_step_code,
            ...(normalizeBranches((s as any).branches).length
              ? {
                  branches: normalizeBranches((s as any).branches).map((b) =>
                    b.next_step_code === step.step_code ? { ...b, next_step_code: null } : b,
                  ),
                }
              : {}),
          })) as AgentFlowStep[],
      );
      setPositions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSelectedId((prev) => (prev === id ? null : prev));
      setDirty(true);
    },
    [steps],
  );

  deleteStepRef.current = deleteStep;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || !selectedId) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (el?.isContentEditable) return;
      deleteStepRef.current(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const applyImport = (result: ImportedFlow, mode: 'REPLACE' | 'APPEND') => {
    if (mode === 'REPLACE') {
      setRemovedIds((prev) => [...prev, ...steps.filter((s) => !String(s.id).startsWith('tmp_')).map((s) => s.id)]);
      setSteps(result.steps);
      setPositions(layoutById(result.steps));
    } else {
      const existing = new Set(steps.map((s) => s.step_code));
      const imported = result.steps.filter((s) => !existing.has(s.step_code));
      const merged = [...steps, ...imported];
      setSteps(merged);
      setPositions(layoutById(merged));
    }
    setSelectedId(null);
    setDirty(true);
  };

  const organize = () => {
    setPositions(layoutById(steps));
    setDirty(true);
  };

  const discard = () => {
    if (!savedSteps) return;
    if (!window.confirm('Descartar todas as alterações não salvas deste fluxo?')) return;
    loadFromServer(savedSteps);
  };

  const handleSave = async () => {
    const errs = issues.filter((i) => i.level === 'error');
    if (errs.length) {
      const ok = window.confirm(
        `O fluxo tem ${errs.length} erro(s):\n\n- ${errs
          .slice(0, 5)
          .map((e) => e.message)
          .join('\n- ')}\n\nSalvar mesmo assim?`,
      );
      if (!ok) return;
    }
    const result = await saveCanvas.mutateAsync({ flowId: flow.id, steps, positions, removedIds });
    const idMap = (result as any)?.idMap as Record<string, string> | undefined;
    if (idMap && Object.keys(idMap).length) {
      setSteps((prev) => prev.map((s) => (idMap[s.id] ? ({ ...s, id: idMap[s.id] } as AgentFlowStep) : s)));
      setPositions((prev) => {
        const next: PosMap = {};
        Object.entries(prev).forEach(([id, pos]) => {
          next[idMap[id] || id] = pos;
        });
        return next;
      });
      setSelectedId((prev) => (prev && idMap[prev] ? idMap[prev] : prev));
    }
    setDirty(false);
    setRemovedIds([]);
  };

  const selected = steps.find((s) => s.id === selectedId) || null;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={addStep}><Plus className="h-4 w-4 mr-1" /> Nova etapa</Button>
          <Button size="sm" variant="outline" onClick={organize}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Auto-organizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar do Bizagi
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={discard}>
              <RotateCcw className="h-4 w-4 mr-1" /> Descartar alterações
            </Button>
          )}
          {selected && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteStep(selected.id)}>
              <Trash2 className="h-4 w-4 mr-1" /> Excluir etapa
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {dirty && <Badge variant="secondary">Alterações não salvas</Badge>}
          {errors.length === 0 && warnings.length === 0 ? (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Fluxo sem problemas
            </Badge>
          ) : (
            <Badge variant={errors.length ? 'destructive' : 'secondary'} className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {errors.length} erro(s) · {warnings.length} aviso(s)
            </Badge>
          )}
          <Button size="sm" onClick={handleSave} disabled={!dirty || saveCanvas.isPending}>
            <Save className="h-4 w-4 mr-1" /> {saveCanvas.isPending ? 'Salvando…' : 'Salvar fluxo'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="relative h-[620px] min-h-[520px] rounded-lg border bg-muted/20">
          {steps.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground max-w-xs">
                Este fluxo ainda não tem etapas. Crie a primeira etapa para começar a desenhar.
              </p>
              <Button size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-1" /> Criar primeira etapa
              </Button>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={null}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <div className="rounded-lg border">
          {selected ? (
            <StepInspector
              key={selected.id}
              step={selected}
              allSteps={steps}
              onChange={(patch) => patchStep(selected.id, patch)}
              onDelete={() => deleteStep(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Clique em uma etapa no desenho para configurar pergunta, respostas, validações e comportamento.
              </p>
              {issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Problemas do fluxo</p>
                  {issues.map((i, idx) => (
                    <Alert key={idx} variant={i.level === 'error' ? 'destructive' : 'default'}>
                      <AlertDescription className="text-xs">{i.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ImportBizagiDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        flowId={flow.id}
        phase={(flow.phase || 'GERAL') as FlowPhase}
        currentCount={steps.length}
        onImport={applyImport}
      />
    </div>
  );
}

export function FlowCanvas({ flow, onDirtyChange }: { flow: AgentFlow; onDirtyChange?: (d: boolean) => void }) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner flow={flow} onDirtyChange={onDirtyChange} />
    </ReactFlowProvider>
  );
}
