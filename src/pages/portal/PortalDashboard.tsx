import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCases } from '@/hooks/useCases';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Calendar,
  Upload,
  ChevronDown,
  ChevronUp,
  CreditCard,
  MapPin,
  Clock
} from 'lucide-react';
import { format, Locale } from 'date-fns';
import { ptBR, es, enUS, fr } from 'date-fns/locale';
import { CaseTimeline } from '@/components/portal/CaseTimeline';
import { useState } from 'react';
import { LanguageCode } from '@/i18n';

const statusColors: Record<string, string> = {
  CONTATO_INICIAL: 'bg-info/10 text-info',
  AGUARDANDO_DOCUMENTOS: 'bg-warning/10 text-warning',
  DOCUMENTOS_EM_CONFERENCIA: 'bg-accent/10 text-accent',
  PRONTO_PARA_SUBMISSAO: 'bg-info/10 text-info',
  SUBMETIDO: 'bg-primary/10 text-primary',
  EM_ACOMPANHAMENTO: 'bg-accent/10 text-accent',
  EXIGENCIA_ORGAO: 'bg-destructive/10 text-destructive',
  AGUARDANDO_RECURSO: 'bg-warning/10 text-warning',
  DISPONIVEL_RETIRADA_TIE: 'bg-green-100 text-green-800',
  AGUARDANDO_CITA_RETIRADA: 'bg-blue-100 text-blue-800',
  TIE_RETIRADO: 'bg-green-100 text-green-800',
  ENCERRADO_APROVADO: 'bg-success/10 text-success',
  ENCERRADO_NEGADO: 'bg-destructive/10 text-destructive',
};

const dateLocales: Record<LanguageCode, Locale> = {
  pt: ptBR,
  es: es,
  en: enUS,
  fr: fr,
};

// Service labels by language
const getServiceLabel = (serviceType: string, t: any) => {
  const map: Record<string, keyof typeof t.services> = {
    VISTO_ESTUDANTE: 'student_visa',
    VISTO_TRABALHO: 'work_visa',
    REAGRUPAMENTO: 'reunification',
    RENOVACAO_RESIDENCIA: 'residence_renewal',
    NACIONALIDADE_RESIDENCIA: 'nationality_residence',
    NACIONALIDADE_CASAMENTO: 'nationality_marriage',
    OUTRO: 'other',
  };
  return t.services[map[serviceType] || 'other'];
};

// Status labels by language
const getStatusLabel = (status: string, t: any) => {
  const statusMap: Record<string, string> = {
    CONTATO_INICIAL: 'Initial Contact',
    AGUARDANDO_DOCUMENTOS: t.timeline.docsWaiting,
    DOCUMENTOS_EM_CONFERENCIA: t.documents.status.reviewing,
    PRONTO_PARA_SUBMISSAO: t.timeline.submissionWaiting,
    SUBMETIDO: t.timeline.submission,
    EM_ACOMPANHAMENTO: t.timeline.tracking,
    EXIGENCIA_ORGAO: t.timeline.trackingRequirement,
    AGUARDANDO_RECURSO: t.timeline.trackingAppeal,
    DISPONIVEL_RETIRADA_TIE: 'TIE Disponível',
    AGUARDANDO_CITA_RETIRADA: 'Cita Agendada',
    TIE_RETIRADO: 'TIE Retirado',
    ENCERRADO_APROVADO: t.timeline.approved,
    ENCERRADO_NEGADO: t.timeline.denied,
  };
  return statusMap[status] || status;
};

export default function PortalDashboard() {
  const { user, profile } = useAuth();
  const { t, language, formatMessage } = useLanguage();
  const { cases, isLoading } = useCases();
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const dateLocale = dateLocales[language];

  // Filter cases for current client
  const myCases = cases.filter(c => c.client_user_id === user?.id);

  const activeCases = myCases.filter(c => 
    !c.technical_status?.startsWith('ENCERRADO')
  );
  const closedCases = myCases.filter(c => 
    c.technical_status?.startsWith('ENCERRADO')
  );

  const pendingDocsCases = myCases.filter(c => 
    c.technical_status === 'AGUARDANDO_DOCUMENTOS'
  );

  // Cases with TIE ready for pickup
  const tieReadyCases = myCases.filter(c => 
    ['DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA'].includes(c.technical_status || '')
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          {formatMessage(t.portal.welcome, { name: profile?.full_name?.split(' ')[0] || 'Cliente' })}
        </h1>
        <p className="text-muted-foreground">
          {t.portal.trackProgress}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCases.length}</p>
              <p className="text-sm text-muted-foreground">{t.portal.activeCases}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-lg bg-warning/10">
              <Upload className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingDocsCases.length}</p>
              <p className="text-sm text-muted-foreground">{t.portal.pendingDocs}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-lg bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{closedCases.length}</p>
              <p className="text-sm text-muted-foreground">{t.portal.completedCases}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert for pending documents */}
      {pendingDocsCases.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <AlertCircle className="h-6 w-6 text-warning shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t.portal.pendingDocsAlert}</p>
              <p className="text-sm text-muted-foreground">
                {formatMessage(t.portal.pendingDocsMessage, { count: pendingDocsCases.length })}
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/portal/documents">
                {t.portal.sendDocuments}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* TIE Ready Alert */}
      {tieReadyCases.map((caseItem) => (
        <Card key={caseItem.id} className="border-green-500/50 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
                <CreditCard className="h-6 w-6 text-green-700 dark:text-green-300" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-green-800 dark:text-green-200">
                  🎉 Seu TIE está disponível para retirada!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  {getServiceLabel(caseItem.service_type, t)}
                </p>
                
                {/* TIE Pickup Details */}
                <div className="mt-3 space-y-2">
                  {(caseItem as any).tie_lot_number && (
                    <p className="text-sm flex items-center gap-2">
                      <span className="font-medium">Lote:</span>
                      <span className="font-mono">{(caseItem as any).tie_lot_number}</span>
                    </p>
                  )}
                  
                  {(caseItem as any).tie_pickup_appointment_date && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Cita Agendada
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        {format(new Date((caseItem as any).tie_pickup_appointment_date), 'dd/MM/yyyy', { locale: dateLocale })}
                        {(caseItem as any).tie_pickup_appointment_time && (
                          <span> às {(caseItem as any).tie_pickup_appointment_time}</span>
                        )}
                      </p>
                      {(caseItem as any).tie_pickup_location && (
                        <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {(caseItem as any).tie_pickup_location}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {!(caseItem as any).tie_pickup_appointment_date && (caseItem as any).tie_estimated_ready_date && (
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Disponível a partir de {format(new Date((caseItem as any).tie_estimated_ready_date), 'dd/MM/yyyy', { locale: dateLocale })}
                    </p>
                  )}
                </div>

                {/* Instructions */}
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium">Documentos necessários para retirada:</p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <li>• Passaporte original</li>
                    <li>• Resguardo de huellas</li>
                    <li>• Comprovante de pagamento Taxa 790</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Cases List */}
      <Card>
        <CardHeader>
          <CardTitle>{t.portal.myCases}</CardTitle>
          <CardDescription>
            {t.portal.myCasesDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {myCases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.portal.noCases}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  {/* Case Header - Clickable to expand */}
                  <div 
                    className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setExpandedCase(expandedCase === caseItem.id ? null : caseItem.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">
                          {getServiceLabel(caseItem.service_type, t)}
                        </h3>
                        <Badge 
                          variant="outline" 
                          className={statusColors[caseItem.technical_status || ''] || 'bg-muted'}
                        >
                          {getStatusLabel(caseItem.technical_status || '', t)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {t.portal.openedAt} {format(new Date(caseItem.created_at!), "dd/MM/yyyy", { locale: dateLocale })}
                        </span>
                        {/* Mostrar Expediente como ID principal se disponível, senão protocolo */}
                        {(caseItem as any).expediente_number ? (
                          <span className="font-mono font-medium text-primary">
                            Expediente: {(caseItem as any).expediente_number}
                          </span>
                        ) : caseItem.protocol_number && (
                          <span>{t.portal.protocol}: {caseItem.protocol_number}</span>
                        )}
                      </div>

                      {/* Link para consultar expediente se disponível */}
                      {(caseItem as any).expediente_number && (
                        <div className="mt-2 p-2 bg-primary/5 rounded border border-primary/20">
                          <p className="text-xs text-muted-foreground">
                            Acompanhe seu processo em{' '}
                            <a 
                              href="https://sede.administracionespublicas.gob.es" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              sede.administracionespublicas.gob.es
                            </a>
                          </p>
                        </div>
                      )}

                      {caseItem.decision_result && caseItem.decision_result !== 'EM_ANDAMENTO' && (
                        <div className="mt-2">
                          <Badge 
                            variant={caseItem.decision_result === 'APROVADO' ? 'default' : 'destructive'}
                            className={caseItem.decision_result === 'APROVADO' ? 'bg-success' : ''}
                          >
                            {caseItem.decision_result === 'APROVADO' ? t.timeline.approved : t.timeline.denied}
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button 
                        asChild 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link to={`/portal/documents?case=${caseItem.id}`}>
                          <Upload className="h-4 w-4 mr-1" />
                          {t.portal.documents}
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm">
                        {expandedCase === caseItem.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Timeline */}
                  {expandedCase === caseItem.id && (
                    <div className="border-t bg-muted/30 p-6">
                      <h4 className="font-medium mb-4 text-sm text-muted-foreground">
                        {t.portal.timeline}
                      </h4>
                      <CaseTimeline
                        technicalStatus={caseItem.technical_status}
                        submissionDate={caseItem.submission_date}
                        decisionDate={caseItem.decision_date}
                        decisionResult={caseItem.decision_result}
                        protocolNumber={caseItem.protocol_number}
                        contractSigned={true}
                        paymentConfirmed={true}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
