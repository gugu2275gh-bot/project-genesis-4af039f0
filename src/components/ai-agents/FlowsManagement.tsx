import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, ListOrdered, Workflow, AlertTriangle } from 'lucide-react';
import { FlowCanvas } from '@/components/ai-agents/flow-builder/FlowCanvas';
import { FlowErrorBoundary } from '@/components/ai-agents/flow-builder/FlowErrorBoundary';
import { StepRoutingEditor } from '@/components/ai-agents/flow-builder/StepRoutingEditor';
import { StepValidationEditor } from '@/components/ai-agents/flow-builder/StepValidationEditor';
import { STEP_KINDS, normalizeBranches, normalizeValidation } from '@/types/ai-agent-flow-builder';


import {
  useAgentFlows,
  useDeleteFlow,
  useDeleteFlowStep,
  useFlowSteps,
  useSaveFlow,
  useSaveFlowStep,
} from '@/hooks/useAIAgents';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import {
  ANSWER_TYPES,
  FLOW_PHASES,
  STEP_FIELD_MAPPINGS,
  type AgentFlow,
  type AgentFlowStep,
  type FlowPhase,
  type MultiLangText,
} from '@/types/ai-agents';

function phaseLabel(phase?: string) {
  return FLOW_PHASES.find((p) => p.value === (phase || 'GERAL'))?.label || 'Geral';
}


function StepDialog({
  open,
  onOpenChange,
  flowId,
  flowPhase,
  step,
  nextIndex,
  allSteps,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  flowId: string;
  flowPhase: FlowPhase;
  step?: AgentFlowStep | null;
  nextIndex: number;
  allSteps: AgentFlowStep[];
}) {
  const save = useSaveFlowStep();
  const [draft, setDraft] = useState<any>(
    step || {
      step_code: '',
      name: '',
      description: '',
      message: '',
      messages: {},
      reask_messages: {},
      phase: flowPhase,
      answer_type: 'TEXTO_LIVRE',
      field_mapping: null,
      next_step_code: '',
      exit_condition: '',
      branches: [],
      allow_parallel_question: true,
      allow_free_answer: true,
      handoff: false,
      order_index: nextIndex,
    },
  );
  const set = (patch: Record<string, unknown>) => setDraft((d: any) => ({ ...d, ...patch }));

  const validation = normalizeValidation(draft.validation);
  const otherCodes = allSteps
    .filter((s) => s.id !== draft.id)
    .map((s) => s.step_code)
    .filter(Boolean);

  const messages: MultiLangText =
    draft.messages && typeof draft.messages === 'object' && Object.keys(draft.messages).length > 0
      ? draft.messages
      : draft.message
        ? { 'pt-BR': draft.message }
        : {};
  const reask: MultiLangText =
    draft.reask_messages && typeof draft.reask_messages === 'object' ? draft.reask_messages : {};
  /** Mensagem com "?" indica pergunta — usada para alertar tipo de etapa incoerente. */
  const looksLikeQuestion = JSON.stringify(messages || {}).includes('?');



  const handleSave = async () => {
    const { created_at, updated_at, ...rest } = draft;
    await save.mutateAsync({
      ...rest,
      messages,
      reask_messages: reask,
      message: messages['pt-BR'] || '',
      phase: draft.phase || flowPhase,
      flow_id: flowId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step ? 'Editar etapa' : 'Nova etapa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Código da etapa *</Label>
              <Input value={draft.step_code} onChange={(e) => set({ step_code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de etapa</Label>
              <Select
                value={validation.step_kind || 'PERGUNTA'}
                onValueChange={(v) => set({ validation: { ...validation, step_kind: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {STEP_KINDS.find((k) => k.value === (validation.step_kind || 'PERGUNTA'))?.hint}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={draft.phase || flowPhase} onValueChange={(v) => set({ phase: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLOW_PHASES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {looksLikeQuestion && (validation.step_kind || 'PERGUNTA') !== 'PERGUNTA' && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              Esta etapa faz uma pergunta, mas não é do tipo "Pergunta": o agente envia a mensagem e
              segue direto para a próxima etapa, sem esperar a resposta.
            </p>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea rows={2} value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <MultiLangField
            label="Mensagem enviada ao cliente"
            hint="Escreva em português e use a tradução automática para os demais idiomas."
            value={messages}
            onChange={(v) => set({ messages: v, message: v['pt-BR'] || '' })}
            rows={3}
          />
          <MultiLangField
            label="Repergunta (quando a resposta não for válida)"
            value={reask}
            onChange={(v) => set({ reask_messages: v })}
            rows={2}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de resposta esperada</Label>
              <Select value={draft.answer_type} onValueChange={(v) => set({ answer_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSWER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={draft.order_index}
                onChange={(e) => set({ order_index: e.target.value.replace(/\D/g, '') })}
                onBlur={(e) => set({ order_index: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Salvar resposta em</Label>
              <Select
                value={(draft as any).field_mapping || '__none__'}
                onValueChange={(v) => set({ field_mapping: v === '__none__' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum campo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum (só no histórico do fluxo)</SelectItem>
                  {STEP_FIELD_MAPPINGS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Condição de saída</Label>
              <Input value={draft.exit_condition || ''} onChange={(e) => set({ exit_condition: e.target.value })} />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium">Respostas e caminhos</p>
          <StepRoutingEditor
            answerType={draft.answer_type}
            validation={validation}
            branches={draft.branches}
            nextStepCode={draft.next_step_code}
            stepCodes={otherCodes}
            onChange={(patch) => set(patch as Record<string, unknown>)}
          />

          <Separator />
          <p className="text-sm font-medium">Validação da resposta</p>
          <StepValidationEditor
            validation={validation}
            stepCodes={otherCodes}
            answerType={draft.answer_type}
            onChange={(patch) => set({ validation: { ...validation, ...patch } })}
          />


          <div className="space-y-2">
            {[
              { key: 'allow_parallel_question', label: 'Permitir pergunta paralela' },
              { key: 'allow_free_answer', label: 'Permitir resposta livre' },
              { key: 'handoff', label: 'Encaminhar para humano' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-md border p-3">
                <Label className="font-normal">{label}</Label>
                <Switch checked={!!draft[key]} onCheckedChange={(v) => set({ [key]: v })} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!draft.step_code?.trim() || !draft.name?.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlowSteps({ flow, onDirtyChange }: { flow: AgentFlow; onDirtyChange?: (d: boolean) => void }) {
  const { data: steps } = useFlowSteps(flow.id);
  const del = useDeleteFlowStep();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentFlowStep | null>(null);
  const [view, setView] = useState<'canvas' | 'table'>('canvas');
  const [canvasDirty, setCanvasDirty] = useState(false);

  const setDirty = (d: boolean) => {
    setCanvasDirty(d);
    onDirtyChange?.(d);
  };

  if (view === 'canvas') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Workflow className="h-4 w-4" /> Desenho de "{flow.name}"
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                canvasDirty &&
                !window.confirm('Há alterações não salvas no desenho. Sair mesmo assim?')
              )
                return;
              setDirty(false);
              setView('table');
            }}
          >
            <ListOrdered className="h-4 w-4 mr-1" /> Ver em tabela
          </Button>
        </div>
        <FlowErrorBoundary resetKey={flow.id}>
          <FlowCanvas key={flow.id} flow={flow} onDirtyChange={setDirty} />
        </FlowErrorBoundary>
      </div>
    );
  }


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          <ListOrdered className="h-4 w-4" /> Etapas de "{flow.name}"
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setView('canvas')}>
            <Workflow className="h-4 w-4 mr-1" /> Editor visual
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova etapa
          </Button>
        </div>

      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ordem</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Fase</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Caminhos</TableHead>
            <TableHead>Próxima</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(steps || []).length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhuma etapa cadastrada</TableCell></TableRow>
          )}
          {(steps || []).map((s) => {
            const codes = new Set((steps || []).map((x) => x.step_code));
            const paths = normalizeBranches((s as any).branches);
            const broken = paths.filter(
              (b) => !b.next_step_code || !codes.has(b.next_step_code),
            ).length;
            return (
            <TableRow key={s.id}>
              <TableCell>{s.order_index}</TableCell>
              <TableCell className="font-mono text-xs">{s.step_code}</TableCell>
              <TableCell>{s.name}</TableCell>
              <TableCell><Badge variant="outline">{phaseLabel(s.phase)}</Badge></TableCell>
              <TableCell>{ANSWER_TYPES.find((t) => t.value === s.answer_type)?.label || s.answer_type}</TableCell>
              <TableCell className="font-mono text-[11px]">
                {paths.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="space-y-0.5">
                    {paths.slice(0, 3).map((b) => (
                      <div key={b.id} className="truncate max-w-[220px]">
                        {(b.value || b.label || '—')} → {b.next_step_code || '(padrão)'}
                      </div>
                    ))}
                    {paths.length > 3 && <div className="text-muted-foreground">+{paths.length - 3}</div>}
                    {broken > 0 && (
                      <div className="flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> {broken} sem destino válido
                      </div>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{s.next_step_code || '—'}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => del.mutate({ id: s.id, flow_id: flow.id })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {open && (
        <StepDialog
          key={editing?.id || 'new'}
          open={open}
          onOpenChange={setOpen}
          flowId={flow.id}
          flowPhase={(flow.phase || 'GERAL') as FlowPhase}
          step={editing}
          nextIndex={(steps?.length || 0) + 1}
          allSteps={steps || []}
        />
      )}


    </div>
  );
}

export function FlowsManagement() {
  const { data: flows, isLoading } = useAgentFlows();
  const saveFlow = useSaveFlow();
  const delFlow = useDeleteFlow();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);

  const [draft, setDraft] = useState<any>({ name: '', description: '', status: 'RASCUNHO', phase: 'PRE_HANDOFF' });

  const current = (flows || []).find((f) => f.id === selected) || null;

  const newFlow = (phase: FlowPhase) => {
    setDraft({ name: '', description: '', status: 'RASCUNHO', phase });
    setDialogOpen(true);
  };

  const renderTable = (phase: FlowPhase) => {
    const list = (flows || []).filter((f: any) => (f.phase || 'GERAL') === phase);
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum fluxo nesta fase</TableCell></TableRow>
          )}
          {list.map((f) => (
            <TableRow key={f.id} className={selected === f.id ? 'bg-accent/50' : ''}>
              <TableCell className="font-medium">{f.name}</TableCell>
              <TableCell className="max-w-[280px] truncate">{f.description || '—'}</TableCell>
              <TableCell><Badge variant="outline">{f.status}</Badge></TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="sm" variant="outline" onClick={() => setSelected(f.id)}>
                  <Workflow className="h-4 w-4 mr-1" /> Abrir editor
                </Button>

                <Button size="icon" variant="ghost" onClick={() => { setDraft(f); setDialogOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => delFlow.mutate(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        FLOW_PHASES.map((p) => (
          <Card key={p.value}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{p.label}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              </div>
              <Button size="sm" onClick={() => newFlow(p.value)}>
                <Plus className="h-4 w-4 mr-1" /> Novo fluxo
              </Button>
            </CardHeader>
            <CardContent>{renderTable(p.value)}</CardContent>
          </Card>
        ))
      )}

      <Dialog
        open={!!current}
        onOpenChange={(o) => {
          if (o) return;
          if (editorDirty && !window.confirm('Há alterações não salvas no desenho. Fechar mesmo assim?')) return;
          setEditorDirty(false);
          setSelected(null);
        }}
      >
        <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              {current?.name}
              {current && (
                <Badge variant="outline">
                  {FLOW_PHASES.find((p) => p.value === ((current as any).phase || 'GERAL'))?.label ||
                    (current as any).phase}
                </Badge>
              )}
              {editorDirty && <Badge variant="secondary">Alterações não salvas</Badge>}
            </DialogTitle>
          </DialogHeader>
          {current && <FlowSteps flow={current} onDirtyChange={setEditorDirty} />}
        </DialogContent>
      </Dialog>



      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft.id ? 'Editar fluxo' : 'Novo fluxo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Fase do fluxo</Label>
              <Select value={draft.phase || 'PRE_HANDOFF'} onValueChange={(v) => setDraft({ ...draft, phase: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLOW_PHASES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {FLOW_PHASES.find((p) => p.value === (draft.phase || 'PRE_HANDOFF'))?.description}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            {draft.id && (
              <Button
                variant="secondary"
                onClick={() => { setDialogOpen(false); setSelected(draft.id); }}
              >
                <Workflow className="h-4 w-4 mr-1" /> Editar etapas
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>

            <Button
              disabled={!draft.name?.trim()}
              onClick={async () => {
                const { created_at, updated_at, ...rest } = draft;
                await saveFlow.mutateAsync(rest);
                setDialogOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
