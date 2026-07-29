import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, RotateCcw, Loader2, FlaskConical } from 'lucide-react';
import {
  useAIAgents,
  useAgentVersions,
  useAgentFlows,
  useCreateTestSession,
  useSendTestMessage,
  useTestMessages,
} from '@/hooks/useAIAgents';
import { CapturedFieldsCard } from './CapturedFieldsCard';


const LANG_LABELS: Record<string, string> = {
  'pt-BR': 'Português (BR)',
  es: 'Espanhol',
  en: 'Inglês',
  fr: 'Francês',
};

interface Props {
  initialAgentId?: string | null;
}


export function AgentSandbox({ initialAgentId }: Props) {
  const { data: agents } = useAIAgents();
  const [agentId, setAgentId] = useState<string>(initialAgentId || '');
  const [versionId, setVersionId] = useState<string>('current');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [captured, setCaptured] = useState<Record<string, string>>({});

  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: versions } = useAgentVersions(agentId || undefined);
  const { data: flows } = useAgentFlows();
  const { data: messages } = useTestMessages(sessionId || undefined);
  const createSession = useCreateTestSession();
  const send = useSendTestMessage();

  useEffect(() => {
    if (initialAgentId) setAgentId(initialAgentId);
  }, [initialAgentId]);

  useEffect(() => {
    setSessionId(null);
    setVersionId('current');
    setDetectedLang(null);
    setCaptured({});
  }, [agentId]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  const startSession = async () => {
    if (!agentId) return null;
    const session = await createSession.mutateAsync({
      agentId,
      versionId: versionId === 'current' ? null : versionId,
    });
    setSessionId(session.id);
    return session.id;
  };

  const handleSend = async () => {
    if (!input.trim() || !agentId) return;
    const id = sessionId || (await startSession());
    if (!id) return;
    const text = input;
    setInput('');
    const res = await send.mutateAsync({ sessionId: id, message: text });
    const lang = (res as any)?.flow?.lang;
    if (lang) setDetectedLang(lang);
    const fields = (res as any)?.flow?.captured;
    if (fields && typeof fields === 'object') {
      setCaptured((prev) => ({ ...prev, ...(fields as Record<string, string>) }));
    }
  };


  const agent = (agents || []).find((a) => a.id === agentId);
  const activeFlowId =
    (agent as any)?.pre_handoff_flow_id || (agent as any)?.flow_id || (agent as any)?.handoff_flow_id || null;
  const activeFlowName = activeFlowId
    ? (flows || []).find((f) => f.id === activeFlowId)?.name || 'fluxo não encontrado'
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" /> Sandbox de teste
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          O teste roda apenas dentro do painel. Nenhuma mensagem real é enviada pelo WhatsApp/Twilio.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Agente</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
              <SelectContent>
                {(agents || []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Versão</Label>
            <Select value={versionId} onValueChange={setVersionId} disabled={!agentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Configuração atual</SelectItem>
                {(versions || []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>Versão {v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>&nbsp;</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setSessionId(null); setDetectedLang(null); setCaptured({}); }}
                disabled={!agentId}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Novo teste
              </Button>
            </div>
          </div>
        </div>

        {agent && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{agent.provider}</Badge>
            <Badge variant="outline">{agent.model}</Badge>
            <Badge variant="outline">temp {agent.temperature}</Badge>
            <Badge variant="secondary">
              idioma: {detectedLang ? LANG_LABELS[detectedLang] || detectedLang : 'aguardando 1ª resposta'}
            </Badge>
            <Badge variant="secondary">
              fluxo: {activeFlowName || 'nenhum (modo livre)'}
            </Badge>
          </div>

        )}

        <div className="h-[380px] overflow-y-auto rounded-md border p-4 space-y-3 bg-muted/30">
          {(!messages || messages.length === 0) && (
            <p className="text-sm text-muted-foreground text-center pt-12">
              Envie uma mensagem para iniciar a conversa de teste.
            </p>
          )}
          {(messages || []).map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : m.role === 'system'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-background border'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && (m.model || m.latency_ms) && (
                  <div className="mt-1 text-[10px] opacity-60">
                    {m.model} · {m.latency_ms ?? 0}ms
                  </div>
                )}
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando resposta…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Digite uma mensagem de teste…"
            value={input}
            disabled={!agentId || send.isPending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={!agentId || !input.trim() || send.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <CapturedFieldsCard captured={captured} />

      </CardContent>
    </Card>
  );
}
