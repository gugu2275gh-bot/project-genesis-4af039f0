import { useParams, useNavigate, Link } from 'react-router-dom';
import { useOpportunity, useOpportunities } from '@/hooks/useOpportunities';
import { useContracts } from '@/hooks/useContracts';
import { usePayments } from '@/hooks/usePayments';
import { useTasks } from '@/hooks/useTasks';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  FileText, 
  CreditCard, 
  CheckSquare,
  Building,
  Globe,
  Clock,
  DollarSign,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  OPPORTUNITY_STATUS_LABELS,
  SERVICE_INTEREST_LABELS,
  ORIGIN_CHANNEL_LABELS,
  LANGUAGE_LABELS,
  CONTRACT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '@/types/database';

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: opportunity, isLoading, error } = useOpportunity(id);
  const { markAsLost } = useOpportunities();
  const { contracts } = useContracts();
  const { payments } = usePayments();
  const { tasks } = useTasks();

  // Filter related data
  const relatedContracts = contracts.filter(c => c.opportunity_id === id);
  const relatedPayments = payments.filter(p => p.opportunity_id === id);
  const relatedTasks = tasks.filter(t => t.related_opportunity_id === id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Oportunidade não encontrada</h2>
        <p className="text-muted-foreground mb-4">O registro solicitado não existe.</p>
        <Button onClick={() => navigate('/crm/opportunities')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Oportunidades
        </Button>
      </div>
    );
  }

  const contact = opportunity.leads?.contacts;
  const lead = opportunity.leads;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Oportunidade - ${contact?.full_name || 'Sem nome'}`}
        description={`Criada em ${format(new Date(opportunity.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={
          <Button variant="outline" onClick={() => navigate('/crm/opportunities')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status and Value */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Detalhes da Oportunidade</span>
                <StatusBadge 
                  status={opportunity.status || 'ABERTA'} 
                  label={OPPORTUNITY_STATUS_LABELS[opportunity.status || 'ABERTA']} 
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total</p>
                    <p className="font-semibold">
                      {opportunity.total_amount 
                        ? `${opportunity.currency || 'EUR'} ${opportunity.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'Não definido'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Última Atualização</p>
                    <p className="font-semibold">
                      {format(new Date(opportunity.updated_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>

              {opportunity.reason_lost && (
                <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive">
                  <p className="text-sm font-medium">Motivo da Perda:</p>
                  <p>{opportunity.reason_lost}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lead Info */}
          {lead && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações do Lead
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Serviço de Interesse</p>
                    <p className="font-semibold">
                      {SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO']}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Interesse Confirmado</p>
                    <Badge variant={lead.interest_confirmed ? 'default' : 'secondary'}>
                      {lead.interest_confirmed ? 'Sim' : 'Não'}
                    </Badge>
                  </div>
                </div>
                {lead.notes && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Observações</p>
                    <p className="mt-1">{lead.notes}</p>
                  </div>
                )}
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/crm/leads/${lead.id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Lead Completo
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contracts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contratos ({relatedContracts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relatedContracts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum contrato vinculado a esta oportunidade.
                </p>
              ) : (
                <div className="space-y-3">
                  {relatedContracts.map(contract => (
                    <div key={contract.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">{SERVICE_INTEREST_LABELS[contract.service_type]}</p>
                        <p className="text-sm text-muted-foreground">
                          {contract.total_fee 
                            ? `${contract.currency || 'EUR'} ${contract.total_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : 'Valor não definido'}
                        </p>
                      </div>
                      <StatusBadge 
                        status={contract.status || 'EM_ELABORACAO'} 
                        label={CONTRACT_STATUS_LABELS[contract.status || 'EM_ELABORACAO']} 
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pagamentos ({relatedPayments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relatedPayments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum pagamento vinculado a esta oportunidade.
                </p>
              ) : (
                <div className="space-y-3">
                  {relatedPayments.map(payment => (
                    <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">
                          {payment.currency || 'EUR'} {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(payment.created_at!), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <StatusBadge 
                        status={payment.status || 'PENDENTE'} 
                        label={PAYMENT_STATUS_LABELS[payment.status || 'PENDENTE']} 
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          {contact && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{contact.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {LANGUAGE_LABELS[contact.preferred_language || 'pt']}
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                {contact.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                
                {contact.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                
                {contact.nationality && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.nationality}</span>
                  </div>
                )}
                
                {contact.origin_channel && (
                  <div className="flex items-center gap-3">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{ORIGIN_CHANNEL_LABELS[contact.origin_channel]}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Tarefas ({relatedTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relatedTasks.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">
                  Nenhuma tarefa vinculada.
                </p>
              ) : (
                <div className="space-y-2">
                  {relatedTasks.slice(0, 5).map(task => (
                    <div key={task.id} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1 mr-2">{task.title}</span>
                      <Badge variant={task.status === 'CONCLUIDA' ? 'default' : 'secondary'} className="text-xs">
                        {TASK_STATUS_LABELS[task.status || 'PENDENTE']}
                      </Badge>
                    </div>
                  ))}
                  {relatedTasks.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{relatedTasks.length - 5} tarefas
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
