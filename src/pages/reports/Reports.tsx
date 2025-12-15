import { useState } from 'react';
import { useReportsData, ReportFilters } from '@/hooks/useReportsData';
import { useTableControls } from '@/hooks/useTableControls';
import { exportToExcel, exportToPDF, ExportColumn } from '@/lib/export-utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/ui/stats-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ReportTable, ReportColumn } from '@/components/reports/ReportTable';
import SLAPerformanceReport from '@/components/reports/SLAPerformanceReport';
import {
  Users,
  TrendingUp,
  DollarSign,
  Briefcase,
  Download,
  FileSpreadsheet,
  CalendarIcon,
  Filter,
  Shield,
} from 'lucide-react';
import {
  SERVICE_INTEREST_LABELS,
  SERVICE_SECTOR_LABELS,
  TECHNICAL_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  ORIGIN_CHANNEL_LABELS,
} from '@/types/database';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, parseISO, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444'];

type Lead = {
  id: string;
  contacts?: { full_name?: string; email?: string; phone?: number | null; origin_channel?: string } | null;
  service_interest?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Opportunity = {
  id: string;
  leads?: { contacts?: { full_name?: string }; service_interest?: string } | null;
  total_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
};

type Payment = {
  id: string;
  amount?: number | null;
  payment_method?: string | null;
  status?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
};

type Case = {
  id: string;
  protocol_number?: string | null;
  sector?: string | null;
  service_type?: string | null;
  technical_status?: string | null;
  assigned_to?: { full_name?: string } | null;
  created_at?: string | null;
};

type Task = {
  id: string;
  title: string;
  status?: string | null;
  assigned_to?: { full_name?: string } | null;
  due_date?: string | null;
  created_at?: string | null;
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 1)),
    to: endOfMonth(new Date()),
  });
  const [filters, setFilters] = useState({
    serviceType: 'all',
    status: 'all',
    sector: 'all',
    assignedTo: 'all',
  });

  const reportFilters: ReportFilters = {
    dateRange: {
      start: dateRange?.from || startOfMonth(new Date()),
      end: dateRange?.to || endOfMonth(new Date()),
    },
    serviceType: filters.serviceType,
    status: filters.status,
    sector: filters.sector,
    assignedTo: filters.assignedTo,
  };

  const { leads, opportunities, contracts, payments, cases, tasks, staff, previousMetrics, isLoading } = useReportsData(reportFilters);

  // Table controls for each tab with searchable fields
  const leadsTable = useTableControls<Lead>(leads as Lead[], { 
    initialSortKey: 'created_at',
    searchableFields: ['contacts.full_name', 'contacts.email', 'contacts.phone']
  });
  const opportunitiesTable = useTableControls<Opportunity>(opportunities as Opportunity[], { 
    initialSortKey: 'created_at',
    searchableFields: ['leads.contacts.full_name']
  });
  const paymentsTable = useTableControls<Payment>(payments as Payment[], { 
    initialSortKey: 'created_at',
    searchableFields: ['id', 'payment_method']
  });
  const casesTable = useTableControls<Case>(cases as Case[], { 
    initialSortKey: 'created_at',
    searchableFields: ['protocol_number', 'assigned_to.full_name']
  });
  const tasksTable = useTableControls<Task>(tasks as Task[], { 
    initialSortKey: 'created_at',
    searchableFields: ['title', 'assigned_to.full_name']
  });

  // Calculate metrics
  const metrics = {
    leads: {
      total: leads.length,
      new: leads.filter((l) => l.status === 'NOVO').length,
      confirmed: leads.filter((l) => l.status === 'INTERESSE_CONFIRMADO').length,
      conversionRate: leads.length > 0 ? Math.round((leads.filter((l) => l.status === 'INTERESSE_CONFIRMADO').length / leads.length) * 100) : 0,
    },
    opportunities: {
      total: opportunities.length,
      open: opportunities.filter((o) => o.status === 'ABERTA').length,
      won: opportunities.filter((o) => o.status === 'FECHADA_GANHA').length,
      revenue: opportunities.filter((o) => o.status === 'FECHADA_GANHA').reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
    },
    contracts: {
      total: contracts.length,
      pending: contracts.filter((c) => c.status === 'EM_ELABORACAO' || c.status === 'EM_REVISAO').length,
      signed: contracts.filter((c) => c.status === 'ASSINADO').length,
    },
    payments: {
      total: payments.length,
      confirmed: payments.filter((p) => p.status === 'CONFIRMADO').length,
      confirmedTotal: payments.filter((p) => p.status === 'CONFIRMADO').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      pendingTotal: payments.filter((p) => p.status === 'PENDENTE').reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    },
    cases: {
      total: cases.length,
      active: cases.filter((c) => !c.technical_status?.startsWith('ENCERRADO')).length,
      closed: cases.filter((c) => c.technical_status?.startsWith('ENCERRADO')).length,
    },
    tasks: {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'PENDENTE').length,
      overdue: tasks.filter((t) => t.status === 'PENDENTE' && t.due_date && new Date(t.due_date) < new Date()).length,
    },
  };

  // Calculate period comparison trends
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? { value: 100, isPositive: true } : null;
    const change = Math.round(((current - previous) / previous) * 100);
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  const trends = {
    leads: calculateTrend(metrics.leads.total, previousMetrics.leads.total),
    conversionRate: calculateTrend(
      metrics.leads.conversionRate,
      previousMetrics.leads.total > 0
        ? Math.round((previousMetrics.leads.confirmed / previousMetrics.leads.total) * 100)
        : 0
    ),
    revenue: calculateTrend(metrics.opportunities.revenue, previousMetrics.opportunities.revenue),
    casesActive: calculateTrend(metrics.cases.active, previousMetrics.cases.active),
  };

  // Export handlers
  const handleExportLeads = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Nome', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Telefone', key: 'phone', width: 15 },
      { header: 'Canal', key: 'channel', width: 15 },
      { header: 'Interesse', key: 'interest', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Data', key: 'date', width: 12 },
    ];

    const data = leads.map((l) => ({
      name: l.contacts?.full_name || '',
      email: l.contacts?.email || '',
      phone: l.contacts?.phone || '',
      channel: ORIGIN_CHANNEL_LABELS[l.contacts?.origin_channel as keyof typeof ORIGIN_CHANNEL_LABELS] || '',
      interest: SERVICE_INTEREST_LABELS[l.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || '',
      status: LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || '',
      date: l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy') : '',
    }));

    const options = { filename: 'leads', title: 'Relatório de Leads', columns, data, dateRange: reportFilters.dateRange };
    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  const handleExportOpportunities = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Cliente', key: 'client', width: 25 },
      { header: 'Serviço', key: 'service', width: 20 },
      { header: 'Valor', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Data', key: 'date', width: 12 },
    ];

    const data = opportunities.map((o) => ({
      client: (o.leads as { contacts?: { full_name?: string } })?.contacts?.full_name || '',
      service: SERVICE_INTEREST_LABELS[(o.leads as { service_interest?: string })?.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || '',
      amount: `€ ${Number(o.total_amount || 0).toLocaleString('pt-BR')}`,
      status: OPPORTUNITY_STATUS_LABELS[o.status as keyof typeof OPPORTUNITY_STATUS_LABELS] || '',
      date: o.created_at ? format(new Date(o.created_at), 'dd/MM/yyyy') : '',
    }));

    const options = { filename: 'oportunidades', title: 'Relatório de Oportunidades', columns, data, dateRange: reportFilters.dateRange };
    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  const handleExportPayments = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Valor', key: 'amount', width: 15 },
      { header: 'Método', key: 'method', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Data Criação', key: 'createdAt', width: 12 },
      { header: 'Data Pagamento', key: 'paidAt', width: 12 },
    ];

    const data = payments.map((p) => ({
      amount: `€ ${Number(p.amount || 0).toLocaleString('pt-BR')}`,
      method: p.payment_method || '',
      status: PAYMENT_STATUS_LABELS[p.status as keyof typeof PAYMENT_STATUS_LABELS] || '',
      createdAt: p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy') : '',
      paidAt: p.paid_at ? format(new Date(p.paid_at), 'dd/MM/yyyy') : '-',
    }));

    const options = { filename: 'pagamentos', title: 'Relatório de Pagamentos', columns, data, dateRange: reportFilters.dateRange };
    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  const handleExportCases = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Protocolo', key: 'protocol', width: 15 },
      { header: 'Setor', key: 'sector', width: 15 },
      { header: 'Tipo', key: 'type', width: 20 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Responsável', key: 'assignedTo', width: 20 },
      { header: 'Data', key: 'date', width: 12 },
    ];

    const data = cases.map((c) => ({
      protocol: c.protocol_number || '-',
      sector: SERVICE_SECTOR_LABELS[c.sector as keyof typeof SERVICE_SECTOR_LABELS] || '',
      type: SERVICE_INTEREST_LABELS[c.service_type as keyof typeof SERVICE_INTEREST_LABELS] || '',
      status: TECHNICAL_STATUS_LABELS[c.technical_status as keyof typeof TECHNICAL_STATUS_LABELS] || '',
      assignedTo: (c.assigned_to as { full_name?: string })?.full_name || '-',
      date: c.created_at ? format(new Date(c.created_at), 'dd/MM/yyyy') : '',
    }));

    const options = { filename: 'casos', title: 'Relatório de Casos Técnicos', columns, data, dateRange: reportFilters.dateRange };
    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  const handleExportTasks = (type: 'excel' | 'pdf') => {
    const columns: ExportColumn[] = [
      { header: 'Título', key: 'title', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Responsável', key: 'assignedTo', width: 20 },
      { header: 'Prazo', key: 'dueDate', width: 12 },
      { header: 'Criado em', key: 'createdAt', width: 12 },
    ];

    const data = tasks.map((t) => ({
      title: t.title,
      status: TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS] || '',
      assignedTo: (t.assigned_to as { full_name?: string })?.full_name || '-',
      dueDate: t.due_date ? format(new Date(t.due_date), 'dd/MM/yyyy') : '-',
      createdAt: t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy') : '',
    }));

    const options = { filename: 'tarefas', title: 'Relatório de Tarefas', columns, data, dateRange: reportFilters.dateRange };
    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  // Column definitions
  const leadsColumns: ReportColumn<Lead>[] = [
    { key: 'contacts.full_name', header: 'Nome', sortable: true, cell: (l) => <span className="font-medium">{l.contacts?.full_name || '-'}</span> },
    { key: 'contacts.email', header: 'Email', sortable: true, cell: (l) => l.contacts?.email || '-' },
    { key: 'contacts.origin_channel', header: 'Canal', sortable: true, cell: (l) => ORIGIN_CHANNEL_LABELS[l.contacts?.origin_channel as keyof typeof ORIGIN_CHANNEL_LABELS] || '-' },
    { key: 'service_interest', header: 'Interesse', sortable: true, cell: (l) => SERVICE_INTEREST_LABELS[l.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || '-' },
    { key: 'status', header: 'Status', sortable: true, cell: (l) => LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || '-' },
    { key: 'created_at', header: 'Data', sortable: true, cell: (l) => l.created_at ? format(new Date(l.created_at), 'dd/MM/yyyy') : '-' },
  ];

  const opportunitiesColumns: ReportColumn<Opportunity>[] = [
    { key: 'leads.contacts.full_name', header: 'Cliente', sortable: true, cell: (o) => <span className="font-medium">{o.leads?.contacts?.full_name || '-'}</span> },
    { key: 'leads.service_interest', header: 'Serviço', sortable: true, cell: (o) => SERVICE_INTEREST_LABELS[o.leads?.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || '-' },
    { key: 'total_amount', header: 'Valor', sortable: true, cell: (o) => `€ ${Number(o.total_amount || 0).toLocaleString('pt-BR')}` },
    { key: 'status', header: 'Status', sortable: true, cell: (o) => OPPORTUNITY_STATUS_LABELS[o.status as keyof typeof OPPORTUNITY_STATUS_LABELS] || '-' },
    { key: 'created_at', header: 'Data', sortable: true, cell: (o) => o.created_at ? format(new Date(o.created_at), 'dd/MM/yyyy') : '-' },
  ];

  const paymentsColumns: ReportColumn<Payment>[] = [
    { key: 'amount', header: 'Valor', sortable: true, cell: (p) => <span className="font-medium">€ {Number(p.amount || 0).toLocaleString('pt-BR')}</span> },
    { key: 'payment_method', header: 'Método', sortable: true, cell: (p) => p.payment_method || '-' },
    { key: 'status', header: 'Status', sortable: true, cell: (p) => PAYMENT_STATUS_LABELS[p.status as keyof typeof PAYMENT_STATUS_LABELS] || '-' },
    { key: 'created_at', header: 'Criado em', sortable: true, cell: (p) => p.created_at ? format(new Date(p.created_at), 'dd/MM/yyyy') : '-' },
    { key: 'paid_at', header: 'Pago em', sortable: true, cell: (p) => p.paid_at ? format(new Date(p.paid_at), 'dd/MM/yyyy') : '-' },
  ];

  const casesColumns: ReportColumn<Case>[] = [
    { key: 'protocol_number', header: 'Protocolo', sortable: true, cell: (c) => <span className="font-medium">{c.protocol_number || '-'}</span> },
    { key: 'sector', header: 'Setor', sortable: true, cell: (c) => SERVICE_SECTOR_LABELS[c.sector as keyof typeof SERVICE_SECTOR_LABELS] || '-' },
    { key: 'service_type', header: 'Tipo', sortable: true, cell: (c) => SERVICE_INTEREST_LABELS[c.service_type as keyof typeof SERVICE_INTEREST_LABELS] || '-' },
    { key: 'technical_status', header: 'Status', sortable: true, cell: (c) => TECHNICAL_STATUS_LABELS[c.technical_status as keyof typeof TECHNICAL_STATUS_LABELS] || '-' },
    { key: 'assigned_to.full_name', header: 'Responsável', sortable: true, cell: (c) => c.assigned_to?.full_name || '-' },
    { key: 'created_at', header: 'Data', sortable: true, cell: (c) => c.created_at ? format(new Date(c.created_at), 'dd/MM/yyyy') : '-' },
  ];

  const tasksColumns: ReportColumn<Task>[] = [
    { key: 'title', header: 'Título', sortable: true, cell: (t) => <span className="font-medium">{t.title}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (t) => TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS] || '-' },
    { key: 'assigned_to.full_name', header: 'Responsável', sortable: true, cell: (t) => t.assigned_to?.full_name || '-' },
    { key: 'due_date', header: 'Prazo', sortable: true, cell: (t) => (
      <span className={t.due_date && new Date(t.due_date) < new Date() && t.status === 'PENDENTE' ? 'text-destructive' : ''}>
        {t.due_date ? format(new Date(t.due_date), 'dd/MM/yyyy') : '-'}
      </span>
    )},
    { key: 'created_at', header: 'Criado em', sortable: true, cell: (t) => t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy') : '-' },
  ];

  // Sector distribution for chart
  const sectorData = cases.reduce(
    (acc, c) => {
      const sector = c.sector as keyof typeof SERVICE_SECTOR_LABELS;
      const label = SERVICE_SECTOR_LABELS[sector] || sector;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const sectorChartData = Object.entries(sectorData).map(([name, value]) => ({ name, value }));

  // Generate monthly trend data
  const generateMonthlyTrend = () => {
    const startDate = dateRange?.from || startOfMonth(subMonths(new Date(), 5));
    const endDate = dateRange?.to || endOfMonth(new Date());
    
    const months = eachMonthOfInterval({ start: startDate, end: endDate });
    
    return months.map((month) => {
      const monthKey = format(month, 'yyyy-MM');
      const monthLabel = format(month, 'MMM/yy', { locale: ptBR });
      
      const leadsCount = leads.filter((l) => {
        if (!l.created_at) return false;
        return format(parseISO(l.created_at), 'yyyy-MM') === monthKey;
      }).length;
      
      const opportunitiesCount = opportunities.filter((o) => {
        if (!o.created_at) return false;
        return format(parseISO(o.created_at), 'yyyy-MM') === monthKey;
      }).length;
      
      const casesCount = cases.filter((c) => {
        if (!c.created_at) return false;
        return format(parseISO(c.created_at), 'yyyy-MM') === monthKey;
      }).length;
      
      const paymentsTotal = payments
        .filter((p) => {
          if (!p.paid_at) return false;
          return format(parseISO(p.paid_at), 'yyyy-MM') === monthKey;
        })
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      return {
        month: monthLabel,
        leads: leadsCount,
        oportunidades: opportunitiesCount,
        casos: casesCount,
        receita: paymentsTotal,
      };
    });
  };
  
  const trendData = generateMonthlyTrend();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Relatórios" description="Métricas e indicadores de desempenho" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Métricas, indicadores e exportação de dados" />

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'dd/MM/yy', { locale: ptBR })} - {format(dateRange.to, 'dd/MM/yy', { locale: ptBR })}
                        </>
                      ) : (
                        format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })
                      )
                    ) : (
                      'Selecione o período'
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Serviço</Label>
              <Select value={filters.serviceType} onValueChange={(v) => setFilters({ ...filters, serviceType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(SERVICE_INTEREST_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={filters.sector} onValueChange={(v) => setFilters({ ...filters, sector: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(SERVICE_SECTOR_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={filters.assignedTo} onValueChange={(v) => setFilters({ ...filters, assignedTo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    serviceType: 'all',
                    status: 'all',
                    sector: 'all',
                    assignedTo: 'all',
                  })
                }
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="sla" className="gap-1">
            <Shield className="h-3 w-3" />
            SLAs
          </TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="cases">Casos</TabsTrigger>
          <TabsTrigger value="tasks">Tarefas</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard 
              title="Total de Leads" 
              value={metrics.leads.total} 
              description={`${metrics.leads.confirmed} confirmados`} 
              icon={Users} 
              trend={trends.leads || undefined}
            />
            <StatsCard 
              title="Taxa de Conversão" 
              value={`${metrics.leads.conversionRate}%`} 
              description="Leads → Interesse" 
              icon={TrendingUp} 
              trend={trends.conversionRate || undefined}
            />
            <StatsCard
              title="Receita"
              value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(metrics.opportunities.revenue)}
              description={`${metrics.opportunities.won} oportunidades ganhas`}
              icon={DollarSign}
              trend={trends.revenue || undefined}
            />
            <StatsCard
              title="Casos Ativos"
              value={metrics.cases.active}
              description={`${metrics.cases.closed} encerrados`}
              icon={Briefcase}
              trend={trends.casesActive || undefined}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Casos por Setor</CardTitle>
                <CardDescription>Distribuição de casos técnicos</CardDescription>
              </CardHeader>
              <CardContent>
                {sectorChartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sectorChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {sectorChartData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados disponíveis</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo Financeiro</CardTitle>
                <CardDescription>Pagamentos no período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <span className="text-green-700 dark:text-green-300">Pagamentos Confirmados</span>
                  <span className="text-xl font-bold text-green-700 dark:text-green-300">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(metrics.payments.confirmedTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
                  <span className="text-amber-700 dark:text-amber-300">Pagamentos Pendentes</span>
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(metrics.payments.pendingTotal)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{metrics.payments.confirmed}</div>
                    <div className="text-sm text-muted-foreground">Confirmados</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{metrics.payments.total - metrics.payments.confirmed}</div>
                    <div className="text-sm text-muted-foreground">Pendentes</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Evolução de Leads e Oportunidades</CardTitle>
                <CardDescription>Tendência mensal de novos registros</CardDescription>
              </CardHeader>
              <CardContent>
                {trendData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="oportunidades" name="Oportunidades" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="casos" name="Casos" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados disponíveis</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evolução da Receita</CardTitle>
                <CardDescription>Pagamentos confirmados por mês</CardDescription>
              </CardHeader>
              <CardContent>
                {trendData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis 
                          className="text-xs" 
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [
                            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' }).format(value),
                            'Receita'
                          ]}
                        />
                        <Area type="monotone" dataKey="receita" name="Receita" stroke="#10b981" strokeWidth={2} fill="url(#colorReceita)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">Sem dados disponíveis</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SLA Performance Tab */}
        <TabsContent value="sla" className="space-y-4">
          <SLAPerformanceReport />
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{leads.length} registros encontrados</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportLeads('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportLeads('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
          <ReportTable
            data={leadsTable.paginatedData}
            columns={leadsColumns}
            currentPage={leadsTable.currentPage}
            pageSize={leadsTable.pageSize}
            totalPages={leadsTable.totalPages}
            totalItems={leadsTable.totalItems}
            sortConfig={leadsTable.sortConfig}
            searchQuery={leadsTable.searchQuery}
            onSort={leadsTable.handleSort}
            onPageChange={leadsTable.handlePageChange}
            onPageSizeChange={leadsTable.handlePageSizeChange}
            onSearch={leadsTable.handleSearch}
            searchPlaceholder="Buscar por nome, email ou telefone..."
            emptyMessage="Nenhum lead encontrado no período"
          />
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{opportunities.length} registros encontrados</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportOpportunities('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportOpportunities('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
          <ReportTable
            data={opportunitiesTable.paginatedData}
            columns={opportunitiesColumns}
            currentPage={opportunitiesTable.currentPage}
            pageSize={opportunitiesTable.pageSize}
            totalPages={opportunitiesTable.totalPages}
            totalItems={opportunitiesTable.totalItems}
            sortConfig={opportunitiesTable.sortConfig}
            searchQuery={opportunitiesTable.searchQuery}
            onSort={opportunitiesTable.handleSort}
            onPageChange={opportunitiesTable.handlePageChange}
            onPageSizeChange={opportunitiesTable.handlePageSizeChange}
            onSearch={opportunitiesTable.handleSearch}
            searchPlaceholder="Buscar por nome do cliente..."
            emptyMessage="Nenhuma oportunidade encontrada no período"
          />
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{payments.length} registros encontrados</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportPayments('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportPayments('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
          <ReportTable
            data={paymentsTable.paginatedData}
            columns={paymentsColumns}
            currentPage={paymentsTable.currentPage}
            pageSize={paymentsTable.pageSize}
            totalPages={paymentsTable.totalPages}
            totalItems={paymentsTable.totalItems}
            sortConfig={paymentsTable.sortConfig}
            searchQuery={paymentsTable.searchQuery}
            onSort={paymentsTable.handleSort}
            onPageChange={paymentsTable.handlePageChange}
            onPageSizeChange={paymentsTable.handlePageSizeChange}
            onSearch={paymentsTable.handleSearch}
            searchPlaceholder="Buscar por ID ou método..."
            emptyMessage="Nenhum pagamento encontrado no período"
          />
        </TabsContent>

        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{cases.length} registros encontrados</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportCases('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportCases('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
          <ReportTable
            data={casesTable.paginatedData}
            columns={casesColumns}
            currentPage={casesTable.currentPage}
            pageSize={casesTable.pageSize}
            totalPages={casesTable.totalPages}
            totalItems={casesTable.totalItems}
            sortConfig={casesTable.sortConfig}
            searchQuery={casesTable.searchQuery}
            onSort={casesTable.handleSort}
            onPageChange={casesTable.handlePageChange}
            onPageSizeChange={casesTable.handlePageSizeChange}
            onSearch={casesTable.handleSearch}
            searchPlaceholder="Buscar por protocolo ou responsável..."
            emptyMessage="Nenhum caso encontrado no período"
          />
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{tasks.length} registros encontrados</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExportTasks('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportTasks('pdf')}>
                <Download className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
          <ReportTable
            data={tasksTable.paginatedData}
            columns={tasksColumns}
            currentPage={tasksTable.currentPage}
            pageSize={tasksTable.pageSize}
            totalPages={tasksTable.totalPages}
            totalItems={tasksTable.totalItems}
            sortConfig={tasksTable.sortConfig}
            searchQuery={tasksTable.searchQuery}
            onSort={tasksTable.handleSort}
            onPageChange={tasksTable.handlePageChange}
            onPageSizeChange={tasksTable.handlePageSizeChange}
            onSearch={tasksTable.handleSearch}
            searchPlaceholder="Buscar por título ou responsável..."
            emptyMessage="Nenhuma tarefa encontrada no período"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
