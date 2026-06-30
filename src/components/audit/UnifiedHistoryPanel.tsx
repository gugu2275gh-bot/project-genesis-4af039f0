import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronRight, User as UserIcon, CalendarPlus, CalendarCheck, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { supabase } from '@/integrations/supabase/client';
import { PAYMENT_STATUS_LABELS } from '@/types/database';

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

const PAYMENT_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONFIRMADO: 'default',
  PENDENTE: 'secondary',
  ATRASADO: 'destructive',
  CANCELADO: 'outline',
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

function formatAmount(amount: number | null, currency?: string | null) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount);
}

function PaymentLogList({ payments, loading }: { payments: any[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!payments || payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Nenhum pagamento encontrado.
      </p>
    );
  }
  const entries: { key: string; ts: string; node: JSX.Element }[] = [];
  payments.forEach(p => {
    const status = p.status || 'PENDENTE';
    const header = (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={PAYMENT_STATUS_VARIANTS[status] || 'secondary'} className="gap-1">
          <Receipt className="h-3 w-3" />
          {PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] || status}
        </Badge>
        <span className="text-sm font-medium">{formatAmount(p.amount, p.currency)}</span>
        {p.installment_number != null && (
          <span className="text-xs text-muted-foreground">Parcela {p.installment_number}</span>
        )}
        {p.contracts?.contract_number && (
          <span className="text-xs text-muted-foreground">• Contrato Nº {p.contracts.contract_number}</span>
        )}
      </div>
    );
    entries.push({
      key: `c-${p.id}`,
      ts: p.created_at,
      node: (
        <>
          {header}
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
      entries.push({
        key: `p-${p.id}`,
        ts: p.paid_at,
        node: (
          <>
            {header}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarCheck className="h-3 w-3" />
                Pagamento aprovado em{' '}
                {format(new Date(p.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
          </>
        ),
      });
    }
  });
  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return (
    <ul className="space-y-3 max-h-96 overflow-y-auto">
      {entries.map(e => (
        <li key={e.key} className="flex gap-3 border-l-2 border-muted pl-3 py-1">
          <div className="flex-1 space-y-1">{e.node}</div>
        </li>
      ))}
    </ul>
  );
}

export function UnifiedHistoryPanel({ contactId, leadIds }: UnifiedHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'ficha' | 'servicos' | 'contratos' | 'pagamentos'>('ficha');

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

  // Resolve contract IDs related to this contact (via opportunities, contract_leads, beneficiaries)
  const { data: contractIds = [], isLoading: loadingContractIds } = useQuery({
    queryKey: ['contact-contract-ids', contactId, leadIds],
    enabled: open && (tab === 'contratos' || tab === 'pagamentos'),
    queryFn: async () => {
      const ids = new Set<string>();
      if (leadIds.length > 0) {
        const [{ data: opps }, { data: cls }] = await Promise.all([
          supabase.from('opportunities').select('id').in('lead_id', leadIds),
          supabase.from('contract_leads').select('contract_id').in('lead_id', leadIds),
        ]);
        const oppIds = (opps || []).map(o => o.id);
        if (oppIds.length > 0) {
          const { data: cs } = await supabase
            .from('contracts')
            .select('id')
            .in('opportunity_id', oppIds);
          (cs || []).forEach(c => ids.add(c.id));
        }
        (cls || []).forEach(cl => cl.contract_id && ids.add(cl.contract_id));
      }
      const { data: cbs } = await supabase
        .from('contract_beneficiaries')
        .select('contract_id')
        .eq('contact_id', contactId);
      (cbs || []).forEach(cb => cb.contract_id && ids.add(cb.contract_id));
      return Array.from(ids);
    },
  });

  const { data: contractLogs, isLoading: loadingContracts } = useAuditLogs({
    tableName: 'contracts',
    recordIds: contractIds,
    enabled: open && tab === 'contratos' && contractIds.length > 0,
  });

  const { data: contactPayments, isLoading: loadingPayments } = useQuery({
    queryKey: ['contact-payments-log', contactId, contractIds],
    enabled: open && tab === 'pagamentos',
    queryFn: async () => {
      const orParts: string[] = [`beneficiary_contact_id.eq.${contactId}`];
      contractIds.forEach(cid => orParts.push(`contract_id.eq.${cid}`));
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, currency, status, installment_number, created_at, paid_at, contract_id, contracts:contract_id(contract_number)')
        .or(orParts.join(','))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
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
              Ficha, serviços, contratos e pagamentos deste contato.
            </CardDescription>
          </div>
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <Tabs value={tab} onValueChange={v => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="ficha">Ficha</TabsTrigger>
              <TabsTrigger value="servicos">Serviços</TabsTrigger>
              <TabsTrigger value="contratos">Contratos</TabsTrigger>
              <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            </TabsList>

            <TabsContent value="ficha" className="mt-4">
              <AuditList logs={contactLogs} loading={loadingContact} />
            </TabsContent>

            <TabsContent value="servicos" className="mt-4">
              <AuditList logs={leadLogs} loading={loadingLeads} />
            </TabsContent>

            <TabsContent value="contratos" className="mt-4">
              <AuditList logs={contractLogs} loading={loadingContractIds || loadingContracts} />
            </TabsContent>

            <TabsContent value="pagamentos" className="mt-4">
              <PaymentLogList payments={contactPayments} loading={loadingContractIds || loadingPayments} />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
