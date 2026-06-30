import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronRight, User as UserIcon, CalendarPlus, CalendarCheck, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { Skeleton } from '@/components/ui/skeleton';
import { PAYMENT_STATUS_LABELS } from '@/types/database';

interface ContractPaymentLike {
  id: string;
  amount: number | null;
  currency?: string | null;
  status: string | null;
  installment_number?: number | null;
  created_at: string;
  paid_at?: string | null;
  contract_id?: string | null;
  beneficiary_contact?: { full_name?: string | null } | null;
}

interface ContractHistoryPanelProps {
  contractId: string;
  payments: ContractPaymentLike[];
  defaultOpen?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  STATUS_CHANGE: 'Mudança de status',
  DELETE: 'Exclusão',
  UPDATE: 'Atualização',
};

const ACTION_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  STATUS_CHANGE: 'secondary',
  DELETE: 'destructive',
  UPDATE: 'secondary',
};

const PAYMENT_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONFIRMADO: 'default',
  PENDENTE: 'secondary',
  ATRASADO: 'destructive',
  CANCELADO: 'outline',
};

function formatAmount(amount: number | null, currency?: string | null) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount);
}

type TimelineEntry = {
  key: string;
  ts: string;
  kind: 'contract' | 'payment_created' | 'payment_paid';
  render: () => JSX.Element;
};

export function ContractHistoryPanel({ contractId, payments, defaultOpen = true }: ContractHistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const { data: logs, isLoading } = useAuditLogs({
    tableName: 'contracts',
    recordId: contractId,
    enabled: open,
  });

  // Include all payments fetched for this contract (direct + via linked opportunities)
  const strictPayments = useMemo(() => payments || [], [payments]);

  const entries = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];

    (logs || []).forEach(log => {
      items.push({
        key: `log-${log.id}`,
        ts: log.created_at,
        kind: 'contract',
        render: () => {
          let summary = '';
          if (log.action === 'STATUS_CHANGE' && log.old_data?.status && log.new_data?.status) {
            summary = `${log.old_data.status} → ${log.new_data.status}`;
          } else if (log.action === 'CREATE' && log.new_data?.contract_number) {
            summary = `Contrato Nº ${log.new_data.contract_number}`;
          } else if (log.action === 'DELETE' && log.old_data?.contract_number) {
            summary = `Contrato Nº ${log.old_data.contract_number} excluído`;
          }
          return (
            <>
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
            </>
          );
        },
      });
    });

    strictPayments.forEach(p => {
      const status = p.status || 'PENDENTE';
      const headerLine = (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={PAYMENT_STATUS_VARIANTS[status] || 'secondary'} className="gap-1">
            <Receipt className="h-3 w-3" />
            {PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] || status}
          </Badge>
          <span className="text-sm font-medium">{formatAmount(p.amount, p.currency)}</span>
          {p.installment_number != null && (
            <span className="text-xs text-muted-foreground">Parcela {p.installment_number}</span>
          )}
          {p.beneficiary_contact?.full_name && (
            <span className="text-xs text-muted-foreground">• {p.beneficiary_contact.full_name}</span>
          )}
        </div>
      );

      items.push({
        key: `pay-create-${p.id}`,
        ts: p.created_at,
        kind: 'payment_created',
        render: () => (
          <>
            {headerLine}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarPlus className="h-3 w-3" />
                Pagamento preenchido em{' '}
                {format(new Date(p.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </>
        ),
      });

      if (p.paid_at) {
        items.push({
          key: `pay-paid-${p.id}`,
          ts: p.paid_at,
          kind: 'payment_paid',
          render: () => (
            <>
              {headerLine}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  Pagamento aprovado em{' '}
                  {format(new Date(p.paid_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </>
          ),
        });
      }
    });

    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [logs, strictPayments]);

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
              Histórico do Contrato
            </CardTitle>
            <CardDescription>
              Alterações do contrato e log de pagamentos (preenchimento e aprovação).
            </CardDescription>
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
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum registro encontrado.
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map(e => (
                <li key={e.key} className="flex gap-3 border-l-2 border-muted pl-3 py-1">
                  <div className="flex-1 space-y-1">{e.render()}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
