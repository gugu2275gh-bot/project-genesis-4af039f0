import { useNPS } from '@/hooks/useNPS';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatsCard } from '@/components/ui/stats-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Star, TrendingUp, TrendingDown, Users, MessageSquare } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SERVICE_INTEREST_LABELS } from '@/types/database';

export default function NPSReport() {
  const { surveys, isLoading, calculateMetrics } = useNPS();
  
  const metrics = calculateMetrics(surveys);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const distributionData = [
    { name: 'Promotores (9-10)', value: metrics.promoters, color: 'hsl(142, 76%, 36%)' },
    { name: 'Neutros (7-8)', value: metrics.passives, color: 'hsl(45, 93%, 47%)' },
    { name: 'Detratores (0-6)', value: metrics.detractors, color: 'hsl(0, 84%, 60%)' },
  ].filter(d => d.value > 0);

  // Score distribution for bar chart
  const scoreDistribution = [...Array(11)].map((_, score) => ({
    score: score.toString(),
    count: surveys.filter(s => s.score === score).length,
  }));

  const getNPSColor = (nps: number) => {
    if (nps >= 50) return 'text-green-600';
    if (nps >= 0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getNPSLabel = (nps: number) => {
    if (nps >= 75) return 'Excelente';
    if (nps >= 50) return 'Muito Bom';
    if (nps >= 0) return 'Razoável';
    return 'Precisa Melhorar';
  };

  return (
    <div className="space-y-6">
      {/* NPS Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">NPS Score</CardTitle>
            <CardDescription>Net Promoter Score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-bold ${getNPSColor(metrics.npsScore)}`}>
                {metrics.npsScore}
              </div>
              <div className="space-y-1">
                <Badge variant={metrics.npsScore >= 50 ? 'default' : metrics.npsScore >= 0 ? 'secondary' : 'destructive'}>
                  {getNPSLabel(metrics.npsScore)}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Baseado em {metrics.total} avaliações
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <StatsCard
          title="Média de Notas"
          value={metrics.averageScore.toFixed(1)}
          description="Nota média geral"
          icon={Star}
        />

        <StatsCard
          title="Total de Respostas"
          value={metrics.total}
          description={`${metrics.promotersPercent}% promotores`}
          icon={Users}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição NPS</CardTitle>
            <CardDescription>Promotores, Neutros e Detratores</CardDescription>
          </CardHeader>
          <CardContent>
            {distributionData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Sem dados disponíveis
              </div>
            )}
            
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-600" />
                <span className="text-sm">{metrics.promotersPercent}% Promotores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm">{metrics.passivesPercent}% Neutros</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">{metrics.detractorsPercent}% Detratores</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Notas</CardTitle>
            <CardDescription>Quantidade por nota</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="score" />
                  <YAxis />
                  <Tooltip />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Feedbacks Recentes
          </CardTitle>
          <CardDescription>Últimos comentários dos clientes</CardDescription>
        </CardHeader>
        <CardContent>
          {surveys.filter(s => s.comment).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum comentário registrado ainda
            </div>
          ) : (
            <div className="space-y-4">
              {surveys
                .filter(s => s.comment)
                .slice(0, 10)
                .map((survey) => (
                  <div key={survey.id} className="p-4 rounded-lg border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={(survey.score || 0) >= 9 ? 'default' : (survey.score || 0) >= 7 ? 'secondary' : 'destructive'}
                        >
                          Nota: {survey.score}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {survey.service_cases?.opportunities?.leads?.contacts?.full_name || 'Cliente'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {survey.created_at && format(new Date(survey.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm">{survey.comment}</p>
                    <span className="text-xs text-muted-foreground">
                      {SERVICE_INTEREST_LABELS[survey.service_cases?.service_type as keyof typeof SERVICE_INTEREST_LABELS] || survey.service_cases?.service_type}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
