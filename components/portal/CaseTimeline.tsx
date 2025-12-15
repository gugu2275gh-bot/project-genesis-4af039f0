import { Check, Circle, Clock, FileText, Send, CreditCard, Briefcase, Award, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface CaseTimelineProps {
  technicalStatus: string | null;
  submissionDate?: string | null;
  decisionDate?: string | null;
  decisionResult?: string | null;
  protocolNumber?: string | null;
  contractSigned?: boolean;
  paymentConfirmed?: boolean;
}

const STATUS_ORDER = [
  'CONTATO_INICIAL',
  'AGUARDANDO_DOCUMENTOS',
  'DOCUMENTOS_EM_CONFERENCIA',
  'PRONTO_PARA_SUBMISSAO',
  'SUBMETIDO',
  'EM_ACOMPANHAMENTO',
  'ENCERRADO_APROVADO',
  'ENCERRADO_NEGADO',
];

export function CaseTimeline({
  technicalStatus,
  submissionDate,
  decisionDate,
  decisionResult,
  protocolNumber,
  contractSigned = true,
  paymentConfirmed = true,
}: CaseTimelineProps) {
  const { t, language } = useLanguage();
  
  const currentStatusIndex = STATUS_ORDER.indexOf(technicalStatus || 'CONTATO_INICIAL');
  const isExigencia = technicalStatus === 'EXIGENCIA_ORGAO';
  const isRecurso = technicalStatus === 'AGUARDANDO_RECURSO';
  const isEncerrado = technicalStatus?.startsWith('ENCERRADO');

  const getStepStatus = (stepIndex: number): 'completed' | 'current' | 'pending' => {
    if (isEncerrado && stepIndex <= currentStatusIndex) return 'completed';
    if (stepIndex < currentStatusIndex) return 'completed';
    if (stepIndex === currentStatusIndex) return 'current';
    return 'pending';
  };

  const steps = [
    {
      id: 'contract',
      label: t.timeline.contractSigned,
      description: t.timeline.contractDescription,
      status: contractSigned ? 'completed' as const : 'pending' as const,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: 'payment',
      label: t.timeline.paymentConfirmed,
      description: t.timeline.paymentDescription,
      status: paymentConfirmed ? 'completed' as const : 'pending' as const,
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      id: 'docs',
      label: t.timeline.documentation,
      description: currentStatusIndex >= 2 ? t.timeline.docsComplete : t.timeline.docsWaiting,
      status: getStepStatus(2),
      icon: <Briefcase className="h-4 w-4" />,
    },
    {
      id: 'submission',
      label: t.timeline.submission,
      description: protocolNumber ? `${t.portal.protocol}: ${protocolNumber}` : t.timeline.submissionWaiting,
      date: submissionDate || undefined,
      status: getStepStatus(4),
      icon: <Send className="h-4 w-4" />,
    },
    {
      id: 'tracking',
      label: t.timeline.tracking,
      description: isExigencia ? t.timeline.trackingRequirement : isRecurso ? t.timeline.trackingAppeal : t.timeline.trackingAnalysis,
      status: getStepStatus(5),
      icon: <Clock className="h-4 w-4" />,
    },
    {
      id: 'decision',
      label: t.timeline.decision,
      description: decisionResult === 'APROVADO' ? t.timeline.approved : decisionResult === 'NEGADO' ? t.timeline.denied : t.timeline.decisionWaiting,
      date: decisionDate || undefined,
      status: isEncerrado ? 'completed' as const : 'pending' as const,
      icon: decisionResult === 'APROVADO' ? <Award className="h-4 w-4" /> : decisionResult === 'NEGADO' ? <XCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />,
    },
  ];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : language === 'fr' ? 'fr-FR' : 'pt-BR');
  };

  return (
    <div className="relative">
      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.id} className="relative flex gap-4">
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "absolute left-[15px] top-[32px] w-0.5 h-full -translate-x-1/2",
                  step.status === 'completed' ? "bg-success" : "bg-border"
                )}
              />
            )}

            {/* Icon */}
            <div
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                step.status === 'completed' && "bg-success border-success text-success-foreground",
                step.status === 'current' && "bg-primary border-primary text-primary-foreground animate-pulse",
                step.status === 'pending' && "bg-muted border-border text-muted-foreground"
              )}
            >
              {step.status === 'completed' ? (
                <Check className="h-4 w-4" />
              ) : (
                step.icon
              )}
            </div>

            {/* Content */}
            <div className="pb-8 pt-1">
              <p
                className={cn(
                  "font-medium leading-none",
                  step.status === 'completed' && "text-success",
                  step.status === 'current' && "text-primary",
                  step.status === 'pending' && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {step.description}
              </p>
              {step.date && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(step.date)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
