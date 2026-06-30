import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Receipt, ChevronDown, ChevronRight, CalendarPlus, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PAYMENT_STATUS_LABELS } from '@/types/database';

interface PaymentLogEntry {
  id: string;
  amount: number | null;
  currency?: string | null;
  status: string | null;
  installment_number?: number | null;
  created_at: string;
  paid_at?: string | null;
  beneficiary_contact?: { full_name?: string | null } | null;
}

interface PaymentLogPanelProps {
  payments: PaymentLogEntry[];
  defaultOpen?: boolean;
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONFIRMADO: 'default',
  PENDENTE: 'secondary',
  ATRASADO: 'destructive',
  CANCELADO: 'outline',
};

function formatAmount(amount: number | null, currency?: string | null) {
  if (amount == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount);
}

export function PaymentLogPanel({ payments, defaultOpen = true }: PaymentLogPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const sorted = [...payments].sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return db - da;
  });

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          className="w-full justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex flex-col items-start gap-1">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Log de Pagamentos
            </CardTitle>
            <CardDescription>
              Data de preenchimento e data de aprovação de cada pagamento.
            </CardDescription>
          </div>
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum pagamento registrado.
            </p>
          ) : (
            <ul className="space-y-3">
              {sorted.map(p => {
                const status = p.status || 'PENDENTE';
                return (
                  <li key={p.id} className="flex flex-col gap-2 border-l-2 border-muted pl-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANTS[status] || 'secondary'}>
                        {PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] || status}
                      </Badge>
                      <span className="text-sm font-medium">
                        {formatAmount(p.amount, p.currency)}
                      </span>
                      {p.installment_number != null && (
                        <span className="text-xs text-muted-foreground">
                          Parcela {p.installment_number}
                        </span>
                      )}
                      {p.beneficiary_contact?.full_name && (
                        <span className="text-xs text-muted-foreground">
                          • {p.beneficiary_contact.full_name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarPlus className="h-3 w-3" />
                        Preenchido em{' '}
                        {format(new Date(p.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3" />
                        {p.paid_at
                          ? `Aprovado em ${format(new Date(p.paid_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                          : 'Aprovação pendente'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
