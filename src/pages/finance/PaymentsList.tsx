import { useState, useMemo } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useOpportunities } from '@/hooks/useOpportunities';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Check, DollarSign, AlertTriangle, CalendarClock, RefreshCw, FileText } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format, differenceInDays, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { RescheduleDialog } from '@/components/payments/RescheduleDialog';
import { RefinanceDialog } from '@/components/payments/RefinanceDialog';
import { downloadReceipt, generateReceiptNumber } from '@/lib/generate-receipt';

export default function PaymentsList() {
  const { payments, isLoading, createPayment, confirmPayment } = usePayments();
  const { opportunities } = useOpportunities();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    opportunity_id: '',
    amount: '',
    payment_method: 'PIX' as any,
    payment_link: '',
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [paidAtDate, setPaidAtDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [reschedulePayment, setReschedulePayment] = useState<typeof payments[0] | null>(null);
  const [showRefinanceDialog, setShowRefinanceDialog] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const availableOpportunities = opportunities.filter(o => 
    o.status === 'CONTRATO_ASSINADO' || o.status === 'PAGAMENTO_PENDENTE'
  );

  const filteredPayments = payments.filter(p => {
    const matchesSearch = 
      p.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (!newPayment.opportunity_id || !newPayment.amount) return;
    await createPayment.mutateAsync({
      opportunity_id: newPayment.opportunity_id,
      amount: parseFloat(newPayment.amount),
      payment_method: newPayment.payment_method,
      payment_link: newPayment.payment_link || null,
      status: 'PENDENTE',
    });
    setIsDialogOpen(false);
    setNewPayment({
      opportunity_id: '',
      amount: '',
      payment_method: 'PIX',
      payment_link: '',
    });
  };

  const handleConfirm = async (id: string) => {
    const paidAtDateTime = new Date(paidAtDate + 'T' + format(new Date(), 'HH:mm:ss'));
    await confirmPayment.mutateAsync({ id, transactionId, paidAt: paidAtDateTime.toISOString() });
    setConfirmingId(null);
    setTransactionId('');
    setPaidAtDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Helper to check if payment is overdue
  const getOverdueInfo = (payment: typeof payments[0]) => {
    if (payment.status !== 'PENDENTE' || !payment.due_date) return null;
    const dueDate = new Date(payment.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isBefore(dueDate, today)) {
      const daysOverdue = differenceInDays(today, dueDate);
      return { isOverdue: true, daysOverdue };
    }
    return null;
  };

  const columns: Column<typeof payments[0]>[] = [
    {
      key: 'client',
      header: 'Cliente',
      cell: (payment) => (
        <div>
          <div className="font-medium">{payment.opportunities?.leads?.contacts?.full_name}</div>
          <div className="text-sm text-muted-foreground">{payment.opportunities?.leads?.contacts?.email}</div>
        </div>
      ),
    },
    {
      key: 'installment',
      header: 'Parcela',
      cell: (payment) => {
        if (!payment.installment_number) return '-';
        // Get total installments from contract
        const total = payments.filter(p => 
          p.contract_id === payment.contract_id
        ).length;
        return (
          <span className="font-medium">
            {payment.installment_number}/{total || payment.installment_number}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Valor',
      cell: (payment) => (
        <div className="font-medium">
          {new Intl.NumberFormat('pt-BR', { 
            style: 'currency', 
            currency: payment.currency || 'EUR' 
          }).format(payment.amount)}
        </div>
      ),
    },
    {
      key: 'due_date',
      header: 'Vencimento',
      cell: (payment) => {
        if (!payment.due_date) return '-';
        const overdueInfo = getOverdueInfo(payment);
        return (
          <div className={cn(
            "flex items-center gap-2",
            overdueInfo?.isOverdue && "text-destructive font-medium"
          )}>
            {overdueInfo?.isOverdue && (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span>
              {format(new Date(payment.due_date), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
            {overdueInfo?.isOverdue && (
              <span className="text-xs">
                ({overdueInfo.daysOverdue}d atraso)
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'payment_method',
      header: 'Método',
      cell: (payment) => PAYMENT_METHOD_LABELS[payment.payment_method || 'OUTRO'],
    },
    {
      key: 'status',
      header: 'Status',
      cell: (payment) => {
        const overdueInfo = getOverdueInfo(payment);
        if (overdueInfo?.isOverdue) {
          return (
            <StatusBadge 
              status="CRITICAL" 
              label={`Vencido há ${overdueInfo.daysOverdue}d`} 
            />
          );
        }
        return (
          <StatusBadge 
            status={payment.status || 'PENDENTE'} 
            label={PAYMENT_STATUS_LABELS[payment.status || 'PENDENTE']} 
          />
        );
      },
    },
    {
      key: 'paid_at',
      header: 'Pago em',
      cell: (payment) => payment.paid_at 
        ? format(new Date(payment.paid_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
        : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (payment) => (
        <div className="flex items-center gap-1">
          {payment.status === 'PENDENTE' && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingId(payment.id);
                }}
              >
                <Check className="h-4 w-4 mr-1" />
                Confirmar
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  setReschedulePayment(payment);
                }}
                title="Prorrogar"
              >
                <CalendarClock className="h-4 w-4" />
              </Button>
            </>
          )}
          {payment.status === 'CONFIRMADO' && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                const clientName = payment.opportunities?.leads?.contacts?.full_name || 'Cliente';
                downloadReceipt({
                  receiptNumber: generateReceiptNumber(),
                  clientName,
                  clientDocument: payment.opportunities?.leads?.contacts?.document_number || undefined,
                  amount: payment.amount,
                  currency: payment.currency || 'EUR',
                  paymentMethod: PAYMENT_METHOD_LABELS[payment.payment_method || 'OUTRO'],
                  paymentDate: payment.paid_at ? format(new Date(payment.paid_at), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'),
                  transactionId: payment.transaction_id || undefined,
                  description: 'Serviços de assessoria em extranjería',
                });
              }}
              title="Gerar Recibo"
            >
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Calculate outstanding balance for refinancing
  const getOutstandingBalance = (contractId: string) => {
    return payments
      .filter(p => p.contract_id === contractId && p.status === 'PENDENTE')
      .reduce((sum, p) => sum + p.amount, 0);
  };

  const getPendingPaymentIds = (contractId: string) => {
    return payments
      .filter(p => p.contract_id === contractId && p.status === 'PENDENTE')
      .map(p => p.id);
  };

  // Highlight overdue rows
  const getRowClassName = (payment: typeof payments[0]) => {
    const overdueInfo = getOverdueInfo(payment);
    if (overdueInfo?.isOverdue) {
      if (overdueInfo.daysOverdue >= 7) return 'bg-destructive/10';
      if (overdueInfo.daysOverdue >= 3) return 'bg-warning/10';
      return 'bg-warning/5';
    }
    return '';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos"
        description="Gerenciar cobranças e recebimentos"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Pagamento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Pagamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Oportunidade</Label>
                  {availableOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Não há oportunidades com contrato assinado.
                    </p>
                  ) : (
                    <Select 
                      value={newPayment.opportunity_id} 
                      onValueChange={(v) => setNewPayment({ ...newPayment, opportunity_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma oportunidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOpportunities.map((opp) => (
                          <SelectItem key={opp.id} value={opp.id}>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              {opp.leads?.contacts?.full_name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor (€)</Label>
                    <Input
                      type="number"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                      placeholder="1500.00"
                    />
                  </div>
                  <div>
                    <Label>Método de Pagamento</Label>
                    <Select 
                      value={newPayment.payment_method} 
                      onValueChange={(v: any) => setNewPayment({ ...newPayment, payment_method: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Link de Pagamento</Label>
                  <Input
                    value={newPayment.payment_link}
                    onChange={(e) => setNewPayment({ ...newPayment, payment_link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={!newPayment.opportunity_id || !newPayment.amount || createPayment.isPending}
                  >
                    {createPayment.isPending ? 'Criando...' : 'Criar Pagamento'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Confirm Payment Dialog */}
      <Dialog open={!!confirmingId} onOpenChange={(open) => !open && setConfirmingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Data do Pagamento</Label>
              <Input
                type="date"
                value={paidAtDate}
                onChange={(e) => setPaidAtDate(e.target.value)}
              />
            </div>
            <div>
              <Label>ID da Transação (opcional)</Label>
              <Input
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="ID da transação bancária"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmingId(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => confirmingId && handleConfirm(confirmingId)}
                disabled={confirmPayment.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                {confirmPayment.isPending ? 'Confirmando...' : 'Confirmar Pagamento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pagamentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredPayments}
        loading={isLoading}
        emptyMessage="Nenhum pagamento encontrado"
        rowClassName={getRowClassName}
      />

      {/* Reschedule Dialog */}
      {reschedulePayment && (
        <RescheduleDialog
          open={!!reschedulePayment}
          onOpenChange={(open) => !open && setReschedulePayment(null)}
          payment={reschedulePayment}
        />
      )}

      {/* Refinance Dialog */}
      {showRefinanceDialog && selectedContractId && (
        <RefinanceDialog
          open={showRefinanceDialog}
          onOpenChange={setShowRefinanceDialog}
          outstandingBalance={getOutstandingBalance(selectedContractId)}
          opportunityId={payments.find(p => p.contract_id === selectedContractId)?.opportunity_id || ''}
          contractId={selectedContractId}
          clientName={payments.find(p => p.contract_id === selectedContractId)?.opportunities?.leads?.contacts?.full_name || 'Cliente'}
          pendingPaymentIds={getPendingPaymentIds(selectedContractId)}
        />
      )}
    </div>
  );
}
