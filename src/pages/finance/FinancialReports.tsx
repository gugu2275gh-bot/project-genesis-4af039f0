import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  FileText, 
  AlertCircle, 
  TrendingUp, 
  Receipt, 
  Users,
  ExternalLink,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatsCard } from '@/components/ui/stats-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, Column } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinancialReports, ContractWithBalance, ContractNotStarted, FuturePayment, MonthlyForecast } from '@/hooks/useFinancialReports';
import { useCommissions } from '@/hooks/useCommissions';
import { cn } from '@/lib/utils';
import { exportToExcel, exportToPDF, ExportColumn } from '@/lib/export-utils';
import { DateRange } from 'react-day-picker';
import BillingReport from '@/components/reports/BillingReport';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

const SERVICE_TYPE_LABELS: Record<string, string> = {
  'VISTO_ESTUDANTE': 'Visto Estudante',
  'VISTO_TRABALHO': 'Visto Trabalho',
  'REAGRUPAMENTO': 'Reagrupamento',
  'RENOVACAO_RESIDENCIA': 'Renovação',
  'NACIONALIDADE_RESIDENCIA': 'Nacionalidade (Residência)',
  'NACIONALIDADE_CASAMENTO': 'Nacionalidade (Casamento)',
  'OUTRO': 'Outro',
};

export default function FinancialReports() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pending-balance');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const { 
    contractsWithBalance, 
    contractsNotStarted, 
    monthlyForecast,
    isLoading,
    metrics,
  } = useFinancialReports();

  const {
    pendingToPay,
    pendingToReceive,
    totalPendingToPay,
    totalPendingToReceive,
    isLoading: commissionsLoading,
    markAsPaid,
  } = useCommissions();

  // Columns for Contracts with Balance
  const balanceColumns: Column<ContractWithBalance>[] = [
    {
      key: 'client_name',
      header: 'Cliente',
      cell: (item) => <span className="font-medium">{item.client_name}</span>,
    },
    {
      key: 'service_type',
      header: 'Serviço',
      cell: (item) => SERVICE_TYPE_LABELS[item.service_type] || item.service_type,
    },
    {
      key: 'total_fee',
      header: 'Valor Total',
      cell: (item) => <span>€{(item.total_fee || 0).toFixed(2)}</span>,
    },
    {
      key: 'paid_amount',
      header: 'Pago',
      cell: (item) => <span className="text-success">€{item.paid_amount.toFixed(2)}</span>,
    },
    {
      key: 'balance',
      header: 'Saldo',
      cell: (item) => <span className="font-semibold text-amber-600">€{item.balance.toFixed(2)}</span>,
    },
    {
      key: 'overdue_count',
      header: 'Vencidas',
      cell: (item) => (
        item.overdue_count > 0 ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {item.overdue_count}
          </Badge>
        ) : (
          <Badge variant="secondary">0</Badge>
        )
      ),
    },
    {
      key: 'next_due_date',
      header: 'Próx. Venc.',
      cell: (item) => (
        item.next_due_date 
          ? format(new Date(item.next_due_date), 'dd/MM/yyyy')
          : '-'
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      cell: (item) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(`/contracts/${item.id}`)}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Columns for Contracts Not Started
  const notStartedColumns: Column<ContractNotStarted>[] = [
    {
      key: 'client_name',
      header: 'Cliente',
      cell: (item) => <span className="font-medium">{item.client_name}</span>,
    },
    {
      key: 'service_type',
      header: 'Serviço',
      cell: (item) => SERVICE_TYPE_LABELS[item.service_type] || item.service_type,
    },
    {
      key: 'total_fee',
      header: 'Valor Total',
      cell: (item) => <span>€{(item.total_fee || 0).toFixed(2)}</span>,
    },
    {
      key: 'signed_at',
      header: 'Assinatura',
      cell: (item) => (
        item.signed_at 
          ? format(new Date(item.signed_at), 'dd/MM/yyyy')
          : '-'
      ),
    },
    {
      key: 'days_without_payment',
      header: 'Dias s/ Pagto',
      cell: (item) => {
        const days = item.days_without_payment;
        return (
          <Badge 
            variant={days >= 15 ? 'destructive' : days >= 7 ? 'default' : 'secondary'}
            className={cn(
              days >= 15 && 'bg-destructive',
              days >= 7 && days < 15 && 'bg-amber-500 hover:bg-amber-600'
            )}
          >
            {days} dias
          </Badge>
        );
      },
    },
    {
      key: 'first_due_date',
      header: '1ª Parcela',
      cell: (item) => (
        item.first_due_date 
          ? format(new Date(item.first_due_date), 'dd/MM/yyyy')
          : '-'
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      cell: (item) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(`/contracts/${item.id}`)}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Columns for Future Payments
  const futurePaymentsColumns: Column<FuturePayment>[] = [
    {
      key: 'client_name',
      header: 'Cliente',
      cell: (item) => <span className="font-medium">{item.client_name}</span>,
    },
    {
      key: 'contract_number',
      header: 'Contrato',
      cell: (item) => item.contract_number || '-',
    },
    {
      key: 'installment_number',
      header: 'Parcela',
      cell: (item) => item.installment_number ? `${item.installment_number}ª` : '-',
    },
    {
      key: 'amount',
      header: 'Valor',
      cell: (item) => <span className="font-semibold">€{item.amount.toFixed(2)}</span>,
    },
    {
      key: 'due_date',
      header: 'Vencimento',
      cell: (item) => format(new Date(item.due_date), 'dd/MM/yyyy'),
    },
  ];

  // Export handlers
  const handleExportBalance = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Cliente', key: 'client', width: 25 },
      { header: 'Serviço', key: 'service', width: 20 },
      { header: 'Valor Total', key: 'total', width: 15 },
      { header: 'Pago', key: 'paid', width: 15 },
      { header: 'Saldo', key: 'balance', width: 15 },
      { header: 'Parcelas Vencidas', key: 'overdue', width: 15 },
    ];

    const data = contractsWithBalance.map((c) => ({
      client: c.client_name,
      service: SERVICE_TYPE_LABELS[c.service_type] || c.service_type,
      total: `€${(c.total_fee || 0).toFixed(2)}`,
      paid: `€${c.paid_amount.toFixed(2)}`,
      balance: `€${c.balance.toFixed(2)}`,
      overdue: c.overdue_count.toString(),
    }));

    const options = {
      filename: 'contratos-saldo-pendente',
      title: 'Contratos com Saldo Pendente',
      columns,
      data,
    };

    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Relatórios Financeiros"
        description="Visão consolidada da situação financeira de contratos e cobranças"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total a Receber"
          value={`€${metrics.totalPendingToCollect.toFixed(2)}`}
          description={`${contractsWithBalance.length} contratos ativos`}
          icon={Receipt}
        />
        <StatsCard
          title="Contratos em Atraso"
          value={metrics.totalOverdue}
          description="Com parcelas vencidas"
          icon={AlertCircle}
          className={metrics.totalOverdue > 0 ? 'border-destructive/50' : ''}
        />
        <StatsCard
          title="Previsão 30 dias"
          value={`€${metrics.forecastNext30.toFixed(2)}`}
          description="Entradas previstas"
          icon={TrendingUp}
        />
        <StatsCard
          title="Contratos Parados"
          value={metrics.contractsNotStartedCount}
          description="Sem nenhum pagamento"
          icon={Clock}
          className={metrics.contractsNotStartedCount > 0 ? 'border-amber-500/50' : ''}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="pending-balance" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Saldo Pendente</span>
          </TabsTrigger>
          <TabsTrigger value="not-started" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Não Iniciados</span>
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Previsão</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Faturamento</span>
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Comissões</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Contracts with Pending Balance */}
        <TabsContent value="pending-balance">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <CardTitle className="text-lg">Contratos com Saldo Pendente</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExportBalance('excel')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExportBalance('pdf')}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {contractsWithBalance.length} contratos com saldo a receber (já iniciaram pagamentos)
              </p>
              <DataTable 
                columns={balanceColumns} 
                data={contractsWithBalance}
                emptyMessage="Nenhum contrato com saldo pendente"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Contracts Not Started */}
        <TabsContent value="not-started">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contratos Não Iniciados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {contractsNotStarted.length} contratos assinados sem nenhum pagamento confirmado
              </p>
              <DataTable 
                columns={notStartedColumns} 
                data={contractsNotStarted}
                emptyMessage="Todos os contratos têm pagamentos iniciados"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Revenue Forecast */}
        <TabsContent value="forecast">
          <div className="space-y-6">
            {/* Monthly Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Próximos 30 dias</p>
                    <p className="text-3xl font-bold text-primary mt-2">
                      €{metrics.forecastNext30.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Próximos 90 dias</p>
                    <p className="text-3xl font-bold text-primary mt-2">
                      €{metrics.forecastNext90.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total 6 meses</p>
                    <p className="text-3xl font-bold text-primary mt-2">
                      €{metrics.totalFutureRevenue.toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Previsão por Mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthlyForecast.map((month) => (
                    <div key={month.month} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium capitalize">{month.monthLabel}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-lg">€{month.total.toFixed(2)}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({month.count} parcelas)
                          </span>
                        </div>
                      </div>
                      <DataTable
                        columns={futurePaymentsColumns}
                        data={month.payments}
                        emptyMessage="Sem parcelas"
                      />
                    </div>
                  ))}
                  {monthlyForecast.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma parcela prevista nos próximos 6 meses
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Billing Report */}
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <CardTitle className="text-lg">Faturamento Realizado</CardTitle>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'dd/MM/yyyy')} - {format(dateRange.to, 'dd/MM/yyyy')}
                          </>
                        ) : (
                          format(dateRange.from, 'dd/MM/yyyy')
                        )
                      ) : (
                        'Selecionar período'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              <BillingReport dateRange={dateRange} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Commissions */}
        <TabsContent value="commissions">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatsCard
                title="Comissões a Pagar"
                value={`€${totalPendingToPay.toFixed(2)}`}
                description={`${pendingToPay.length} captadores pendentes`}
                icon={Users}
                className="border-amber-500/50"
              />
              <StatsCard
                title="Comissões a Receber"
                value={`€${totalPendingToReceive.toFixed(2)}`}
                description={`${pendingToReceive.length} fornecedores pendentes`}
                icon={Receipt}
                className="border-success/50"
              />
            </div>

            {/* Commissions to Pay */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Comissões a Pagar (Captadores)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commissionsLoading ? (
                  <Skeleton className="h-32" />
                ) : pendingToPay.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhuma comissão pendente para pagamento
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingToPay.map((commission) => (
                      <div key={commission.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{commission.collaborator_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Cliente: {commission.contracts?.opportunities?.leads?.contacts?.full_name || 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Base: €{commission.base_amount.toFixed(2)} • 
                            Taxa: {((commission.commission_rate || 0) * 100).toFixed(0)}%
                            {commission.has_invoice ? ' (com fatura)' : ' (sem fatura)'}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-lg">
                            €{(commission.commission_amount || 0).toFixed(2)}
                          </span>
                          <Button 
                            size="sm"
                            onClick={() => markAsPaid.mutate({ id: commission.id, paymentMethod: 'TRANSFERENCIA' })}
                            disabled={markAsPaid.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Commissions to Receive */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  Comissões a Receber (Fornecedores)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {commissionsLoading ? (
                  <Skeleton className="h-32" />
                ) : pendingToReceive.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhuma comissão pendente para recebimento
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingToReceive.map((commission) => (
                      <div key={commission.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{commission.collaborator_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Cliente: {commission.contracts?.opportunities?.leads?.contacts?.full_name || 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Base: €{commission.base_amount.toFixed(2)} • 
                            Taxa: {((commission.commission_rate || 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-lg text-success">
                            €{(commission.commission_amount || 0).toFixed(2)}
                          </span>
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => markAsPaid.mutate({ id: commission.id, paymentMethod: 'TRANSFERENCIA' })}
                            disabled={markAsPaid.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Recebido
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
