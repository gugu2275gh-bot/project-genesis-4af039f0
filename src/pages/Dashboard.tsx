import { Header } from '@/components/layout/Header';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  Users, 
  FileText, 
  CreditCard, 
  Briefcase, 
  TrendingUp, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  DollarSign,
  PieChart,
  BarChart3,
  Wifi,
  WifiOff,
  Activity,
  Bell,
  BellOff
} from 'lucide-react';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useRealtimeDashboard, TABLE_LABELS, EVENT_LABELS } from '@/hooks/useRealtimeDashboard';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { useAuth } from '@/contexts/AuthContext';
import SLAMonitoringPanel from '@/components/dashboard/SLAMonitoringPanel';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  SERVICE_SECTOR_LABELS, 
  ORIGIN_CHANNEL_LABELS,
} from '@/types/database';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CHART_COLORS = [
  'hsl(220, 70%, 25%)',   // primary
  'hsl(38, 92%, 50%)',    // secondary
  'hsl(187, 70%, 43%)',   // accent
  'hsl(142, 76%, 36%)',   // success
  'hsl(199, 89%, 48%)',   // info
  'hsl(0, 84%, 60%)',     // destructive
];

export default function Dashboard() {
  const { data: metrics, isLoading } = useDashboardMetrics();
  const { realtimeEvents, isConnected, lastUpdate } = useRealtimeDashboard();
  const { isEnabled: notificationsEnabled, isSupported, requestPermission, permission } = useBrowserNotifications();
  const { profile } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Dashboard" subtitle="Visão geral do sistema" />
        <div className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const sectorData = Object.entries(metrics?.cases.bySector || {}).map(([key, value]) => ({
    name: SERVICE_SECTOR_LABELS[key as keyof typeof SERVICE_SECTOR_LABELS] || key,
    value,
  }));

  const channelData = Object.entries(metrics?.leads.byChannel || {}).map(([key, value]) => ({
    name: ORIGIN_CHANNEL_LABELS[key as keyof typeof ORIGIN_CHANNEL_LABELS] || key,
    leads: value,
  }));

  const funnelData = [
    { stage: 'Leads', value: metrics?.leads.total || 0, fill: CHART_COLORS[0] },
    { stage: 'Confirmados', value: metrics?.leads.confirmed || 0, fill: CHART_COLORS[1] },
    { stage: 'Oportunidades', value: metrics?.opportunities.open || 0, fill: CHART_COLORS[2] },
    { stage: 'Contratos', value: metrics?.contracts.signed || 0, fill: CHART_COLORS[3] },
    { stage: 'Ganhos', value: metrics?.opportunities.won || 0, fill: CHART_COLORS[4] },
  ];

  return (
    <div className="min-h-screen">
      <Header 
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`} 
        subtitle="Visão geral do sistema" 
      />
      
      <div className="p-6 space-y-6">
        {/* Realtime Status Indicator */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                </div>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Wifi className="h-4 w-4" />
                  Conectado em tempo real
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <WifiOff className="h-4 w-4" />
                Conectando...
              </span>
            )}

            {/* Notifications Toggle */}
            {isSupported && (
              <Button
                variant={notificationsEnabled ? 'secondary' : 'outline'}
                size="sm"
                onClick={requestPermission}
                disabled={permission === 'denied'}
                className="gap-2"
              >
                {notificationsEnabled ? (
                  <>
                    <Bell className="h-4 w-4" />
                    Notificações ativas
                  </>
                ) : permission === 'denied' ? (
                  <>
                    <BellOff className="h-4 w-4" />
                    Notificações bloqueadas
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Ativar notificações
                  </>
                )}
              </Button>
            )}
          </div>
          
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Última atualização: {formatDistanceToNow(lastUpdate, { addSuffix: true, locale: ptBR })}
            </span>
          )}
        </div>

        {/* Realtime Activity Feed */}
        {realtimeEvents.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                Atividade em Tempo Real
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex flex-wrap gap-2">
                {realtimeEvents.slice(0, 5).map((event, index) => (
                  <Badge 
                    key={`${event.table}-${event.timestamp.getTime()}-${index}`}
                    variant="secondary"
                    className="animate-in fade-in slide-in-from-left-2 duration-300"
                  >
                    {TABLE_LABELS[event.table] || event.table} {EVENT_LABELS[event.eventType] || event.eventType}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Leads Novos"
            value={metrics?.leads.new.toString() || '0'}
            description="Últimos 30 dias"
            icon={Users}
            trend={metrics?.leads.trend ? { 
              value: Math.abs(metrics.leads.trend), 
              isPositive: metrics.leads.trend > 0 
            } : undefined}
          />
          <StatsCard
            title="Contratos Pendentes"
            value={metrics?.contracts.pending.toString() || '0'}
            description="Aguardando assinatura"
            icon={FileText}
          />
          <StatsCard
            title="Receita do Mês"
            value={`€${(metrics?.payments.confirmedTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
            description="Pagamentos confirmados"
            icon={DollarSign}
            trend={metrics?.opportunities.revenueTrend ? { 
              value: Math.abs(metrics.opportunities.revenueTrend), 
              isPositive: metrics.opportunities.revenueTrend > 0 
            } : undefined}
          />
          <StatsCard
            title="Casos Ativos"
            value={metrics?.cases.active.toString() || '0'}
            description="Em andamento"
            icon={Briefcase}
          />
        </div>

        {/* SLA Monitoring Panel */}
        <SLAMonitoringPanel />

        {/* Alert for overdue tasks */}
        {(metrics?.tasks.overdue || 0) > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-center gap-4 pt-6">
              <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Atenção: Tarefas Atrasadas</p>
                <p className="text-sm text-muted-foreground">
                  Você tem {metrics?.tasks.overdue} tarefa(s) com prazo vencido.
                </p>
              </div>
              <Button asChild variant="destructive" size="sm">
                <Link to="/tasks">
                  Ver tarefas
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Charts Row 1 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Leads Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Leads por Dia
              </CardTitle>
              <CardDescription>Últimos 7 dias</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics?.timeline.leads || []}>
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(220, 70%, 25%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(220, 70%, 25%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis allowDecimals={false} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="hsl(220, 70%, 25%)" 
                      fillOpacity={1} 
                      fill="url(#colorLeads)" 
                      name="Leads"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Pagamentos por Dia
              </CardTitle>
              <CardDescription>Últimos 7 dias</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics?.timeline.payments || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(value) => `€${value}`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`€${value.toLocaleString('pt-BR')}`, 'Valor']}
                    />
                    <Bar dataKey="amount" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="Valor" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent" />
                Funil de Conversão
              </CardTitle>
              <CardDescription>Taxa: {metrics?.leads.conversionRate}%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {funnelData.map((item, index) => {
                  const maxValue = Math.max(...funnelData.map(d => d.value));
                  const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                  return (
                    <div key={item.stage} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.stage}</span>
                        <span className="font-medium">{item.value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length]
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Cases by Sector */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-info" />
                Casos por Setor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={sectorData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {sectorData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Leads by Channel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-warning" />
                Leads por Canal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="name" type="category" width={80} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="leads" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tasks and Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pending Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Tarefas Pendentes
                </CardTitle>
                <CardDescription>
                  {metrics?.tasks.pending} pendentes, {metrics?.tasks.overdue} atrasadas
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/tasks">Ver todas</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {!metrics?.pendingTasks?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                  <p>Todas as tarefas em dia!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {metrics.pendingTasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm truncate flex-1">{task.title}</span>
                      {task.dueDate && (
                        <Badge 
                          variant="outline" 
                          className={task.isOverdue 
                            ? 'bg-destructive/10 text-destructive border-0' 
                            : 'bg-muted text-muted-foreground border-0'
                          }
                        >
                          {task.isOverdue ? 'Atrasado' : formatDistanceToNow(new Date(task.dueDate), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-success" />
                Resumo Financeiro
              </CardTitle>
              <CardDescription>Últimos 30 dias</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm text-muted-foreground">Confirmado</p>
                  <p className="text-2xl font-bold text-success">
                    €{(metrics?.payments.confirmedTotal || 0).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.payments.confirmed} pagamentos
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-sm text-muted-foreground">Pendente</p>
                  <p className="text-2xl font-bold text-warning">
                    €{(metrics?.payments.pendingTotal || 0).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.payments.pending} pagamentos
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{metrics?.opportunities.won}</p>
                    <p className="text-xs text-muted-foreground">Oportunidades Ganhas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-destructive">{metrics?.opportunities.lost}</p>
                    <p className="text-xs text-muted-foreground">Oportunidades Perdidas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-accent">{metrics?.cases.closed}</p>
                    <p className="text-xs text-muted-foreground">Casos Finalizados</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
