import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Brain, Save, KeyRound, ExternalLink, Plus, Trash2, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Loader2, Activity, RefreshCw,
} from 'lucide-react';

type Provider = 'gemini' | 'openai';
interface CascadeItem { provider: Provider; model: string; enabled: boolean; }
interface LLMSettingsRow {
  id: string;
  gemini_enabled: boolean;
  openai_enabled: boolean;
  cascade: CascadeItem[];
  updated_at: string;
}
interface ModelInfo { id: string; displayName: string; description?: string }

const SUPABASE_PROJECT_REF = 'xdnliyuogkoxckbesktx';
const SECRETS_URL = `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/settings/functions`;

export default function LLMSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LLMSettingsRow | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency_ms: number; error?: string }>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['llm_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_settings' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as LLMSettingsRow;
    },
  });

  const { data: keyStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['llm_key_status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('llm-config', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data as { gemini_key_present: boolean; openai_key_present: boolean };
    },
  });

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (payload: LLMSettingsRow) => {
      const { error } = await supabase
        .from('llm_settings' as any)
        .update({
          gemini_enabled: payload.gemini_enabled,
          openai_enabled: payload.openai_enabled,
          cascade: payload.cascade as any,
        })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Configuração salva', description: 'A cascata será aplicada nas próximas mensagens.' });
      queryClient.invalidateQueries({ queryKey: ['llm_settings'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' }),
  });

  const handleTest = async (item: CascadeItem) => {
    const key = `${item.provider}/${item.model}`;
    setTesting(t => ({ ...t, [key]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('llm-config', {
        body: { action: 'test', provider: item.provider, model: item.model },
      });
      if (error) throw error;
      setTestResults(r => ({ ...r, [key]: data as any }));
    } catch (e: any) {
      setTestResults(r => ({ ...r, [key]: { ok: false, latency_ms: 0, error: e.message } }));
    } finally {
      setTesting(t => ({ ...t, [key]: false }));
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    if (!draft) return;
    const next = [...draft.cascade];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraft({ ...draft, cascade: next });
  };

  const toggleItem = (idx: number, enabled: boolean) => {
    if (!draft) return;
    const next = [...draft.cascade];
    next[idx] = { ...next[idx], enabled };
    setDraft({ ...draft, cascade: next });
  };

  const removeItem = (idx: number) => {
    if (!draft) return;
    setDraft({ ...draft, cascade: draft.cascade.filter((_, i) => i !== idx) });
  };

  const addItem = (provider: Provider, model: string) => {
    if (!draft || !model) return;
    if (draft.cascade.some(c => c.provider === provider && c.model === model)) {
      toast({ title: 'Já adicionado', description: `${provider}/${model} já está na cascata.`, variant: 'destructive' });
      return;
    }
    setDraft({ ...draft, cascade: [...draft.cascade, { provider, model, enabled: true }] });
  };

  if (isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-semibold">Ajuste de LLM</h2>
          <p className="text-sm text-muted-foreground">Configure provedores, modelos e ordem da cascata usada pelo agente WhatsApp.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Chaves de API</CardTitle>
          <CardDescription>As chaves são armazenadas como secrets do Supabase. Aqui apenas o status é exibido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <KeyRow
            label="Google Gemini (CBAsesoria_Key)"
            present={!!keyStatus?.gemini_key_present}
          />
          <KeyRow
            label="OpenAI (OPENAI_API_KEY)"
            present={!!keyStatus?.openai_key_present}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
              Atualizar status
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={SECRETS_URL} target="_blank" rel="noreferrer">
                Gerenciar chaves no Supabase <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provedores</CardTitle>
          <CardDescription>Desligue um provedor inteiro para teste controlado sem alterar a cascata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base">Google Gemini</Label>
            <Switch
              checked={draft.gemini_enabled}
              onCheckedChange={(v) => setDraft({ ...draft, gemini_enabled: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-base">OpenAI</Label>
            <Switch
              checked={draft.openai_enabled}
              onCheckedChange={(v) => setDraft({ ...draft, openai_enabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cascata de modelos</CardTitle>
          <CardDescription>O agente tenta cada modelo nesta ordem. Modelos desabilitados são pulados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.cascade.map((item, idx) => {
            const key = `${item.provider}/${item.model}`;
            const result = testResults[key];
            return (
              <div key={key} className="flex items-center gap-2 border rounded-md p-3">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 1)} disabled={idx === draft.cascade.length - 1}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <Badge variant={item.provider === 'gemini' ? 'default' : 'secondary'} className="uppercase">
                  {item.provider}
                </Badge>
                <span className="font-mono text-sm flex-1">{item.model}</span>
                {result && (
                  <span className={`text-xs flex items-center gap-1 ${result.ok ? 'text-green-600' : 'text-destructive'}`}>
                    {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {result.ok ? `${result.latency_ms}ms` : (result.error || 'falha').slice(0, 40)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(item)}
                  disabled={!!testing[key]}
                >
                  {testing[key] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                  <span className="ml-1">Testar</span>
                </Button>
                <Switch
                  checked={item.enabled}
                  onCheckedChange={(v) => toggleItem(idx, v)}
                />
                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}

          <AddItemRow onAdd={addItem} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

function KeyRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      {present ? (
        <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Configurada</Badge>
      ) : (
        <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Não configurada</Badge>
      )}
    </div>
  );
}

function AddItemRow({ onAdd }: { onAdd: (provider: Provider, model: string) => void }) {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState<string>('');
  const options = provider === 'gemini' ? GEMINI_MODELS : OPENAI_MODELS;

  return (
    <div className="flex items-center gap-2 pt-3 border-t">
      <Select value={provider} onValueChange={(v) => { setProvider(v as Provider); setModel(''); }}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="gemini">Gemini</SelectItem>
          <SelectItem value="openai">OpenAI</SelectItem>
        </SelectContent>
      </Select>
      <Select value={model} onValueChange={setModel}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um modelo..." /></SelectTrigger>
        <SelectContent>
          {options.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={() => { if (model) { onAdd(provider, model); setModel(''); } }} disabled={!model}>
        <Plus className="h-4 w-4 mr-1" /> Adicionar
      </Button>
    </div>
  );
}
