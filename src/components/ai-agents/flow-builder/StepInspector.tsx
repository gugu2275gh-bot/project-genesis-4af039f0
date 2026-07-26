import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, X } from 'lucide-react';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import { ANSWER_TYPES, FLOW_PHASES, type AgentFlowStep, type MultiLangText } from '@/types/ai-agents';
import {
  ANSWER_FORMATS,
  BRANCH_MATCH_TYPES,
  SKIP_MODES,
  STEP_KINDS,
  messageAt,
  messageCount,
  normalizeBranches,
  normalizeMessages,
  normalizeValidation,
  removeMessageAt,
  setMessageAt,
  stepKindOf,
  type FlowBranch,
  type StepValidation,
} from '@/types/ai-agent-flow-builder';


interface Props {
  step: AgentFlowStep;
  allSteps: AgentFlowStep[];
  onChange: (patch: Partial<AgentFlowStep>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const AUTO_BRANCH_TYPES = ['SIM_NAO', 'SELECAO', 'BOTOES', 'MULTIPLA_ESCOLHA'];

export function StepInspector({ step, allSteps, onChange, onDelete, onClose }: Props) {
  const branches = useMemo(() => normalizeBranches((step as any).branches), [step]);
  const validation = useMemo(() => normalizeValidation(step.validation), [step]);
  const [optionInput, setOptionInput] = useState('');

  const otherCodes = allSteps.filter((s) => s.id !== step.id).map((s) => s.step_code).filter(Boolean);

  const setValidation = (patch: Partial<StepValidation>) =>
    onChange({ validation: { ...validation, ...patch } as any });

  const setBranches = (next: FlowBranch[]) => onChange({ branches: next } as any);

  // Gera ramificações automaticamente a partir das opções, para tipos de escolha.
  useEffect(() => {
    if (!AUTO_BRANCH_TYPES.includes(step.answer_type)) return;
    const options =
      step.answer_type === 'SIM_NAO' ? ['Sim', 'Não'] : (validation.options || []);
    if (options.length === 0) return;
    const missing = options.filter((o) => !branches.some((b) => b.value === o));
    if (missing.length === 0) return;
    setBranches([
      ...branches,
      ...missing.map((o, i) => ({
        id: `b_${Date.now()}_${i}`,
        label: o,
        match_type: 'IGUAL' as const,
        value: o,
        next_step_code: null,
      })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.answer_type, validation.options, branches, step.id]);

  const messages = useMemo(
    () => normalizeMessages(step.messages, step.message),
    [step.messages, step.message],
  );
  const kind = stepKindOf(step);
  const total = messageCount(messages);

  const updateMessages = (next: ReturnType<typeof normalizeMessages>) => {
    const first = next['pt-BR'];
    onChange({
      messages: next as any,
      message: (Array.isArray(first) ? first[0] : first) || '',
    });
  };


  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{step.name || 'Nova etapa'}</p>
          <p className="font-mono text-[11px] text-muted-foreground truncate">{step.step_code}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <Tabs defaultValue="pergunta" className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="mx-4 mt-3 grid grid-cols-4">
          <TabsTrigger value="pergunta">Mensagens</TabsTrigger>
          <TabsTrigger value="respostas">Respostas</TabsTrigger>
          <TabsTrigger value="validacao">Validação</TabsTrigger>
          <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="pergunta" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input value={step.step_code} onChange={(e) => onChange({ step_code: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={step.name} onChange={(e) => onChange({ name: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de etapa</Label>
              <Select
                value={kind}
                onValueChange={(v) =>
                  onChange({
                    validation: { ...validation, step_kind: v as any } as any,
                    ...(v === 'FIM' ? {} : {}),
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STEP_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {STEP_KINDS.find((k) => k.value === kind)?.hint}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Fase</Label>
              <Select value={step.phase || 'GERAL'} onValueChange={(v) => onChange({ phase: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLOW_PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição interna</Label>
              <Textarea rows={2} value={step.description || ''} onChange={(e) => onChange({ description: e.target.value })} />
            </div>

            {Array.from({ length: total }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Mensagem {i + 1} de {total}
                  </span>
                  {total > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remover mensagem"
                      onClick={() => updateMessages(removeMessageAt(messages, i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <MultiLangField
                  label={
                    kind === 'PERGUNTA' && i === total - 1
                      ? 'Texto enviado ao cliente (pergunta)'
                      : 'Texto enviado ao cliente'
                  }
                  hint={i === 0 ? 'Escreva em português e traduza automaticamente para os demais idiomas.' : undefined}
                  value={messageAt(messages, i)}
                  onChange={(v) => updateMessages(setMessageAt(messages, i, v))}
                  rows={3}
                />
              </div>
            ))}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => updateMessages(setMessageAt(messages, total, {}))}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar mensagem em sequência
            </Button>

            {kind === 'PERGUNTA' && (
              <MultiLangField
                label="Repergunta (resposta inválida)"
                value={step.reask_messages || {}}
                onChange={(v) => onChange({ reask_messages: v })}
                rows={2}
              />
            )}
          </TabsContent>


          <TabsContent value="respostas" className="mt-0 space-y-4">
            <div className="space-y-2">
              <Label>Tipo de resposta esperada</Label>
              <Select value={step.answer_type} onValueChange={(v) => onChange({ answer_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSWER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {['SELECAO', 'BOTOES', 'MULTIPLA_ESCOLHA'].includes(step.answer_type) && (
              <div className="space-y-2">
                <Label>Opções oferecidas</Label>
                <div className="flex flex-wrap gap-1">
                  {(validation.options || []).map((o) => (
                    <Badge key={o} variant="secondary" className="gap-1">
                      {o}
                      <button
                        type="button"
                        onClick={() => setValidation({ options: (validation.options || []).filter((x) => x !== o) })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={optionInput}
                    placeholder="Nova opção"
                    onChange={(e) => setOptionInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const v = optionInput.trim();
                      if (!v) return;
                      setValidation({ options: Array.from(new Set([...(validation.options || []), v])) });
                      setOptionInput('');
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Ramificações (respostas possíveis)</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setBranches([
                    ...branches,
                    { id: `b_${Date.now()}`, label: '', match_type: 'IGUAL', value: '', next_step_code: null },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Resposta
              </Button>
            </div>

            {branches.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sem ramificações: o fluxo segue sempre para a próxima etapa padrão.
              </p>
            )}

            {branches.map((b, i) => (
              <div key={b.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Resposta {i + 1}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setBranches(branches.filter((x) => x.id !== b.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="Rótulo"
                  value={b.label}
                  onChange={(e) =>
                    setBranches(branches.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)))
                  }
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={b.match_type}
                    onValueChange={(v) =>
                      setBranches(branches.map((x) => (x.id === b.id ? { ...x, match_type: v as any } : x)))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BRANCH_MATCH_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Valor"
                    disabled={b.match_type === 'QUALQUER'}
                    value={b.value}
                    onChange={(e) =>
                      setBranches(branches.map((x) => (x.id === b.id ? { ...x, value: e.target.value } : x)))
                    }
                  />
                </div>
                <Select
                  value={b.next_step_code || '__none__'}
                  onValueChange={(v) =>
                    setBranches(
                      branches.map((x) =>
                        x.id === b.id ? { ...x, next_step_code: v === '__none__' ? null : v } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Vai para…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem destino</SelectItem>
                    {otherCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <Separator />
            <div className="space-y-2">
              <Label>Próxima etapa padrão (senão)</Label>
              <Select
                value={step.next_step_code || '__none__'}
                onValueChange={(v) => onChange({ next_step_code: v === '__none__' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {otherCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="validacao" className="mt-0 space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="font-normal">Resposta obrigatória</Label>
              <Switch checked={validation.required !== false} onCheckedChange={(v) => setValidation({ required: v })} />
            </div>
            <div className="space-y-2">
              <Label>Formato esperado</Label>
              <Select value={validation.format || 'NENHUM'} onValueChange={(v) => setValidation({ format: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSWER_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {validation.format === 'REGEX' && (
              <div className="space-y-2">
                <Label>Expressão regular</Label>
                <Input value={validation.regex || ''} onChange={(e) => setValidation({ regex: e.target.value })} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mínimo</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={validation.min ?? ''}
                  onChange={(e) => setValidation({ min: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Máximo</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={validation.max ?? ''}
                  onChange={(e) => setValidation({ max: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reperguntas antes do fallback</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={validation.max_reasks ?? 2}
                onChange={(e) => setValidation({ max_reasks: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </div>
          </TabsContent>

          <TabsContent value="comportamento" className="mt-0 space-y-4">
            <div className="space-y-2">
              <Label>Salvar resposta no campo</Label>
              <Input
                placeholder="ex.: nome_completo"
                value={validation.save_to_field || ''}
                onChange={(e) => setValidation({ save_to_field: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Não repetir esta etapa</Label>
              <Select value={validation.skip_mode || 'NUNCA'} onValueChange={(v) => setValidation({ skip_mode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SKIP_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {validation.skip_mode === 'CAMPO_PREENCHIDO' && (
              <div className="space-y-2">
                <Label>Campo verificado</Label>
                <Input
                  value={validation.skip_field || ''}
                  onChange={(e) => setValidation({ skip_field: e.target.value })}
                />
              </div>
            )}
            {validation.skip_mode === 'ETAPA_CONCLUIDA' && (
              <div className="space-y-2">
                <Label>Etapa já concluída</Label>
                <Select
                  value={validation.skip_step_code || '__none__'}
                  onValueChange={(v) => setValidation({ skip_step_code: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione</SelectItem>
                    {otherCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            {[
              { key: 'allow_parallel_question', label: 'Permitir pergunta paralela' },
              { key: 'allow_free_answer', label: 'Permitir resposta livre' },
              { key: 'handoff', label: 'Encaminhar para humano nesta etapa' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-md border p-3">
                <Label className="font-normal">{label}</Label>
                <Switch
                  checked={!!(step as any)[key]}
                  onCheckedChange={(v) => onChange({ [key]: v } as any)}
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>Condição de saída</Label>
              <Input value={step.exit_condition || ''} onChange={(e) => onChange({ exit_condition: e.target.value })} />
            </div>

            <Button variant="destructive" className="w-full" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir etapa
            </Button>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
