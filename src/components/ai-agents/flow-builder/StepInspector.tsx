import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, X } from 'lucide-react';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import { StepRoutingEditor } from '@/components/ai-agents/flow-builder/StepRoutingEditor';
import { StepValidationEditor } from '@/components/ai-agents/flow-builder/StepValidationEditor';
import { StepUnexpectedAnswerEditor } from '@/components/ai-agents/flow-builder/StepUnexpectedAnswerEditor';
import { ANSWER_TYPES, FLOW_PHASES, STEP_FIELD_MAPPINGS, type AgentFlowStep } from '@/types/ai-agents';

import {
  STEP_KINDS,
  messageAt,
  messageCount,
  normalizeMessages,
  normalizeValidation,
  removeMessageAt,
  setMessageAt,
  stepKindOf,
  type StepValidation,
} from '@/types/ai-agent-flow-builder';


interface Props {
  step: AgentFlowStep;
  allSteps: AgentFlowStep[];
  onChange: (patch: Partial<AgentFlowStep>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function StepInspector({ step, allSteps, onChange, onDelete, onClose }: Props) {
  const validation = useMemo(() => normalizeValidation(step.validation), [step]);

  const otherCodes = allSteps.filter((s) => s.id !== step.id).map((s) => s.step_code).filter(Boolean);
  const duplicateCode = otherCodes.includes(step.step_code);
  const emptyCode = !step.step_code?.trim();

  const setValidation = (patch: Partial<StepValidation>) =>
    onChange({ validation: { ...validation, ...patch } as any });

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
        <TabsList className="mx-4 mt-3 grid grid-cols-5">
          <TabsTrigger value="pergunta">Mensagens</TabsTrigger>
          <TabsTrigger value="respostas">Respostas</TabsTrigger>
          <TabsTrigger value="validacao">Validação</TabsTrigger>
          <TabsTrigger value="naosei">Se não souber</TabsTrigger>
          <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="pergunta" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input value={step.step_code} onChange={(e) => onChange({ step_code: e.target.value })} />
                {(duplicateCode || emptyCode) && (
                  <p className="text-xs text-destructive">
                    {emptyCode ? 'Informe um código para a etapa.' : 'Já existe outra etapa com este código.'}
                  </p>
                )}
                {!duplicateCode && !emptyCode && (
                  <p className="text-[11px] text-muted-foreground">
                    Ao renomear, as ligações das outras etapas são atualizadas automaticamente.
                  </p>
                )}
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
              {kind !== 'PERGUNTA' && JSON.stringify(step.messages || {}).includes('?') && (
                <p className="text-xs text-amber-600">
                  Esta etapa faz uma pergunta, mas não é do tipo "Pergunta": o agente envia a
                  mensagem e segue direto para a próxima etapa, sem esperar a resposta.
                </p>
              )}

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
            {kind !== 'PERGUNTA' && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Esta etapa é do tipo "{STEP_KINDS.find((k) => k.value === kind)?.label}" e não espera resposta
                do cliente. Use apenas a próxima etapa padrão abaixo.
              </p>
            )}
            {kind === 'PERGUNTA' && (
            <div className="space-y-2">
              <Label>Tipo de resposta esperada</Label>
              <Select value={step.answer_type} onValueChange={(v) => onChange({ answer_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSWER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}

            {kind === 'PERGUNTA' && (
              <div className="space-y-2">
                <Label>Salvar resposta em</Label>
                <Select
                  value={(step as any).field_mapping || '__none__'}
                  onValueChange={(v) => onChange({ field_mapping: v === '__none__' ? null : v } as any)}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhum campo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum (só no histórico do fluxo)</SelectItem>
                    {STEP_FIELD_MAPPINGS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A resposta validada é gravada automaticamente neste campo do cliente.
                </p>
              </div>
            )}

            <StepRoutingEditor
              answerType={step.answer_type}
              validation={validation}
              branches={(step as any).branches}
              nextStepCode={step.next_step_code}
              stepCodes={otherCodes}
              onChange={(patch) => onChange(patch as any)}
            />
          </TabsContent>

          <TabsContent value="validacao" className="mt-0 space-y-4">
            <StepValidationEditor
              validation={validation}
              stepCodes={otherCodes}
              answerType={step.answer_type}
              onChange={(patch) => setValidation(patch)}
            />

          </TabsContent>

          <TabsContent value="naosei" className="mt-0 space-y-4">
            <StepUnexpectedAnswerEditor
              value={validation.unexpected_answer}
              legacyValue={validation.unknown_answer}
              fallbackStepCode={validation.fallback_step_code}
              onChange={(next) => setValidation({ unexpected_answer: next })}
            />
          </TabsContent>

          <TabsContent value="comportamento" className="mt-0 space-y-4">



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
