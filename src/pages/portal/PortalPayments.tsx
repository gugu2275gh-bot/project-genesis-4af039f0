import { useAuth } from '@/contexts/AuthContext';
import { useClientPayments } from '@/hooks/useClientPayments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  ExternalLink,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS 
} from '@/types/database';
import { downloadReceipt, generateReceiptNumber } from '@/lib/generate-receipt';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  PENDENTE: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  EM_ANALISE: { icon: Clock, color: 'text-info', bg: 'bg-info/10' },
  CONFIRMADO: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  PARCIAL: { icon: AlertCircle, color: 'text-accent', bg: 'bg-accent/10' },
  ESTORNADO: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function PortalPayments() {
  const { user } = useAuth();
  const { data: payments = [], isLoading } = useClientPayments();

  const pendingPayments = payments.filter(p => p.status === 'PENDENTE' || p.status === 'PARCIAL');
  const completedPayments = payments.filter(p => p.status === 'CONFIRMADO');
  const totalPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Pagamentos</h1>
        <p className="text-muted-foreground">
          Acompanhe suas faturas e realize pagamentos
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-lg bg-warning/20">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pendente</p>
              <p className="text-2xl font-bold">
                EUR {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/50 bg-success/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-lg bg-success/20">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Pago</p>
              <p className="text-2xl font-bold">
                EUR {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pagamentos</CardTitle>
          <CardDescription>
            Todas as suas faturas e transações
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Você não possui pagamentos registrados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => {
                const status = payment.status || 'PENDENTE';
                const config = statusConfig[status];
                const StatusIcon = config.icon;

                return (
                  <div
                    key={payment.id}
                    className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border"
                  >
                    <div className={`p-3 rounded-lg ${config.bg} self-start`}>
                      <StatusIcon className={`h-5 w-5 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <h4 className="font-medium">
                            {payment.currency || 'EUR'} {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Criado em {format(new Date(payment.created_at!), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge className={`${config.bg} ${config.color} border-0`}>
                          {PAYMENT_STATUS_LABELS[status]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3 text-sm">
                        {payment.payment_method && (
                          <div>
                            <p className="text-muted-foreground">Método</p>
                            <p className="font-medium">
                              {PAYMENT_METHOD_LABELS[payment.payment_method]}
                            </p>
                          </div>
                        )}
                        {payment.paid_at && (
                          <div>
                            <p className="text-muted-foreground">Pago em</p>
                            <p className="font-medium">
                              {format(new Date(payment.paid_at), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        )}
                        {payment.transaction_id && (
                          <div>
                            <p className="text-muted-foreground">Transação</p>
                            <p className="font-medium font-mono text-xs">
                              {payment.transaction_id}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4">
                        {status === 'PENDENTE' && payment.payment_link && (
                          <Button asChild>
                            <a href={payment.payment_link} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Pagar Agora
                            </a>
                          </Button>
                        )}
                        {status === 'CONFIRMADO' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              downloadReceipt({
                                receiptNumber: generateReceiptNumber(),
                                clientName: user?.email || 'Cliente',
                                amount: payment.amount,
                                currency: payment.currency || 'EUR',
                                paymentMethod: PAYMENT_METHOD_LABELS[payment.payment_method || 'OUTRO'],
                                paymentDate: payment.paid_at ? format(new Date(payment.paid_at), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'),
                                transactionId: payment.transaction_id || undefined,
                                description: 'Serviços de assessoria em extranjería',
                              });
                            }}
                          >
                            <Receipt className="h-4 w-4 mr-2" />
                            Ver Recibo
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
