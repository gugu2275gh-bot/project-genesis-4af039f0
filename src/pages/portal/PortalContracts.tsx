import { useAuth } from '@/contexts/AuthContext';
import { useContracts } from '@/hooks/useContracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock,
  PenTool,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  SERVICE_INTEREST_LABELS, 
  CONTRACT_STATUS_LABELS,
  LANGUAGE_LABELS 
} from '@/types/database';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  EM_ELABORACAO: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
  EM_REVISAO: { icon: Clock, color: 'text-info', bg: 'bg-info/10' },
  ENVIADO: { icon: PenTool, color: 'text-warning', bg: 'bg-warning/10' },
  ASSINADO: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  CANCELADO: { icon: FileText, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function PortalContracts() {
  const { user } = useAuth();
  const { contracts, isLoading } = useContracts();

  // In a real app, you'd filter contracts by the client's opportunities
  // For now, we'll show all contracts (you can add proper filtering later)
  const myContracts = contracts;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Contratos</h1>
        <p className="text-muted-foreground">
          Visualize e acompanhe seus contratos
        </p>
      </div>

      {myContracts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Nenhum contrato encontrado</h2>
            <p className="text-muted-foreground">
              Você não possui contratos registrados no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {myContracts.map((contract) => {
            const status = contract.status || 'EM_ELABORACAO';
            const config = statusConfig[status];
            const StatusIcon = config.icon;

            return (
              <Card key={contract.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${config.bg}`}>
                        <StatusIcon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {SERVICE_INTEREST_LABELS[contract.service_type]}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Criado em {format(new Date(contract.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={`${config.bg} ${config.color} border-0`}>
                      {CONTRACT_STATUS_LABELS[status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="font-semibold">
                        {contract.total_fee 
                          ? `${contract.currency || 'EUR'} ${contract.total_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '-'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Idioma</p>
                      <p className="font-semibold">
                        {contract.language ? LANGUAGE_LABELS[contract.language] : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Condições</p>
                      <p className="font-semibold truncate">
                        {contract.installment_conditions || '-'}
                      </p>
                    </div>
                    {contract.signed_at && (
                      <div>
                        <p className="text-sm text-muted-foreground">Assinado em</p>
                        <p className="font-semibold">
                          {format(new Date(contract.signed_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>

                  {contract.scope_summary && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Escopo do Serviço</p>
                      <p className="text-sm">{contract.scope_summary}</p>
                    </div>
                  )}

                  {contract.refund_policy_text && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Política de Reembolso</p>
                      <p className="text-sm">{contract.refund_policy_text}</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    {status === 'ENVIADO' && contract.external_signature_id && (
                      <Button>
                        <PenTool className="h-4 w-4 mr-2" />
                        Assinar Contrato
                      </Button>
                    )}
                    {status === 'ASSINADO' && (
                      <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Baixar Contrato
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
