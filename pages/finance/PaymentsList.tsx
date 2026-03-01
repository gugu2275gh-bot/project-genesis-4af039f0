import { useState } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useContacts } from '@/hooks/useContacts';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Check, DollarSign, User } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function PaymentsList() {
  const { payments, isLoading, createPayment, confirmPayment } = usePayments();
  const { opportunities } = useOpportunities();
  const { contacts } = useContacts();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newPayment, setNewPayment] = useState({
    opportunity_id: '',
    amount: '',
    payment_method: 'PIX' as any,
    payment_link: '',
    discount_type: '' as '' | 'PERCENTUAL' | 'VALOR',
    discount_value: '',
    apply_vat: false,
    vat_rate: '21',
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState('');

  const availableOpportunities = opportunities.filter(o => 
    (o.status === 'CONTRATO_ASSINADO' || o.status === 'PAGAMENTO_PENDENTE') &&
    (!selectedClientId || o.leads?.contact_id === selectedClientId)
  );

  // Get unique clients that have available opportunities
  const clientsWithOpportunities = contacts.filter(c => 
    opportunities.some(o => 
      (o.status === 'CONTRATO_ASSINADO' || o.status === 'PAGAMENTO_PENDENTE') &&
      o.leads?.contact_id === c.id
    )
  );

  const filteredPayments = payments.filter(p => {
    const matchesSearch = 
      p.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate final amount with discount and VAT
  const calculatedAmounts = (() => {
    const gross = parseFloat(newPayment.amount) || 0;
    let discountAmount = 0;
    if (newPayment.discount_type === 'PERCENTUAL') {
      discountAmount = gross * ((parseFloat(newPayment.discount_value) || 0) / 100);
    } else if (newPayment.discount_type === 'VALOR') {
      discountAmount = parseFloat(newPayment.discount_value) || 0;
    }
    const afterDiscount = Math.max(0, gross - discountAmount);
    const vatRate = newPayment.apply_vat ? (parseFloat(newPayment.vat_rate) || 0) / 100 : 0;
    const vatAmount = afterDiscount * vatRate;
    const finalAmount = afterDiscount + vatAmount;
    return { gross, discountAmount, afterDiscount, vatAmount, finalAmount };
  })();

  const handleCreate = async () => {
    if (!newPayment.opportunity_id || !newPayment.amount) return;
    const { gross, vatAmount, finalAmount } = calculatedAmounts;
    await createPayment.mutateAsync({
      opportunity_id: newPayment.opportunity_id,
      amount: finalAmount,
      gross_amount: gross,
      discount_type: newPayment.discount_type || null,
      discount_value: newPayment.discount_type ? (parseFloat(newPayment.discount_value) || 0) : null,
      apply_vat: newPayment.apply_vat,
      vat_rate: newPayment.apply_vat ? (parseFloat(newPayment.vat_rate) || 0) / 100 : null,
      vat_amount: vatAmount,
      payment_method: newPayment.payment_method,
      payment_link: newPayment.payment_link || null,
      status: 'PENDENTE',
    } as any);
    setIsDialogOpen(false);
    setSelectedClientId('');
    setNewPayment({
      opportunity_id: '',
      amount: '',
      payment_method: 'PIX',
      payment_link: '',
      discount_type: '',
      discount_value: '',
      apply_vat: false,
      vat_rate: '21',
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
                  <Label>Cliente *</Label>
                  {clientsWithOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Não há clientes com oportunidades disponíveis.
                    </p>
                  ) : (
                    <Select 
                      value={selectedClientId} 
                      onValueChange={(v) => {
                        setSelectedClientId(v);
                        setNewPayment({ ...newPayment, opportunity_id: '' });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientsWithOpportunities.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {client.full_name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Oportunidade *</Label>
                  {!selectedClientId ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selecione um cliente primeiro.
                    </p>
                  ) : availableOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Não há oportunidades disponíveis para este cliente.
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
                              {opp.total_amount ? `€${opp.total_amount}` : 'Oportunidade'} - {opp.status}
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
                {/* Desconto */}
                <div className="space-y-2">
                  <Label>Desconto</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newPayment.discount_type}
                      onValueChange={(v: 'PERCENTUAL' | 'VALOR') => setNewPayment({ ...newPayment, discount_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem desconto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                        <SelectItem value="VALOR">Valor fixo (€)</SelectItem>
                      </SelectContent>
                    </Select>
                    {newPayment.discount_type && (
                      <Input
                        type="number"
                        value={newPayment.discount_value}
                        onChange={(e) => setNewPayment({ ...newPayment, discount_value: e.target.value })}
                        placeholder={newPayment.discount_type === 'PERCENTUAL' ? '10' : '100.00'}
                      />
                    )}
                  </div>
                </div>

                {/* IVA */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">Aplicar IVA</Label>
                    <p className="text-xs text-muted-foreground">Imposto sobre valor acrescentado</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {newPayment.apply_vat && (
                      <Input
                        type="number"
                        value={newPayment.vat_rate}
                        onChange={(e) => setNewPayment({ ...newPayment, vat_rate: e.target.value })}
                        className="w-20 h-8 text-sm"
                        placeholder="21"
                      />
                    )}
                    {newPayment.apply_vat && <span className="text-sm text-muted-foreground">%</span>}
                    <Switch
                      checked={newPayment.apply_vat}
                      onCheckedChange={(checked) => setNewPayment({ ...newPayment, apply_vat: checked })}
                    />
                  </div>
                </div>

                {/* Resumo do cálculo */}
                {parseFloat(newPayment.amount) > 0 && (newPayment.discount_type || newPayment.apply_vat) && (
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Valor bruto</span>
                      <span>€{calculatedAmounts.gross.toFixed(2)}</span>
                    </div>
                    {newPayment.discount_type && calculatedAmounts.discountAmount > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Desconto {newPayment.discount_type === 'PERCENTUAL' ? `(${newPayment.discount_value}%)` : ''}</span>
                        <span>-€{calculatedAmounts.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {newPayment.apply_vat && (
                      <div className="flex justify-between">
                        <span>IVA ({newPayment.vat_rate}%)</span>
                        <span>+€{calculatedAmounts.vatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total final</span>
                      <span>€{calculatedAmounts.finalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={!selectedClientId || !newPayment.opportunity_id || !newPayment.amount || createPayment.isPending}
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
