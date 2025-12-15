import { useState } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useOpportunities } from '@/hooks/useOpportunities';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Check, DollarSign } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    await confirmPayment.mutateAsync({ id, transactionId });
    setConfirmingId(null);
    setTransactionId('');
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
      key: 'payment_method',
      header: 'Método',
      cell: (payment) => PAYMENT_METHOD_LABELS[payment.payment_method || 'OUTRO'],
    },
    {
      key: 'status',
      header: 'Status',
      cell: (payment) => (
        <StatusBadge 
          status={payment.status || 'PENDENTE'} 
          label={PAYMENT_STATUS_LABELS[payment.status || 'PENDENTE']} 
        />
      ),
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
      cell: (payment) => payment.status === 'PENDENTE' && (
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
      ),
    },
  ];

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
      />
    </div>
  );
}
