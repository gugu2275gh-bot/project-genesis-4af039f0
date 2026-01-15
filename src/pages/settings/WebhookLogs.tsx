import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Webhook, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Search,
  RefreshCw,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WebhookLog {
  id: string;
  source: string;
  raw_payload: any;
  processed: boolean;
  created_at: string;
}

interface FailedWebhookLog {
  id: number;
  lead_id: string | null;
  phone_id: string | null;
  trigger_op: string | null;
  payload_sent: any;
  error_message: string | null;
  created_at: string;
}

export default function WebhookLogs() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const { data: webhookLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['webhook-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as WebhookLog[];
    },
  });

  const { data: failedLogs = [], isLoading: failedLoading, refetch: refetchFailed } = useQuery({
    queryKey: ['failed-webhook-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('log_webhooks_falhados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as FailedWebhookLog[];
    },
  });

  const filteredLogs = webhookLogs.filter(log => {
    const matchesSearch = 
      log.source.toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.raw_payload).toLowerCase().includes(search.toLowerCase());
    
    if (activeTab === 'processed') return matchesSearch && log.processed;
    if (activeTab === 'pending') return matchesSearch && !log.processed;
    return matchesSearch;
  });

  const filteredFailedLogs = failedLogs.filter(log =>
    log.error_message?.toLowerCase().includes(search.toLowerCase()) ||
    log.trigger_op?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRefresh = () => {
    refetchLogs();
    refetchFailed();
  };

  const isLoading = logsLoading || failedLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs de Webhook"
        description="Monitore os webhooks recebidos e identifique falhas"
        actions={
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Webhook className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{webhookLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Processados</p>
                <p className="text-2xl font-bold">
                  {webhookLogs.filter(l => l.processed).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold">
                  {webhookLogs.filter(l => !l.processed).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Falhas</p>
                <p className="text-2xl font-bold">{failedLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="processed">Processados</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="failed">Falhas</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Webhook className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum log encontrado</p>
              </CardContent>
            </Card>
          ) : (
            filteredLogs.map(log => (
              <WebhookLogCard key={log.id} log={log} />
            ))
          )}
        </TabsContent>

        <TabsContent value="processed" className="space-y-4">
          {filteredLogs.filter(l => l.processed).map(log => (
            <WebhookLogCard key={log.id} log={log} />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {filteredLogs.filter(l => !l.processed).map(log => (
            <WebhookLogCard key={log.id} log={log} />
          ))}
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          {failedLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : filteredFailedLogs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                <p className="text-muted-foreground">Nenhuma falha registrada</p>
              </CardContent>
            </Card>
          ) : (
            filteredFailedLogs.map(log => (
              <FailedWebhookLogCard key={log.id} log={log} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WebhookLogCard({ log }: { log: WebhookLog }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${log.processed ? 'bg-success/10' : 'bg-warning/10'}`}>
              {log.processed ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <Clock className="h-4 w-4 text-warning" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{log.source}</span>
                <Badge variant={log.processed ? 'default' : 'secondary'}>
                  {log.processed ? 'Processado' : 'Pendente'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Ocultar' : 'Ver payload'}
          </Button>
        </div>
        
        {expanded && (
          <pre className="mt-4 p-4 rounded-lg bg-muted text-xs overflow-x-auto">
            {JSON.stringify(log.raw_payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function FailedWebhookLogCard({ log }: { log: FailedWebhookLog }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card className="border-destructive/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{log.trigger_op || 'Operação desconhecida'}</span>
                <Badge variant="destructive">Falha</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              </p>
              {log.error_message && (
                <p className="text-sm text-destructive mt-1">{log.error_message}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Ocultar' : 'Ver detalhes'}
          </Button>
        </div>
        
        {expanded && log.payload_sent && (
          <pre className="mt-4 p-4 rounded-lg bg-muted text-xs overflow-x-auto">
            {JSON.stringify(log.payload_sent, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
