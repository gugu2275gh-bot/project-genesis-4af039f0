import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Archive, Download, MessageSquare, Tags } from 'lucide-react';
import {
  useConversationArchive,
  useConversationFields,
  useConversationSessions,
  type ArchivedConversation,
} from '@/hooks/useConversationArchive';

function fmt(dt: string) {
  try {
    return format(new Date(dt), 'dd/MM/yyyy HH:mm');
  } catch {
    return dt;
  }
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ConversationLogs() {
  const [session, setSession] = useState<'all' | number>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: sessions } = useConversationSessions();
  const { data: conversations, isLoading } = useConversationArchive({ session, search, from, to });

  const selected: ArchivedConversation | undefined = useMemo(
    () => conversations?.find((c) => c.key === selectedKey) || conversations?.[0],
    [conversations, selectedKey],
  );

  const { data: fields } = useConversationFields(selected?.session_seq, selected?.phone);

  const exportConversation = () => {
    if (!selected) return;
    const rows: string[][] = [['Data/Hora', 'Lado', 'Mensagem', 'Setor', 'Origem']];
    selected.messages.forEach((m) =>
      rows.push([
        fmt(m.created_at),
        m.direction === 'INBOUND' ? 'Cliente' : 'Agente',
        m.body || '',
        m.setor || '',
        m.origem || '',
      ]),
    );
    rows.push([]);
    rows.push(['Campo', 'Valor', 'Etapa', 'Capturado em']);
    (fields || []).forEach((f) =>
      rows.push([f.field_label || f.field_key, f.value_text || '', f.step_code || '', fmt(f.captured_at)]),
    );
    downloadCsv(`conversa-${selected.session_seq}-${selected.phone}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Logs de Conversas (auditoria de testes)
          </CardTitle>
          <CardDescription>
            Histórico permanente das conversas de WhatsApp e dos campos identificados pelo agente. Não é
            apagado pela limpeza de base — cada limpeza inicia uma nova rodada de testes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Rodada de testes</Label>
              <Select
                value={String(session)}
                onValueChange={(v) => setSession(v === 'all' ? 'all' : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(sessions || []).map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      Rodada {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buscar (nome, telefone, texto)</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Julio" />
            </div>
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Conversas ({conversations?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : (
              <ScrollArea className="h-[520px]">
                <div className="divide-y">
                  {(conversations || []).map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setSelectedKey(c.key)}
                      className={`w-full text-left p-3 hover:bg-muted/60 transition-colors ${
                        selected?.key === c.key ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{c.contact_name || c.phone}</span>
                        <Badge variant="outline">Rodada {c.session_seq}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{c.phone}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(c.started_at)} · {c.message_count} mensagens
                      </p>
                    </button>
                  ))}
                  {!conversations?.length && (
                    <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa arquivada.</p>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {selected ? selected.contact_name || selected.phone : 'Transcrição'}
              </CardTitle>
              {selected && (
                <CardDescription>
                  {selected.phone} · rodada {selected.session_seq}
                </CardDescription>
              )}
            </div>
            {selected && (
              <Button variant="outline" size="sm" onClick={exportConversation}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[340px] pr-3">
              <div className="space-y-3">
                {(selected?.messages || []).map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === 'INBOUND' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'INBOUND' ? 'bg-muted' : 'bg-primary/10'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {m.direction === 'INBOUND' ? 'Cliente' : 'Agente'} · {fmt(m.created_at)}
                        {m.setor ? ` · ${m.setor}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                {!selected && <p className="text-sm text-muted-foreground">Selecione uma conversa.</p>}
              </div>
            </ScrollArea>

            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium flex items-center gap-2 mb-2">
                <Tags className="h-4 w-4" />
                Campos identificados ({fields?.length || 0})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(fields || []).map((f) => (
                  <div key={f.id} className="text-xs rounded border p-2">
                    <p className="font-medium">{f.field_label || f.field_key}</p>
                    <p className="text-muted-foreground break-words">{f.value_text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {f.crm_target}
                      {f.step_code ? ` · etapa ${f.step_code}` : ''} · {fmt(f.captured_at)}
                    </p>
                  </div>
                ))}
                {!fields?.length && (
                  <p className="text-xs text-muted-foreground">Nenhum campo identificado nesta conversa.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
