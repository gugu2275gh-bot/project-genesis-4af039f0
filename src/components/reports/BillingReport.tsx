import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/ui/stats-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, Column } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSpreadsheet, Download, Receipt, FileX } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportToExcel, exportToPDF, ExportColumn } from '@/lib/export-utils';
import { DateRange } from 'react-day-picker';

interface CashFlowWithInvoice {
  id: string;
  type: string;
  category: string;
  description: string | null;
  amount: number;
  payment_account: string | null;
  is_invoiced: boolean;
  invoice_number: string | null;
  reference_date: string;
  created_at: string;
  related_payment_id: string | null;
  related_contract_id: string | null;
}

const PAYMENT_ACCOUNT_LABELS: Record<string, string> = {
  'BRUCKSCHEN_ES': 'Bruckschen (Espanha)',
  'BRUCKSCHEN_ASSOCIADOS_ES': 'Bruckschen Associados ES',
  'BRUCKSCHEN_ASESORIA_ES': 'Bruckschen Asesoria ES',
  'PIX_BR': 'PIX (Brasil)',
  'PAYPAL': 'PayPal',
  'DINHEIRO': 'Dinheiro',
  'OUTRO': 'Outro',
};

interface BillingReportProps {
  dateRange?: DateRange;
}

export default function BillingReport({ dateRange }: BillingReportProps) {
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'invoiced' | 'not_invoiced'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // Fetch cash flow entries (only ENTRADA - SERVICOS for billing report)
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['billing-report', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .eq('type', 'ENTRADA')
        .eq('category', 'SERVICOS')
        .gte('reference_date', startDate)
        .lte('reference_date', endDate)
        .order('reference_date', { ascending: false });

      if (error) throw error;
      return data as CashFlowWithInvoice[];
    },
  });

  // Filter entries based on selections
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Invoice filter
      if (invoiceFilter === 'invoiced' && !entry.is_invoiced) return false;
      if (invoiceFilter === 'not_invoiced' && entry.is_invoiced) return false;

      // Account filter
      if (accountFilter !== 'all' && entry.payment_account !== accountFilter) return false;

      return true;
    });
  }, [entries, invoiceFilter, accountFilter]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const invoicedEntries = entries.filter(e => e.is_invoiced);
    const notInvoicedEntries = entries.filter(e => !e.is_invoiced);

    const totalInvoiced = invoicedEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalNotInvoiced = notInvoicedEntries.reduce((sum, e) => sum + e.amount, 0);

    // IVA calculation (21% of invoiced amount - already included in total)
    const vatRate = 0.21;
    const vatTotal = totalInvoiced - (totalInvoiced / (1 + vatRate));

    return {
      totalInvoiced,
      totalNotInvoiced,
      totalRevenue: totalInvoiced + totalNotInvoiced,
      invoiceCount: invoicedEntries.length,
      vatTotal,
    };
  }, [entries]);

  // Get unique accounts for filter
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set(entries.map(e => e.payment_account).filter(Boolean));
    return Array.from(accounts) as string[];
  }, [entries]);

  // Export handlers
  const handleExport = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Data', key: 'date', width: 12 },
      { header: 'Descrição', key: 'description', width: 30 },
      { header: 'Valor', key: 'amount', width: 15 },
      { header: 'Conta', key: 'account', width: 20 },
      { header: 'Faturado', key: 'invoiced', width: 12 },
      { header: 'Nº Fatura', key: 'invoiceNumber', width: 15 },
    ];

    const data = filteredEntries.map((e) => ({
      date: format(new Date(e.reference_date), 'dd/MM/yyyy'),
      description: e.description || '-',
      amount: `€ ${e.amount.toFixed(2)}`,
      account: PAYMENT_ACCOUNT_LABELS[e.payment_account || ''] || e.payment_account || '-',
      invoiced: e.is_invoiced ? 'Sim' : 'Não',
      invoiceNumber: e.invoice_number || '-',
    }));

    const options = {
      filename: 'faturamento',
      title: 'Relatório de Faturamento',
      columns,
      data,
      dateRange: { start: new Date(startDate), end: new Date(endDate) },
    };

    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  const columns: Column<CashFlowWithInvoice>[] = [
    {
      key: 'reference_date',
      header: 'Data',
      cell: (item) => format(new Date(item.reference_date), 'dd/MM/yyyy', { locale: ptBR }),
    },
    {
      key: 'description',
      header: 'Descrição',
      cell: (item) => <span className="font-medium">{item.description || '-'}</span>,
    },
    {
      key: 'amount',
      header: 'Valor',
      cell: (item) => <span className="font-semibold text-green-600">€{item.amount.toFixed(2)}</span>,
    },
    {
      key: 'payment_account',
      header: 'Conta',
      cell: (item) => PAYMENT_ACCOUNT_LABELS[item.payment_account || ''] || item.payment_account || '-',
    },
    {
      key: 'is_invoiced',
      header: 'Faturado',
      cell: (item) => (
        item.is_invoiced 
          ? <Badge className="bg-success text-success-foreground">Sim</Badge>
          : <Badge variant="secondary">Não</Badge>
      ),
    },
    {
      key: 'invoice_number',
      header: 'Nº Fatura',
      cell: (item) => (
        item.is_invoiced && item.invoice_number
          ? <Badge variant="outline">{item.invoice_number}</Badge>
          : <span className="text-muted-foreground">{item.invoice_number || '-'}</span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Faturado"
          value={`€${metrics.totalInvoiced.toFixed(2)}`}
          description={`${metrics.invoiceCount} faturas emitidas`}
          icon={Receipt}
        />
        <StatsCard
          title="Recebido Sem Fatura"
          value={`€${metrics.totalNotInvoiced.toFixed(2)}`}
          description="PIX, PayPal, Dinheiro"
          icon={FileX}
        />
        <StatsCard
          title="Receita Total"
          value={`€${metrics.totalRevenue.toFixed(2)}`}
          description="Faturado + Não faturado"
          icon={Receipt}
        />
        <StatsCard
          title="IVA a Recolher"
          value={`€${metrics.vatTotal.toFixed(2)}`}
          description="21% sobre faturado"
          icon={Receipt}
        />
      </div>

      {/* Filters and Export */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-lg">Lançamentos de Serviços</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={invoiceFilter} onValueChange={(v: 'all' | 'invoiced' | 'not_invoiced') => setInvoiceFilter(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Faturamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="invoiced">Com Fatura</SelectItem>
                  <SelectItem value="not_invoiced">Sem Fatura</SelectItem>
                </SelectContent>
              </Select>

              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Contas</SelectItem>
                  {uniqueAccounts.map((account) => (
                    <SelectItem key={account} value={account}>
                      {PAYMENT_ACCOUNT_LABELS[account] || account}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground mb-4">
            {filteredEntries.length} registros encontrados
          </div>
          <DataTable 
            columns={columns} 
            data={filteredEntries} 
            emptyMessage="Nenhum lançamento no período" 
          />
        </CardContent>
      </Card>
    </div>
  );
}
