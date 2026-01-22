import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  FileText,
  CreditCard,
  Users,
  FileCheck,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { useSLAMonitoring, SLABreachItem } from '@/hooks/useSLAMonitoring';
import { cn } from '@/lib/utils';

const TYPE_ICONS = {
  lead: Users,
  contract: FileText,
  payment: CreditCard,
  requirement: AlertCircle,
  document: FileCheck,
};

const getBreachRoute = (breach: SLABreachItem): string => {
  switch (breach.type) {
    case 'lead':
      return breach.relatedId ? `/crm/leads/${breach.relatedId}` : '/crm/leads';
    case 'contract':
      return breach.relatedId ? `/contracts/${breach.relatedId}` : '/contracts';
    case 'payment':
      return '/payments';
    case 'requirement':
    case 'document':
      return breach.relatedId ? `/cases/${breach.relatedId}` : '/cases';
    default:
      return '/dashboard';
  }
};

export default function SLAMonitoringPanel() {
  const { data: slaData, isLoading } = useSLAMonitoring();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  if (!slaData) return null;

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getHealthBgColor = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return 'Saudável';
    if (score >= 50) return 'Atenção';
    return 'Crítico';
  };

  const criticalCount = slaData.breaches.filter((b) => b.severity === 'critical').length;
  const warningCount = slaData.breaches.filter((b) => b.severity === 'warning').length;

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Monitoramento de SLAs
            </CardTitle>
            <CardDescription>
              Visão em tempo real do cumprimento de prazos
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={cn('text-2xl font-bold', getHealthColor(slaData.healthScore))}>
                {slaData.healthScore}%
              </div>
              <div className="text-xs text-muted-foreground">
                {getHealthLabel(slaData.healthScore)}
              </div>
            </div>
            <div className="w-24 h-24 relative">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${slaData.healthScore * 2.51} 251`}
                  className={getHealthColor(slaData.healthScore)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className={cn('h-8 w-8', getHealthColor(slaData.healthScore))} />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Leads s/ resposta
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.leadsAwaitingResponse}</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Dados incompletos
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.leadsIncomplete}</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="h-4 w-4" />
              Contratos pend.
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.contractsPendingSignature}</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CreditCard className="h-4 w-4" />
              Pgtos pendentes
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.paymentsPending}</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4" />
              Exigências
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.requirementsUrgent}</div>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileCheck className="h-4 w-4" />
              Docs p/ revisar
            </div>
            <div className="text-2xl font-bold mt-1">{slaData.documentsPendingReview}</div>
          </div>
        </div>

        {/* Breach Summary */}
        {slaData.breaches.length > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {slaData.breaches.length} SLA(s) em alerta
              </p>
              <p className="text-sm text-muted-foreground">
                {criticalCount > 0 && (
                  <span className="text-destructive font-medium">{criticalCount} crítico(s)</span>
                )}
                {criticalCount > 0 && warningCount > 0 && ' • '}
                {warningCount > 0 && (
                  <span className="text-warning font-medium">{warningCount} aviso(s)</span>
                )}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/tasks">Ver tarefas</Link>
            </Button>
          </div>
        )}

        {/* Breaches List */}
        {slaData.breaches.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Detalhes dos Alertas</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {slaData.breaches.map((breach) => {
                const Icon = TYPE_ICONS[breach.type];
                const route = getBreachRoute(breach);
                return (
                  <div
                    key={breach.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      breach.severity === 'critical'
                        ? 'bg-destructive/5 border-destructive/30'
                        : 'bg-warning/5 border-warning/30'
                    )}
                  >
                    <div
                      className={cn(
                        'p-2 rounded-full',
                        breach.severity === 'critical' ? 'bg-destructive/10' : 'bg-warning/10'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          breach.severity === 'critical' ? 'text-destructive' : 'text-warning'
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{breach.title}</p>
                        <Badge
                          variant={breach.severity === 'critical' ? 'destructive' : 'secondary'}
                          className="shrink-0"
                        >
                          {breach.severity === 'critical' ? 'Crítico' : 'Aviso'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{breach.description}</p>
                    </div>
                    {breach.hoursOverdue > 0 && (
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {breach.hoursOverdue >= 24
                            ? `${Math.floor(breach.hoursOverdue / 24)}d`
                            : `${breach.hoursOverdue}h`}
                        </div>
                      </div>
                    )}
                    <Button asChild variant="ghost" size="icon" className="shrink-0">
                      <Link to={route}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All Clear */}
        {slaData.breaches.length === 0 && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
              <Shield className="h-8 w-8 text-success" />
            </div>
            <p className="font-medium text-success">Todos os SLAs em dia!</p>
            <p className="text-sm text-muted-foreground">
              Nenhum prazo crítico ou em atraso no momento.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
