import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const statusBadgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground border-muted',
        success: 'bg-success/10 text-success border-success/30',
        warning: 'bg-warning/10 text-warning border-warning/30',
        destructive: 'bg-destructive/10 text-destructive border-destructive/30',
        info: 'bg-info/10 text-info border-info/30',
        accent: 'bg-accent/10 text-accent border-accent/30',
        primary: 'bg-primary/10 text-primary border-primary/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  children?: React.ReactNode;
  status?: string;
  label?: string;
}

export function StatusBadge({ className, variant, children, status, label, ...props }: StatusBadgeProps) {
  // Auto-detect variant from status if not provided
  const computedVariant = variant || (status ? getVariantFromStatus(status) : 'default');
  
  return (
    <span className={cn(statusBadgeVariants({ variant: computedVariant }), className)} {...props}>
      {children || label || status}
    </span>
  );
}

// Get variant based on any status type
function getVariantFromStatus(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'accent' | 'primary' {
  // Lead status
  if (status === 'NOVO') return 'info';
  if (status === 'DADOS_INCOMPLETOS' || status === 'INTERESSE_PENDENTE') return 'warning';
  if (status === 'INTERESSE_CONFIRMADO') return 'success';
  if (status === 'ARQUIVADO_SEM_RETORNO') return 'default';
  
  // Opportunity status
  if (status === 'ABERTA') return 'info';
  if (status === 'CONTRATO_EM_ELABORACAO' || status === 'CONTRATO_ENVIADO') return 'warning';
  if (status === 'CONTRATO_ASSINADO' || status === 'PAGAMENTO_PENDENTE') return 'accent';
  if (status === 'FECHADA_GANHA') return 'success';
  if (status === 'FECHADA_PERDIDA') return 'destructive';
  if (status === 'CONGELADA') return 'default';
  
  // Technical status
  if (status === 'CONTATO_INICIAL' || status === 'AGUARDANDO_DOCUMENTOS') return 'info';
  if (status === 'DOCUMENTOS_EM_CONFERENCIA') return 'warning';
  if (status === 'PRONTO_PARA_SUBMISSAO') return 'accent';
  if (status === 'SUBMETIDO' || status === 'EM_ACOMPANHAMENTO') return 'primary';
  if (status === 'EXIGENCIA_ORGAO' || status === 'AGUARDANDO_RECURSO') return 'warning';
  if (status === 'ENCERRADO_APROVADO') return 'success';
  if (status === 'ENCERRADO_NEGADO') return 'destructive';
  
  // Payment status
  if (status === 'PENDENTE') return 'warning';
  if (status === 'EM_ANALISE') return 'info';
  if (status === 'CONFIRMADO') return 'success';
  if (status === 'PARCIAL') return 'warning';
  if (status === 'ESTORNADO') return 'destructive';
  
  // Document status
  if (status === 'NAO_ENVIADO') return 'default';
  if (status === 'ENVIADO') return 'info';
  if (status === 'EM_CONFERENCIA') return 'warning';
  if (status === 'APROVADO') return 'success';
  if (status === 'REJEITADO') return 'destructive';
  
  // Task status
  if (status === 'EM_ANDAMENTO') return 'info';
  if (status === 'CONCLUIDA') return 'success';
  if (status === 'CANCELADA') return 'default';
  
  // Contract status
  if (status === 'EM_ELABORACAO' || status === 'EM_REVISAO') return 'warning';
  if (status === 'ENVIADO') return 'info';
  if (status === 'ASSINADO') return 'success';
  if (status === 'CANCELADO') return 'destructive';
  
  // Channel badges
  if (status === 'WHATSAPP') return 'success';
  if (status === 'EMAIL') return 'info';
  if (status === 'INSTAGRAM' || status === 'FACEBOOK') return 'accent';
  if (status === 'SITE') return 'primary';
  
  // Requirement status
  if (status === 'RESPONDIDA') return 'success';
  if (status === 'ENCERRADA') return 'default';
  
  // Sector badges
  if (status === 'ESTUDANTE') return 'info';
  if (status === 'TRABALHO') return 'accent';
  if (status === 'REAGRUPAMENTO') return 'warning';
  if (status === 'RENOVACAO') return 'primary';
  if (status === 'NACIONALIDADE') return 'success';
  
  // Decision result
  if (status === 'NEGADO') return 'destructive';
  
  // Service interest badges
  if (status === 'VISTO_ESTUDANTE') return 'info';
  if (status === 'VISTO_TRABALHO') return 'accent';
  if (status === 'REAGRUPAMENTO') return 'warning';
  if (status === 'RENOVACAO_RESIDENCIA') return 'primary';
  if (status === 'NACIONALIDADE_RESIDENCIA' || status === 'NACIONALIDADE_CASAMENTO') return 'success';
  
  return 'default';
}

// Legacy helper functions (kept for backwards compatibility)
export function getLeadStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' {
  return getVariantFromStatus(status) as any;
}

export function getOpportunityStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'accent' | 'primary' {
  return getVariantFromStatus(status);
}

export function getTechnicalStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'accent' | 'primary' {
  return getVariantFromStatus(status);
}

export function getPaymentStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' {
  return getVariantFromStatus(status) as any;
}

export function getDocumentStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' {
  return getVariantFromStatus(status) as any;
}

export function getTaskStatusVariant(status: string): 'default' | 'success' | 'warning' | 'info' | 'destructive' {
  return getVariantFromStatus(status) as any;
}