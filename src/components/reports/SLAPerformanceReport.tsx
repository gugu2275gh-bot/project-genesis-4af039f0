import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { useSLAPerformance } from '@/hooks/useSLAPerformance';
import { cn } from '@/lib/utils';
import { exportToExcel, exportToPDF, ExportColumn } from '@/lib/export-utils';

const COLORS = {
  success: 'hsl(142, 76%, 36%)',
  warning: 'hsl(38, 92%, 50%)',
  danger: 'hsl(0, 84%, 60%)',
  primary: 'hsl(220, 70%, 25%)',
  muted: 'hsl(220, 14%, 46%)',
};

export default function SLAPerformanceReport() {
  const [period, setPeriod] = useState<'week' | 'month' | '3months'>('month');
  const { data, isLoading } = useSLAPerformance(period);

  const handleExport = (type: 'excel' | 'pdf') => {
    if (!data) return;

    const columns: ExportColumn[] = [
      { header: 'Categoria', key: 'category', width: 25 },
      { header: 'Total', key: 'total', width: 10 },
      { header: 'Dentro do SLA', key: 'withinSLA', width: 15 },
      { header: 'Fora do SLA', key: 'breached', width: 15 },
      { header: 'Conformidade', key: 'compliance', width: 15 },
      { header: 'Tempo Médio', key: 'avgTime', width: 15 },
    ];

    const exportData = data.breakdown.map((b) => ({
      category: b.label,
      total: b.total.toString(),
      withinSLA: b.withinSLA.toString(),
      breached: b.breached.toString(),
      compliance: `${b.complianceRate}%`,
      avgTime: b.avgResponseTime > 0 ? `${b.avgResponseTime}h` : '-',
    }));

    const options = {
      filename: 'relatorio-sla',
      title: 'Relatório de Desempenho de SLAs',
      columns,
      data: exportData,
    };

    type === 'excel' ? exportToExcel(options) : exportToPDF(options);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!data) return null;

  const getComplianceColor = (rate: number) => {
    if (rate >= 90) return 'text-success';
    if (rate >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getComplianceBadgeVariant = (rate: number): 'default' | 'secondary' | 'destructive' => {
    if (rate >= 90) return 'default';
    if (rate >= 70) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Header with period selector and export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Desempenho de SLAs
          </h2>
          <p className="text-muted-foreground">
            Análise de conformidade e tempos de resposta
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Última semana</SelectItem>
              <SelectItem value="month">Último mês</SelectItem>
              <SelectItem value="3months">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conformidade Geral</p>
                <p className={cn('text-3xl font-bold', getComplianceColor(data.overall.complianceRate))}>
                  {data.overall.complianceRate}%
                </p>
              </div>
              <div className={cn('p-3 rounded-full', 
                data.overall.complianceRate >= 90 ? 'bg-success/10' : 
                data.overall.complianceRate >= 70 ? 'bg-warning/10' : 'bg-destructive/10'
              )}>
                <Shield className={cn('h-6 w-6', getComplianceColor(data.overall.complianceRate))} />
              </div>
            </div>
            <Progress 
              value={data.overall.complianceRate} 
              className="mt-3 h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Verificados</p>
                <p className="text-3xl font-bold">{data.overall.totalChecked}</p>
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Itens avaliados no período
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dentro do SLA</p>
                <p className="text-3xl font-bold text-success">{data.overall.withinSLA}</p>
              </div>
              <div className="p-3 rounded-full bg-success/10">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Atendidos no prazo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fora do SLA</p>
                <p className="text-3xl font-bold text-destructive">{data.overall.breached}</p>
              </div>
              <div className="p-3 rounded-full bg-destructive/10">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Prazo excedido
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trend Indicator */}
      <Card className={cn(
        'border',
        data.trends.isImproving ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'
      )}>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            {data.trends.isImproving ? (
              <TrendingUp className="h-8 w-8 text-success" />
            ) : (
              <TrendingDown className="h-8 w-8 text-warning" />
            )}
            <div>
              <p className="font-medium">
                {data.trends.isImproving ? 'Desempenho melhorando' : 'Atenção ao desempenho'}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.trends.change >= 0 ? '+' : ''}{data.trends.change}% em relação ao mês anterior
                ({data.trends.previousMonth}% → {data.trends.currentMonth}%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="monthly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monthly">Evolução Mensal</TabsTrigger>
          <TabsTrigger value="daily">Últimos 14 Dias</TabsTrigger>
          <TabsTrigger value="breakdown">Por Categoria</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle>Evolução da Conformidade</CardTitle>
              <CardDescription>Taxa de cumprimento de SLAs por mês</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthly}>
                    <defs>
                      <linearGradient id="colorCompliance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Conformidade']}
                    />
                    <Area
                      type="monotone"
                      dataKey="complianceRate"
                      stroke={COLORS.success}
                      fillOpacity={1}
                      fill="url(#colorCompliance)"
                      name="Conformidade"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>Desempenho Diário</CardTitle>
              <CardDescription>Tarefas concluídas no prazo vs atrasadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="withinSLA" stackId="a" fill={COLORS.success} name="No prazo" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="breached" stackId="a" fill={COLORS.danger} name="Atrasado" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <Card>
            <CardHeader>
              <CardTitle>Análise por Categoria</CardTitle>
              <CardDescription>Conformidade detalhada por tipo de SLA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {data.breakdown.map((item) => (
                  <div key={item.type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{item.label}</span>
                        <Badge variant={getComplianceBadgeVariant(item.complianceRate)}>
                          {item.complianceRate}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          {item.withinSLA}
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="h-4 w-4 text-destructive" />
                          {item.breached}
                        </span>
                        {item.avgResponseTime > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {item.avgResponseTime >= 24 
                              ? `${Math.round(item.avgResponseTime / 24)}d`
                              : `${item.avgResponseTime}h`
                            }
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-muted">
                      <div
                        className="bg-success transition-all"
                        style={{ width: `${item.total > 0 ? (item.withinSLA / item.total) * 100 : 100}%` }}
                      />
                      <div
                        className="bg-destructive transition-all"
                        style={{ width: `${item.total > 0 ? (item.breached / item.total) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.total} {item.total === 1 ? 'item avaliado' : 'itens avaliados'}
                    </p>
                  </div>
                ))}

                {data.breakdown.every(b => b.total === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum dado disponível para o período selecionado.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
