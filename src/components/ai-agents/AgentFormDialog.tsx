import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { useAgentFlows, useAgentVersions, useSaveAgent } from '@/hooks/useAIAgents';
import { AgentTextsEditor } from '@/components/ai-agents/AgentTextsEditor';
import { ModelSelect } from '@/components/ai-agents/ModelSelect';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import { PromptBlocksEditor } from '@/components/ai-agents/PromptBlocksEditor';
import {
  composePromptFromBlocks,
  normalizeBlocks,
  type PromptBlock,
} from '@/lib/agent-prompt-blocks';
import {
  AGENT_LANGUAGES,
  AIAgent,
  DEFAULT_BEHAVIOR,
  DEFAULT_CAPABILITIES,
  PERSONALITIES,
  TONE_OPTIONS,
  type AgentBehavior,
  type AgentCapabilities,
  type AgentProvider,
  type MultiLangText,
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
  default_language: 'pt-BR',
  prompt_base: '',
  prompt_behavior: '',
  fallback_message: '',
  handoff_message: '',
  flow_id: null as string | null,
  pre_handoff_flow_id: null as string | null,
  handoff_flow_id: null as string | null,
  handoff_released: true,
  handoff_hold_message: {} as Record<string, string>,
  capabilities: { ...DEFAULT_CAPABILITIES },
  behavior: { ...DEFAULT_BEHAVIOR },
  is_production: false,
  prompt_flow: '',
  model_cascade: [] as { provider: string; model: string }[],
  runtime_config: {} as Record<string, unknown>,
});

const CAP_LABELS: { key: keyof AgentCapabilities; label: string }[] = [
  { key: 'answer_questions', label: 'Responder perguntas' },
  { key: 'use_knowledge_base', label: 'Consultar a base de conhecimento' },
  { key: 'use_rag', label: 'Utilizar RAG' },
  { key: 'ask_questions', label: 'Fazer perguntas ao cliente' },
  { key: 'run_structured_flow', label: 'Executar o fluxo estruturado' },
  { key: 'handoff_to_human', label: 'Encaminhar para atendimento humano' },
];

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LabelWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label>{label}</Label>
      <InfoTip text={tip} />
    </div>
  );
}

function ListField({
  label,
  tip,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  tip?: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      {tip ? <LabelWithTip label={label} tip={tip} /> : <Label>{label}</Label>}
      <Textarea
        rows={3}
        disabled={disabled}
        placeholder={placeholder || 'Uma por linha'}
        value={(value || []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
      />
    </div>
  );
}

export function AgentFormDialog({ open, onOpenChange, agent, readOnly }: Props) {
  const [draft, setDraft] = useState<any>(emptyDraft());
  const [blocks, setBlocks] = useState<PromptBlock[]>([]);
  const { data: flows } = useAgentFlows();
  const { data: versions } = useAgentVersions(agent?.id);
  const save = useSaveAgent();

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setDraft({
        ...agent,
        default_language: agent.default_language === 'pt' ? 'pt-BR' : agent.default_language,
        capabilities: { ...DEFAULT_CAPABILITIES, ...(agent.capabilities || {}) },
        behavior: { ...DEFAULT_BEHAVIOR, ...(agent.behavior || {}) },
        prompt_flow: agent.prompt_flow || '',
        pre_handoff_flow_id: agent.pre_handoff_flow_id ?? null,
        handoff_flow_id: agent.handoff_flow_id ?? null,
        handoff_released: (agent as any).handoff_released !== false,
        handoff_hold_message: ((agent as any).handoff_hold_message || {}) as Record<string, string>,
        model_cascade: Array.isArray(agent.model_cascade) ? agent.model_cascade : [],
        runtime_config: agent.runtime_config || {},
      });
      setBlocks(normalizeBlocks(agent.prompt_blocks, agent.prompt_flow || ''));
    } else {
      setDraft(emptyDraft());
      setBlocks([]);
    }
  }, [open, agent]);

  const set = (patch: Record<string, unknown>) => setDraft((d: any) => ({ ...d, ...patch }));
  const setBehavior = (patch: Partial<AgentBehavior>) =>
    setDraft((d: any) => ({ ...d, behavior: { ...d.behavior, ...patch } }));
  const setRuntime = (patch: Record<string, unknown>) =>
    setDraft((d: any) => ({ ...d, runtime_config: { ...(d.runtime_config || {}), ...patch } }));
  const setCascade = (index: number, patch: Record<string, string>) =>
    setDraft((d: any) => ({
      ...d,
      model_cascade: (d.model_cascade || []).map((it: any, i: number) => (i === index ? { ...it, ...patch } : it)),
    }));
  const addCascade = () =>
    setDraft((d: any) => ({ ...d, model_cascade: [...(d.model_cascade || []), { provider: 'gemini', model: '' }] }));
  const removeCascade = (index: number) =>
    setDraft((d: any) => ({ ...d, model_cascade: (d.model_cascade || []).filter((_: any, i: number) => i !== index) }));
  const setCap = (key: keyof AgentCapabilities, v: boolean) =>
    setDraft((d: any) => ({ ...d, capabilities: { ...d.capabilities, [key]: v } }));

  /** Lê um texto multi-idioma, migrando o valor antigo (texto simples) para pt-BR. */
  const ml = (key: 'on_unknown' | 'on_off_topic' | 'on_handoff'): MultiLangText => {
    const stored = draft.behavior?.i18n?.[key];
    if (stored && typeof stored === 'object') return stored;
    return draft.behavior?.[key] ? { 'pt-BR': draft.behavior[key] } : {};
  };
  const setMl = (key: 'on_unknown' | 'on_off_topic' | 'on_handoff', value: MultiLangText) =>
    setDraft((d: any) => ({
      ...d,
      behavior: {
        ...d.behavior,
        [key]: value['pt-BR'] || '',
        i18n: { ...(d.behavior?.i18n || {}), [key]: value },
      },
    }));

  const mlTop = (key: 'fallback_message' | 'handoff_message'): MultiLangText => {
    const stored = draft.behavior?.i18n?.[key];
    if (stored && typeof stored === 'object') return stored;
    return draft[key] ? { 'pt-BR': draft[key] } : {};
  };
  const setMlTop = (key: 'fallback_message' | 'handoff_message', value: MultiLangText) =>
    setDraft((d: any) => ({
      ...d,
      [key]: value['pt-BR'] || '',
      behavior: { ...d.behavior, i18n: { ...(d.behavior?.i18n || {}), [key]: value } },
    }));

  const toggleLanguage = (code: string, checked: boolean) => {
    const current: string[] = draft.behavior?.allowed_languages || [];
    setBehavior({
      allowed_languages: checked ? [...new Set([...current, code])] : current.filter((c) => c !== code),
    });
  };

  const composedPrompt = useMemo(() => composePromptFromBlocks(blocks), [blocks]);

  const flowsByPhase = (phase: string) =>
    (flows || []).filter((f: any) => (f.phase || 'GERAL') === phase || (f.phase || 'GERAL') === 'GERAL');

  const handleSave = async () => {
    if (!draft.name?.trim()) return;
    const {
      created_at, updated_at, created_by, updated_by, current_version, ...payload
    } = draft;
    payload.model_cascade = (payload.model_cascade || []).filter(
      (i: any) => i && i.provider && String(i.model || '').trim(),
    );
    payload.behavior = {
      ...payload.behavior,
      required_rules: (payload.behavior?.required_rules || []).filter((s: string) => s.trim()),
      forbidden_rules: (payload.behavior?.forbidden_rules || []).filter((s: string) => s.trim()),
      forbidden_information: (payload.behavior?.forbidden_information || []).filter((s: string) => s.trim()),
    };
    if (blocks.length > 0) {
      payload.prompt_blocks = blocks;
      payload.prompt_flow = composePromptFromBlocks(blocks);
    }
    await save.mutateAsync(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-6 overflow-y-auto">
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
            <TabsTrigger value="producao">Produção</TabsTrigger>
            {agent && <TabsTrigger value="textos">Textos do roteiro</TabsTrigger>}
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
              <div className="sm:col-span-2">
                <ModelSelect
                  provider={draft.provider}
                  model={draft.model}
                  disabled={readOnly}
                  onChange={(provider: AgentProvider, model: string) => set({ provider, model })}
                />
              </div>
              <div className="space-y-2">
                <LabelWithTip
                  label="Temperatura"
                  tip="Controla o quanto o agente varia as respostas. Perto de 0 ele fica previsível e repetitivo (bom para respostas exatas). Perto de 1 fica mais criativo e natural, com maior risco de sair do roteiro. Recomendado: 0,5 a 0,8."
                />
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
                <LabelWithTip
                  label="Limite de tokens"
                  tip="Tamanho máximo da resposta do agente. Tokens são pedaços de palavras — 1024 tokens equivalem a cerca de 700 palavras."
                />
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
                <LabelWithTip
                  label="Idioma base"
                  tip="Idioma em que os textos são escritos e a partir do qual as traduções automáticas são geradas. O agente sempre responde no idioma do cliente."
                />
                <Select
                  disabled={readOnly}
                  value={draft.default_language}
                  onValueChange={(v) => set({ default_language: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGENT_LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <LabelWithTip
                label="Prompt base (diretrizes da empresa)"
                tip="Instruções gerais somadas ao roteiro. Use para regras internas da CB Asesoria."
              />
              <Textarea rows={5} disabled={readOnly} value={draft.prompt_base} onChange={(e) => set({ prompt_base: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Prompt de comportamento</Label>
              <Textarea rows={4} disabled={readOnly} value={draft.prompt_behavior} onChange={(e) => set({ prompt_behavior: e.target.value })} />
            </div>

            <MultiLangField
              label="Mensagem de fallback"
              hint="Enviada quando o agente não consegue responder."
              disabled={readOnly}
              value={mlTop('fallback_message')}
              onChange={(v) => setMlTop('fallback_message', v)}
              rows={2}
            />
            <MultiLangField
              label="Mensagem de encaminhamento para humano"
              hint="Enviada no momento do handoff para um atendente."
              disabled={readOnly}
              value={mlTop('handoff_message')}
              onChange={(v) => setMlTop('handoff_message', v)}
              rows={2}
            />

            {blocks.some((b) => b.tab === 'geral') && (
              <div className="space-y-2 pt-2 border-t">
                <LabelWithTip
                  label="Blocos do prompt — identidade e conhecimento"
                  tip="Partes do prompt do fluxo classificadas nesta aba. Ao salvar, os blocos são remontados no prompt final."
                />
                <PromptBlocksEditor blocks={blocks} onChange={setBlocks} filterTab="geral" disabled={readOnly} />
              </div>
            )}
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
                <LabelWithTip
                  label="Tom de voz"
                  tip="Define como o agente fala com o cliente. Aplica-se automaticamente a todos os idiomas."
                />
                <Select
                  disabled={readOnly}
                  value={draft.behavior.tone || 'CORDIAL_ACOLHEDOR'}
                  onValueChange={(v) => setBehavior({ tone: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {draft.behavior.tone === 'PERSONALIZADO' && (
              <div className="space-y-2">
                <Label>Descreva o tom desejado</Label>
                <Textarea
                  rows={2}
                  disabled={readOnly}
                  value={draft.behavior.tone_custom || ''}
                  onChange={(e) => setBehavior({ tone_custom: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <LabelWithTip
                label="Idiomas atendidos"
                tip="O agente detecta o idioma do cliente e responde nele. Todos os textos configurados aqui têm versão para cada idioma marcado."
              />
              <div className="flex flex-wrap gap-4 rounded-md border p-3">
                {AGENT_LANGUAGES.map((l) => (
                  <label key={l.code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={readOnly}
                      checked={(draft.behavior.allowed_languages || []).includes(l.code)}
                      onCheckedChange={(v) => toggleLanguage(l.code, !!v)}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>

            <ListField
              label="Regras obrigatórias"
              tip="Regras que o agente deve seguir sempre. Valem para todos os idiomas."
              value={draft.behavior.required_rules}
              disabled={readOnly}
              onChange={(v) => setBehavior({ required_rules: v })}
            />
            <ListField label="Regras proibidas" value={draft.behavior.forbidden_rules} disabled={readOnly} onChange={(v) => setBehavior({ forbidden_rules: v })} />
            <ListField label="Informações que o agente nunca pode fornecer" value={draft.behavior.forbidden_information} disabled={readOnly} onChange={(v) => setBehavior({ forbidden_information: v })} />

            <MultiLangField
              label="Quando não souber responder"
              disabled={readOnly}
              value={ml('on_unknown')}
              onChange={(v) => setMl('on_unknown', v)}
              rows={2}
            />
            <MultiLangField
              label="Quando o cliente fugir do assunto"
              disabled={readOnly}
              value={ml('on_off_topic')}
              onChange={(v) => setMl('on_off_topic', v)}
              rows={2}
            />
            <MultiLangField
              label="Ao encaminhar para um atendente"
              disabled={readOnly}
              value={ml('on_handoff')}
              onChange={(v) => setMl('on_handoff', v)}
              rows={2}
            />

            {blocks.some((b) => b.tab === 'comportamento') && (
              <div className="space-y-2 pt-2 border-t">
                <LabelWithTip
                  label="Blocos do prompt — idioma, personalidade e regras"
                  tip="Partes do prompt do fluxo classificadas nesta aba."
                />
                <PromptBlocksEditor blocks={blocks} onChange={setBlocks} filterTab="comportamento" disabled={readOnly} />
              </div>
            )}
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

          <TabsContent value="fluxo" className="space-y-4">
            <p className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Quando um fluxo visual está selecionado abaixo, ele tem prioridade: o atendimento segue
              exatamente as etapas, validações e ramificações do fluxo, ignorando o roteiro automático
              anterior. A IA só volta a conduzir a conversa depois que o fluxo termina.
            </p>
            <div className="space-y-2">

              <LabelWithTip
                label="Fluxo de pré-handoff"
                tip="Etapas que o agente executa sozinho, coletando informações antes de encaminhar para um atendente."
              />
              <Select
                disabled={readOnly}
                value={draft.pre_handoff_flow_id ?? 'none'}
                onValueChange={(v) => set({ pre_handoff_flow_id: v === 'none' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {flowsByPhase('PRE_HANDOFF').map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(flows || []).some(
                (f: any) => f.id === draft.pre_handoff_flow_id && f.status === 'RASCUNHO',
              ) && (
                <p className="rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Este fluxo está como <strong>rascunho</strong>, mas será executado normalmente no
                  atendimento real enquanto estiver selecionado aqui.
                </p>
              )}
            </div>


            <div className="space-y-2">
              <LabelWithTip
                label="Fluxo de handoff"
                tip="Etapas do momento do encaminhamento para o atendente humano e do que acontece depois."
              />
              <Select
                disabled={readOnly}
                value={draft.handoff_flow_id ?? 'none'}
                onValueChange={(v) => set({ handoff_flow_id: v === 'none' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {flowsByPhase('HANDOFF').map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <LabelWithTip
                    label="Handoff liberado"
                    tip="Ligado: depois do pré-handoff o agente continua respondendo dúvidas com a base de conhecimento. Desligado: o agente não consulta a base e repete sempre a mensagem de espera abaixo, até um atendente humano assumir."
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.handoff_released === false
                      ? 'Desligado: o agente repete a mensagem de espera após o pré-handoff.'
                      : 'Ligado: o agente responde pela base de conhecimento após o pré-handoff.'}
                  </p>
                </div>
                <Switch
                  disabled={readOnly}
                  checked={draft.handoff_released !== false}
                  onCheckedChange={(v) => set({ handoff_released: v })}
                />
              </div>

              {draft.handoff_released === false && (
                <MultiLangField
                  label="Mensagem de espera"
                  hint="Repetida a cada mensagem do cliente enquanto o handoff não estiver liberado."
                  disabled={readOnly}
                  value={(draft.handoff_hold_message || {}) as MultiLangText}
                  onChange={(v) => set({ handoff_hold_message: v })}
                  rows={2}
                />
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Os fluxos são entidades separadas e podem ser reaproveitados por vários agentes — nunca são
              duplicados. Crie e edite as etapas na aba "Fluxos de atendimento".
            </p>

            {blocks.some((b) => b.tab === 'fluxo') && (
              <div className="space-y-2 pt-2 border-t">
                <LabelWithTip
                  label="Blocos do prompt — objetivo e etapas"
                  tip="Partes do prompt do fluxo classificadas nesta aba."
                />
                <PromptBlocksEditor blocks={blocks} onChange={setBlocks} filterTab="fluxo" disabled={readOnly} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="producao" className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="font-normal">Este é o agente em produção (WhatsApp)</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o atendimento real passa a usar o prompt, os textos e a cascata deste agente.
                </p>
              </div>
              <Switch
                disabled={readOnly}
                checked={!!draft.is_production}
                onCheckedChange={(v) => set({ is_production: v })}
              />
            </div>

            <div className="space-y-2">
              <LabelWithTip
                label="Blocos do prompt do fluxo"
                tip="O prompt de produção é dividido em blocos. Cada bloco pode ser editado aqui ou na aba correspondente (Geral, Comportamento, Fluxo)."
              />
              <PromptBlocksEditor
                blocks={blocks}
                onChange={setBlocks}
                disabled={readOnly}
                allowStructureEdit={!readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Placeholders disponíveis: {'{{LANGUAGE_DIRECTIVE}}'}, {'{{CONTACT_NAME_BLOCK}}'},
                {' '}{'{{SERVICES_BLOCK}}'}, {'{{KB_BLOCK}}'}, {'{{TODAY}}'}.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Prompt final que será executado</Label>
              <Textarea
                rows={10}
                readOnly
                className="font-mono text-xs bg-muted"
                value={composedPrompt || draft.prompt_flow || ''}
              />
              <p className="text-xs text-muted-foreground">
                Somente leitura — resultado da junção dos blocos acima. Sem blocos, o sistema mantém o prompt padrão.
              </p>
            </div>

            <div className="space-y-2">
              <LabelWithTip
                label="Cascata de modelos"
                tip="Ordem de tentativa: se o primeiro modelo falhar, o próximo assume. Vazio = usa a cascata de Configurações → LLM."
              />
              {(draft.model_cascade || []).map((item: any, idx: number) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <ModelSelect
                      label={`Modelo ${idx + 1}`}
                      provider={item.provider}
                      model={item.model}
                      disabled={readOnly}
                      onChange={(provider, model) => setCascade(idx, { provider, model })}
                    />
                  </div>
                  {!readOnly && (
                    <Button variant="ghost" size="sm" className="mb-6" onClick={() => removeCascade(idx)}>
                      Remover
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={addCascade}>Adicionar modelo</Button>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="font-normal">Bot do WhatsApp ativo</Label>
                <Switch
                  disabled={readOnly}
                  checked={draft.runtime_config?.whatsapp_bot_enabled !== false}
                  onCheckedChange={(v) => setRuntime({ whatsapp_bot_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-1.5">
                  <Label className="font-normal">Modo estrito da base de conhecimento</Label>
                  <InfoTip text="Quando ligado, o agente só responde com informações que existam na base de conhecimento." />
                </div>
                <Switch
                  disabled={readOnly}
                  checked={!!draft.runtime_config?.kb_strict_mode}
                  onCheckedChange={(v) => setRuntime({ kb_strict_mode: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem quando a base não tem a resposta</Label>
                <Textarea
                  rows={2}
                  disabled={readOnly}
                  value={(draft.runtime_config?.kb_strict_fallback_message as string) || ''}
                  onChange={(e) => setRuntime({ kb_strict_fallback_message: e.target.value })}
                />
              </div>
            </div>
          </TabsContent>

          {agent && (
            <TabsContent value="textos">
              <AgentTextsEditor agentId={agent.id} readOnly={readOnly} />
            </TabsContent>
          )}

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
