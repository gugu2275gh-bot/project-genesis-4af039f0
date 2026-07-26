import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgentFlows, useAgentVersions, useSaveAgent } from '@/hooks/useAIAgents';
import {
  AIAgent,
  DEFAULT_BEHAVIOR,
  DEFAULT_CAPABILITIES,
  PERSONALITIES,
  type AgentBehavior,
  type AgentCapabilities,
} from '@/types/ai-agents';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agent?: AIAgent | null;
  readOnly?: boolean;
}

const emptyDraft = () => ({
  name: '',
  description: '',
  provider: 'gemini' as const,
  model: 'gemini-2.5-flash',
  status: 'RASCUNHO' as const,
  temperature: 0.7,
  max_tokens: 1024,
  default_language: 'pt',
  prompt_base: '',
  prompt_behavior: '',
  fallback_message: '',
  handoff_message: '',
  flow_id: null as string | null,
  capabilities: { ...DEFAULT_CAPABILITIES },
  behavior: { ...DEFAULT_BEHAVIOR },
});

const CAP_LABELS: { key: keyof AgentCapabilities; label: string }[] = [
  { key: 'answer_questions', label: 'Responder perguntas' },
  { key: 'use_knowledge_base', label: 'Consultar a base de conhecimento' },
  { key: 'use_rag', label: 'Utilizar RAG' },
  { key: 'ask_questions', label: 'Fazer perguntas ao cliente' },
  { key: 'run_structured_flow', label: 'Executar o fluxo estruturado' },
  { key: 'handoff_to_human', label: 'Encaminhar para atendimento humano' },
];

function ListField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={3}
        disabled={disabled}
        placeholder={placeholder || 'Uma por linha'}
        value={(value || []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s).filter((s) => s.trim() !== '' || false))}
      />
    </div>
  );
}

export function AgentFormDialog({ open, onOpenChange, agent, readOnly }: Props) {
  const [draft, setDraft] = useState<any>(emptyDraft());
  const { data: flows } = useAgentFlows();
  const { data: versions } = useAgentVersions(agent?.id);
  const save = useSaveAgent();

  useEffect(() => {
    if (!open) return;
    setDraft(
      agent
        ? {
            ...agent,
            capabilities: { ...DEFAULT_CAPABILITIES, ...(agent.capabilities || {}) },
            behavior: { ...DEFAULT_BEHAVIOR, ...(agent.behavior || {}) },
          }
        : emptyDraft(),
    );
  }, [open, agent]);

  const set = (patch: Record<string, unknown>) => setDraft((d: any) => ({ ...d, ...patch }));
  const setBehavior = (patch: Partial<AgentBehavior>) =>
    setDraft((d: any) => ({ ...d, behavior: { ...d.behavior, ...patch } }));
  const setCap = (key: keyof AgentCapabilities, v: boolean) =>
    setDraft((d: any) => ({ ...d, capabilities: { ...d.capabilities, [key]: v } }));

  const handleSave = async () => {
    if (!draft.name?.trim()) return;
    const {
      created_at, updated_at, created_by, updated_by, current_version, ...payload
    } = draft;
    await save.mutateAsync(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? 'Visualizar agente' : agent ? 'Editar agente' : 'Novo agente'}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="comportamento">Comportamento do agente</TabsTrigger>
            <TabsTrigger value="capacidades">Capacidades</TabsTrigger>
            <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
            {agent && <TabsTrigger value="versoes">Versões</TabsTrigger>}
          </TabsList>

          <TabsContent value="geral" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do agente *</Label>
                <Input disabled={readOnly} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select disabled={readOnly} value={draft.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RASCUNHO">Rascunho</SelectItem>
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                disabled={readOnly}
                value={draft.description || ''}
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Provedor do modelo</Label>
                <Select disabled={readOnly} value={draft.provider} onValueChange={(v) => set({ provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini (Google)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="lovable">Lovable AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Input disabled={readOnly} value={draft.model} onChange={(e) => set({ model: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Temperatura</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={draft.temperature}
                  onChange={(e) => set({ temperature: e.target.value.replace(',', '.') })}
                  onBlur={(e) => set({ temperature: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Limite de tokens</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  disabled={readOnly}
                  value={draft.max_tokens}
                  onChange={(e) => set({ max_tokens: e.target.value.replace(/\D/g, '') })}
                  onBlur={(e) => set({ max_tokens: Number(e.target.value) || 1024 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Idioma padrão</Label>
                <Select
                  disabled={readOnly}
                  value={draft.default_language}
                  onValueChange={(v) => set({ default_language: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                    <SelectItem value="en">Inglês</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prompt base</Label>
              <Textarea rows={5} disabled={readOnly} value={draft.prompt_base} onChange={(e) => set({ prompt_base: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Prompt de comportamento</Label>
              <Textarea rows={4} disabled={readOnly} value={draft.prompt_behavior} onChange={(e) => set({ prompt_behavior: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mensagem de fallback</Label>
                <Textarea rows={2} disabled={readOnly} value={draft.fallback_message} onChange={(e) => set({ fallback_message: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Mensagem de encaminhamento para humano</Label>
                <Textarea rows={2} disabled={readOnly} value={draft.handoff_message} onChange={(e) => set({ handoff_message: e.target.value })} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comportamento" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Personalidade</Label>
                <Select
                  disabled={readOnly}
                  value={draft.behavior.personality}
                  onValueChange={(v) => setBehavior({ personality: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERSONALITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tom de voz</Label>
                <Input disabled={readOnly} value={draft.behavior.tone} onChange={(e) => setBehavior({ tone: e.target.value })} />
              </div>
            </div>

            <ListField
              label="Idiomas permitidos"
              value={draft.behavior.allowed_languages}
              disabled={readOnly}
              onChange={(v) => setBehavior({ allowed_languages: v })}
              placeholder="pt&#10;es&#10;en"
            />
            <ListField label="Regras obrigatórias" value={draft.behavior.required_rules} disabled={readOnly} onChange={(v) => setBehavior({ required_rules: v })} />
            <ListField label="Regras proibidas" value={draft.behavior.forbidden_rules} disabled={readOnly} onChange={(v) => setBehavior({ forbidden_rules: v })} />
            <ListField label="Informações que o agente nunca pode fornecer" value={draft.behavior.forbidden_information} disabled={readOnly} onChange={(v) => setBehavior({ forbidden_information: v })} />

            <div className="space-y-2">
              <Label>Comportamento quando não souber responder</Label>
              <Textarea rows={2} disabled={readOnly} value={draft.behavior.on_unknown} onChange={(e) => setBehavior({ on_unknown: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Comportamento quando o cliente fugir do assunto</Label>
              <Textarea rows={2} disabled={readOnly} value={draft.behavior.on_off_topic} onChange={(e) => setBehavior({ on_off_topic: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Comportamento para encaminhamento ao humano</Label>
              <Textarea rows={2} disabled={readOnly} value={draft.behavior.on_handoff} onChange={(e) => setBehavior({ on_handoff: e.target.value })} />
            </div>
          </TabsContent>

          <TabsContent value="capacidades" className="space-y-3">
            {CAP_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-md border p-3">
                <Label className="font-normal">{label}</Label>
                <Switch
                  disabled={readOnly}
                  checked={!!draft.capabilities[key]}
                  onCheckedChange={(v) => setCap(key, v)}
                />
              </div>
            ))}
          </TabsContent>

          <TabsContent value="fluxo" className="space-y-3">
            <div className="space-y-2">
              <Label>Fluxo de atendimento utilizado</Label>
              <Select
                disabled={readOnly}
                value={draft.flow_id ?? 'none'}
                onValueChange={(v) => set({ flow_id: v === 'none' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(flows || []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O fluxo é uma entidade separada. Vários agentes podem usar o mesmo fluxo — ele nunca é duplicado.
              </p>
            </div>
          </TabsContent>

          {agent && (
            <TabsContent value="versoes" className="space-y-2">
              {(versions || []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
              )}
              {(versions || []).map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Versão {v.version_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('pt-BR')} · {v.notes || '—'}
                    </p>
                  </div>
                  <Badge variant="outline">{v.status}</Badge>
                </div>
              ))}
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? 'Fechar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button onClick={handleSave} disabled={save.isPending || !draft.name?.trim()}>
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
