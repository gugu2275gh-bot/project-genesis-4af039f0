import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
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
import { AlertTriangle, CheckCircle2, LayoutGrid, Plus, Save } from 'lucide-react';
import { StepNode } from './StepNode';
import { StepInspector } from './StepInspector';
import { autoLayout } from '@/lib/flow-layout';
import { validateFlow } from '@/lib/flow-validation';
import { useFlowSteps, useSaveFlowCanvas } from '@/hooks/useAIAgents';
import type { AgentFlow, AgentFlowStep, FlowPhase } from '@/types/ai-agents';
import {
  DEFAULT_STEP_VALIDATION,
  normalizeBranches,
  type FlowCanvasData,
} from '@/types/ai-agent-flow-builder';

const nodeTypes = { step: StepNode };

function newStep(flowId: string, phase: FlowPhase, index: number): AgentFlowStep {
  return {
    id: `tmp_${Date.now()}_${index}`,
    flow_id: flowId,
    step_code: `etapa_${index + 1}`,
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

function FlowCanvasInner({ flow }: { flow: AgentFlow }) {
  const { data: savedSteps } = useFlowSteps(flow.id);
  const saveCanvas = useSaveFlowCanvas();

  const [steps, setSteps] = useState<AgentFlowStep[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!savedSteps) return;
    setSteps(savedSteps);
    const canvas = ((flow as any).canvas || {}) as FlowCanvasData;
    const saved = canvas.positions || {};
    const missing = savedSteps.filter((s) => !saved[s.step_code]);
    setPositions(missing.length ? { ...autoLayout(savedSteps), ...saved } : saved);
    setDirty(false);
    setRemovedIds([]);
  }, [savedSteps, flow.id]);

  const issues = useMemo(() => validateFlow(steps), [steps]);
  const errorCodes = useMemo(
    () => new Set(issues.filter((i) => i.stepCode).map((i) => i.stepCode as string)),
    [issues],
  );

  const nodes: Node[] = useMemo(
    () =>
      steps.map((s) => ({
        id: s.id,
        type: 'step',
        position: positions[s.step_code] || { x: 0, y: 0 },
        data: { step: s, hasIssue: errorCodes.has(s.step_code) },
        selected: selectedId === s.id,
      })),
    [steps, positions, selectedId, errorCodes],
  );

  const edges: Edge[] = useMemo(() => {
    const byCode = new Map(steps.map((s) => [s.step_code, s]));
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
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as AgentFlowStep) : s)));
    setDirty(true);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes);
      const map: Record<string, { x: number; y: number }> = {};
      next.forEach((n) => {
        const step = steps.find((s) => s.id === n.id);
        if (step) map[step.step_code] = n.position;
      });
      setPositions(map);
      if (changes.some((c) => c.type === 'position' && (c as any).dragging === false)) setDirty(true);
    },
    [nodes, steps],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const source = steps.find((s) => s.id === conn.source);
      const target = steps.find((s) => s.id === conn.target);
      if (!source || !target) return;
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
    const step = newStep(flow.id, (flow.phase || 'GERAL') as FlowPhase, steps.length);
    setSteps((prev) => [...prev, step]);
    setPositions((prev) => ({
      ...prev,
      [step.step_code]: { x: (steps.length % 4) * 320, y: Math.floor(steps.length / 4) * 200 + 60 },
    }));
    setSelectedId(step.id);
    setDirty(true);
  };

  const deleteStep = (id: string) => {
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    if (!step.id.startsWith('tmp_')) setRemovedIds((prev) => [...prev, step.id]);
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== id)
        .map((s) => ({
          ...s,
          next_step_code: s.next_step_code === step.step_code ? null : s.next_step_code,
          branches: normalizeBranches((s as any).branches).map((b) =>
            b.next_step_code === step.step_code ? { ...b, next_step_code: null } : b,
          ),
        })) as AgentFlowStep[],
    );
    setSelectedId(null);
    setDirty(true);
  };

  const organize = () => {
    setPositions(autoLayout(steps));
    setDirty(true);
  };

  const handleSave = async () => {
    await saveCanvas.mutateAsync({ flowId: flow.id, steps, positions, removedIds });
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
        </div>
        <div className="flex items-center gap-2">
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
            <Save className="h-4 w-4 mr-1" /> Salvar fluxo
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
    </div>
  );
}

export function FlowCanvas({ flow }: { flow: AgentFlow }) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner flow={flow} />
    </ReactFlowProvider>
  );
}
