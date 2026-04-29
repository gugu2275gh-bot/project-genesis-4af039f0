import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronRight, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { Skeleton } from '@/components/ui/skeleton';

interface AuditHistoryPanelProps {
  tableName: 'contracts' | 'payments' | 'leads' | 'contacts';
  recordId?: string;
  recordIds?: string[];
  title?: string;
  description?: string;
  defaultOpen?: boolean;
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

export function AuditHistoryPanel({
  tableName,
  recordId,
  recordIds,
  title = 'Histórico de Alterações',
  description = 'Registro automático das ações realizadas neste item.',
  defaultOpen = false,
}: AuditHistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { data: logs, isLoading } = useAuditLogs({
    tableName,
    recordId,
    recordIds,
    enabled: open,
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
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum registro de alteração encontrado.
            </p>
          ) : (
            <ul className="space-y-3">
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
          )}
        </CardContent>
      )}
    </Card>
  );
}
