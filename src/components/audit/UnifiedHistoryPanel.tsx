import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronRight, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { useReactivationLog } from '@/hooks/useReactivationLog';

interface UnifiedHistoryPanelProps {
  contactId: string;
  leadIds: string[];
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  STATUS_CHANGE: 'Mudança de status',
  DELETE: 'Exclusão',
  MERGE: 'Mesclagem de fichas',
  UPDATE: 'Atualização',
};

const ACTION_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  STATUS_CHANGE: 'secondary',
  DELETE: 'destructive',
  MERGE: 'outline',
  UPDATE: 'secondary',
};

const REACT_ACTION_LABELS: Record<string, string> = {
  direct_route: 'Roteamento Direto',
  ask_confirmation: 'Pediu Confirmação',
  ask_disambiguation: 'Desambiguação',
  new_subject: 'Novo Assunto',
  fallback_manual: 'Fallback Manual',
  insufficient_context: 'Contexto Insuficiente',
};

const CONFIRMATION_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  denied: 'Negado',
  no_response: 'Sem Resposta',
};

const CONFIRMATION_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  denied: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_response: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

function summarizeEntry(action: string, oldData: any, newData: any): string {
  if (action === 'STATUS_CHANGE' && oldData?.status && newData?.status) {
    return `${oldData.status} → ${newData.status}`;
  }
  if (action === 'CREATE') {
    if (newData?.contract_number) return `Contrato Nº ${newData.contract_number}`;
    if (newData?.amount != null) {
      const inst = newData.installment_number ? ` (parcela ${newData.installment_number})` : '';
      return `€ ${Number(newData.amount).toFixed(2)}${inst}`;
    }
    return 'Registro criado';
  }
  if (action === 'DELETE') {
    if (oldData?.contract_number) return `Contrato Nº ${oldData.contract_number} excluído`;
    if (oldData?.amount != null) return `Pagamento de € ${Number(oldData.amount).toFixed(2)} excluído`;
    return 'Registro excluído';
  }
  if (action === 'MERGE') {
    const src = oldData?.source_name || 'Origem';
    const moved = newData?.moved_leads ?? 0;
    return `Mesclado a partir de "${src}" — ${moved} serviço(s) movidos`;
  }
  return '';
}

function AuditList({ logs, loading }: { logs: any[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!logs || logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhum registro encontrado.
      </p>
    );
  }
  return (
    <ul className="space-y-3 max-h-96 overflow-y-auto">
      {logs.map(log => {
        const summary = summarizeEntry(log.action, log.old_data, log.new_data);
        return (
          <li key={log.id} className="flex gap-3 border-l-2 border-muted pl-3 py-1">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={ACTION_VARIANTS[log.action] || 'secondary'}>
                  {ACTION_LABELS[log.action] || log.action}
                </Badge>
                {summary && <span className="text-sm">{summary}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {log.user_full_name || (log.user_id ? 'Usuário' : 'Sistema')}
                </span>
                <span>
                  {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function UnifiedHistoryPanel({ contactId, leadIds }: UnifiedHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'ficha' | 'servicos'>('ficha');

  const { data: contactLogs, isLoading: loadingContact } = useAuditLogs({
    tableName: 'contacts',
    recordId: contactId,
    enabled: open && tab === 'ficha',
  });

  const { data: leadLogs, isLoading: loadingLeads } = useAuditLogs({
    tableName: 'leads',
    recordIds: leadIds,
    enabled: open && tab === 'servicos' && leadIds.length > 0,
  });

  

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="w-full justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex flex-col items-start gap-1">
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico e Logs
            </CardTitle>
            <CardDescription>
              Mesclagens e mudanças de status deste contato.
            </CardDescription>
          </div>
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <Tabs value={tab} onValueChange={v => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ficha">Ficha</TabsTrigger>
              <TabsTrigger value="servicos">Serviços</TabsTrigger>
            </TabsList>

            <TabsContent value="ficha" className="mt-4">
              <AuditList logs={contactLogs} loading={loadingContact} />
            </TabsContent>

            <TabsContent value="servicos" className="mt-4">
              <AuditList logs={leadLogs} loading={loadingLeads} />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
