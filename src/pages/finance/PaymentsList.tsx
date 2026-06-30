import { useState, useEffect, useMemo } from 'react';
import { usePayments } from '@/hooks/usePayments';
import { supabase } from '@/integrations/supabase/client';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useQuery } from '@tanstack/react-query';
import { Tables } from '@/integrations/supabase/types';
import { useReceipts } from '@/hooks/useReceipts';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Plus, Search, Check, DollarSign, AlertTriangle, CalendarClock, RefreshCw, FileText, Download, CheckCircle, Clock, FileCheck, MessageSquare, Users, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_FORM_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format, differenceInDays, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { RescheduleDialog } from '@/components/payments/RescheduleDialog';
import { RefinanceDialog } from '@/components/payments/RefinanceDialog';

export default function PaymentsList() {
  const { payments, isLoading, createPayment, confirmPayment, sendCollectionMessage } = usePayments();
  const { opportunities } = useOpportunities();
  const { generateAndSaveReceipt, approveReceipt, downloadReceipt } = useReceipts();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    opportunity_id: '',
    amount: '',
    payment_method: 'PIX' as any,
    payment_form: 'UNICO' as any,
    custom_payment_method: '',
    transfer_origin: '' as '' | 'BRASIL' | 'ESPANHA',
    payment_account_id: '',
    beneficiary_contact_id: '' as string,
    discount_type: '' as '' | 'PERCENTUAL' | 'VALOR',
    discount_value: '',
    apply_vat: false,
  });

  // Fetch payment accounts
  const { data: paymentAccounts = [] } = useQuery({
    queryKey: ['payment-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('is_active', true)
        .order('country');
      if (error) throw error;
      return data as Tables<'payment_accounts'>[];
    },
  });

  // Filter accounts by transfer origin
  const filteredAccounts = paymentAccounts.filter(a => 
    !newPayment.transfer_origin || a.country === newPayment.transfer_origin
  );

  // Fetch default VAT rate from system config
  const { data: defaultVatRate } = useQuery({
    queryKey: ['system-config', 'default_vat_rate'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'default_vat_rate')
        .maybeSingle();
      return parseFloat(data?.value || '21');
    },
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [paidAtDate, setPaidAtDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [reschedulePayment, setReschedulePayment] = useState<typeof payments[0] | null>(null);
  const [showRefinanceDialog, setShowRefinanceDialog] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});

  const toggleContract = (key: string) =>
    setExpandedContracts((prev) => ({ ...prev, [key]: !prev[key] }));

  // Fetch opportunity ids that have an approved or signed contract
  const { data: approvedContractOppIds = [] } = useQuery({
    queryKey: ['approved-contract-opp-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('opportunity_id')
        .in('status', ['APROVADO', 'ASSINADO']);
      if (error) throw error;
      return Array.from(new Set((data || []).map((c: any) => c.opportunity_id).filter(Boolean)));
    },
  });

  const availableOpportunities = useMemo(
    () => opportunities.filter(o => approvedContractOppIds.includes(o.id)),
    [opportunities, approvedContractOppIds]
  );

  // Group available opportunities by client (contact)
  const clientsWithOpportunities = useMemo(() => {
    const map = new Map<string, { contactId: string; name: string; opportunities: typeof availableOpportunities }>();
    for (const opp of availableOpportunities) {
      const contact = opp.leads?.contacts;
      if (!contact?.id) continue;
      const existing = map.get(contact.id);
      if (existing) {
        existing.opportunities.push(opp);
      } else {
        map.set(contact.id, { contactId: contact.id, name: contact.full_name, opportunities: [opp] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableOpportunities]);

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const selectedClient = clientsWithOpportunities.find(c => c.contactId === selectedClientId);
  const clientOpportunities = selectedClient?.opportunities ?? [];

  // Auto-select opportunity if client has only one
  useEffect(() => {
    if (clientOpportunities.length === 1) {
      const onlyId = clientOpportunities[0].id;
      if (newPayment.opportunity_id !== onlyId) {
        setNewPayment((prev) => ({ ...prev, opportunity_id: onlyId }));
      }
    } else if (clientOpportunities.length === 0 && newPayment.opportunity_id) {
      setNewPayment((prev) => ({ ...prev, opportunity_id: '' }));
    } else if (clientOpportunities.length > 1 && newPayment.opportunity_id && !clientOpportunities.find(o => o.id === newPayment.opportunity_id)) {
      setNewPayment((prev) => ({ ...prev, opportunity_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, clientOpportunities.length]);

  const filteredPayments = payments.filter(p => {
    const contractStatus = (p as any).contracts?.status;
    const hasApprovedContract = contractStatus === 'APROVADO' || contractStatus === 'ASSINADO';
    if (!hasApprovedContract) return false;
    const matchesSearch =
      p.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Fetch beneficiaries for the selected opportunity
  const [oppBeneficiaries, setOppBeneficiaries] = useState<Array<{ id: string; full_name: string; contact_id: string | null }>>([]);
  
  useEffect(() => {
    if (!newPayment.opportunity_id) { setOppBeneficiaries([]); return; }
    (async () => {
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id')
        .eq('opportunity_id', newPayment.opportunity_id);
      if (!contracts?.length) { setOppBeneficiaries([]); return; }
      const { data: bens } = await supabase
        .from('contract_beneficiaries')
        .select('id, full_name, contact_id')
        .eq('contract_id', contracts[0].id);
      setOppBeneficiaries(bens || []);
    })();
  }, [newPayment.opportunity_id]);

  // Calculate amounts based on discount and VAT
  const calculatedAmounts = useMemo(() => {
    const gross = parseFloat(newPayment.amount) || 0;
    const vatRate = newPayment.apply_vat ? (defaultVatRate || 21) / 100 : 0;
    const vatAmount = gross * vatRate;
    const totalBeforeDiscount = gross + vatAmount;
    let discountAmount = 0;
    if (newPayment.discount_type === 'PERCENTUAL') {
      discountAmount = totalBeforeDiscount * ((parseFloat(newPayment.discount_value) || 0) / 100);
    } else if (newPayment.discount_type === 'VALOR') {
      discountAmount = parseFloat(newPayment.discount_value) || 0;
    }
    const finalAmount = Math.max(0, totalBeforeDiscount - discountAmount);
    return { gross, discountAmount, totalBeforeDiscount, vatAmount, finalAmount, vatRate };
  }, [newPayment.amount, newPayment.discount_type, newPayment.discount_value, newPayment.apply_vat, defaultVatRate]);

  const handleCreate = async () => {
    if (!newPayment.opportunity_id || !newPayment.amount) return;
    const { gross, discountAmount, vatAmount, finalAmount, vatRate } = calculatedAmounts;
    await createPayment.mutateAsync({
      opportunity_id: newPayment.opportunity_id,
      amount: finalAmount,
      gross_amount: gross,
      discount_type: newPayment.discount_type || null,
      discount_value: parseFloat(newPayment.discount_value) || 0,
      apply_vat: newPayment.apply_vat,
      vat_rate: newPayment.apply_vat ? vatRate : null,
      vat_amount: vatAmount,
      payment_method: newPayment.payment_method,
      payment_form: newPayment.payment_form,
      status: 'PENDENTE',
      beneficiary_contact_id: newPayment.beneficiary_contact_id || null,
    });
    setIsDialogOpen(false);
    setOppBeneficiaries([]);
    setSelectedClientId('');
    setNewPayment({
      opportunity_id: '',
      amount: '',
      payment_method: 'PIX',
      payment_form: 'UNICO',
      custom_payment_method: '',
      transfer_origin: '',
      payment_account_id: '',
      beneficiary_contact_id: '',
      discount_type: '',
      discount_value: '',
      apply_vat: false,
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
      key: 'payment_form',
      header: 'Forma',
      cell: (payment) => PAYMENT_FORM_LABELS[(payment as any).payment_form || 'UNICO'],
    },
    {
      key: 'contract_status',
      header: 'Contrato',
      cell: (payment: any) => {
        const contract = payment.contracts;
        if (!contract) {
          return <Badge variant="outline" className="text-muted-foreground">Sem contrato</Badge>;
        }
        if (contract.status === 'APROVADO') {
          return (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex items-center gap-1 whitespace-nowrap">
              <FileText className="h-3 w-3" />
              A Assinar
            </Badge>
          );
        }
        if (contract.status === 'ASSINADO') {
          return (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Assinado
            </Badge>
          );
        }
        if (contract.status === 'EM_ELABORACAO') {
          return <Badge variant="outline">Em Elaboração</Badge>;
        }
        return <Badge variant="outline">{contract.status}</Badge>;
      },
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
      key: 'receipt',
      header: 'Recibo',
      cell: (payment: any) => {
        if (payment.status !== 'CONFIRMADO') return <span className="text-muted-foreground">-</span>;
        
        if (payment.receipt_approved_at) {
          return (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <FileCheck className="h-3 w-3 mr-1" />
              Aprovado
            </Badge>
          );
        }
        
        if (payment.receipt_generated_at) {
          return (
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
              <Clock className="h-3 w-3 mr-1" />
              Aguardando
            </Badge>
          );
        }
        
        return (
          <Badge variant="outline">Não gerado</Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      cell: (payment: any) => (
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                    title="Editar pagamento"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setReschedulePayment(payment);
                    }}
                  >
                    <CalendarClock className="h-4 w-4 mr-2" />
                    Prorrogar
                  </DropdownMenuItem>
                  {payment.contract_id && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedContractId(payment.contract_id);
                        setShowRefinanceDialog(true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reparcelar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {getOverdueInfo(payment)?.isOverdue && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    sendCollectionMessage.mutate(payment);
                  }}
                  disabled={sendCollectionMessage.isPending}
                  title="Enviar Cobrança WhatsApp"
                  className="text-green-600 hover:text-green-700"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
          {payment.status === 'CONFIRMADO' && (
            <div className="flex items-center gap-1">
              {/* Gerar Recibo Manualmente */}
              {!payment.receipt_number && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    generateAndSaveReceipt.mutate(payment);
                  }}
                  disabled={generateAndSaveReceipt.isPending}
                  title="Gerar Recibo"
                >
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              
              {/* Aprovar Recibo */}
              {payment.receipt_number && !payment.receipt_approved_at && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    approveReceipt.mutate(payment.id);
                  }}
                  disabled={approveReceipt.isPending}
                  title="Aprovar Recibo"
                  className="text-green-600 hover:text-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
              )}
              
              {/* Download Recibo */}
              {payment.receipt_approved_at && payment.receipt_url && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadReceipt(payment.receipt_url, payment.receipt_number || 'recibo');
                  }}
                  title="Baixar Recibo"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                  <Label>Cliente</Label>
                  {clientsWithOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Não há clientes com contrato aprovado.
                    </p>
                  ) : (
                    <Select
                      value={selectedClientId}
                      onValueChange={(v) => setSelectedClientId(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientsWithOpportunities.map((c) => (
                          <SelectItem key={c.contactId} value={c.contactId}>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {c.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {clientOpportunities.length > 1 && (
                  <div>
                    <Label>Oportunidade</Label>
                    <Select
                      value={newPayment.opportunity_id}
                      onValueChange={(v) => setNewPayment({ ...newPayment, opportunity_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma oportunidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {clientOpportunities.map((opp) => (
                          <SelectItem key={opp.id} value={opp.id}>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              {(opp as any).title || (opp as any).leads?.service_interest || opp.id.slice(0, 8)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {oppBeneficiaries.length > 0 && (
                  <div>
                    <Label>Beneficiário (opcional)</Label>
                    <Select 
                      value={newPayment.beneficiary_contact_id || '_none'} 
                      onValueChange={(v) => setNewPayment({ ...newPayment, beneficiary_contact_id: v === '_none' ? '' : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Titular (sem beneficiário específico)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Titular</SelectItem>
                        {oppBeneficiaries.map((ben) => (
                          <SelectItem key={ben.id} value={ben.contact_id || ben.id}>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {ben.full_name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor Bruto (€)</Label>
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
                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select 
                      value={newPayment.payment_form} 
                      onValueChange={(v: any) => setNewPayment({ ...newPayment, payment_form: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_FORM_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label>Aplicar IVA ({defaultVatRate || 21}%)</Label>
                      <p className="text-xs text-muted-foreground">Imposto sobre Valor Acrescentado</p>
                    </div>
                    <Switch
                      checked={newPayment.apply_vat}
                      onCheckedChange={(checked) => setNewPayment({ ...newPayment, apply_vat: checked })}
                    />
                  </div>
                </div>

                {newPayment.payment_method === 'OUTRO' && (
                  <div>
                    <Label>Detalhe do método de pagamento *</Label>
                    <Input
                      value={newPayment.custom_payment_method}
                      onChange={(e) => setNewPayment({ ...newPayment, custom_payment_method: e.target.value })}
                      placeholder="Descreva o método de pagamento"
                    />
                  </div>
                )}

                {newPayment.payment_method === 'TRANSFERENCIA' && (
                  <div className="space-y-4 rounded-lg border p-3">
                    <Label className="text-sm font-semibold">Dados da Transferência</Label>
                    <div>
                      <Label>Origem *</Label>
                      <div className="flex items-center gap-6 mt-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="transfer-origin-brasil"
                            checked={newPayment.transfer_origin === 'BRASIL'}
                            onCheckedChange={(checked) =>
                              setNewPayment({ ...newPayment, transfer_origin: checked ? 'BRASIL' : '', payment_account_id: '' })
                            }
                          />
                          <Label htmlFor="transfer-origin-brasil" className="font-normal cursor-pointer">Brasil</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="transfer-origin-espanha"
                            checked={newPayment.transfer_origin === 'ESPANHA'}
                            onCheckedChange={(checked) =>
                              setNewPayment({ ...newPayment, transfer_origin: checked ? 'ESPANHA' : '', payment_account_id: '' })
                            }
                          />
                          <Label htmlFor="transfer-origin-espanha" className="font-normal cursor-pointer">Espanha</Label>
                        </div>
                      </div>
                    </div>
                    {newPayment.transfer_origin && (
                      <div>
                        <Label>Conta Bancária *</Label>
                        {filteredAccounts.length === 0 ? (
                          <p className="text-sm text-muted-foreground mt-1">Nenhuma conta cadastrada para {newPayment.transfer_origin === 'BRASIL' ? 'Brasil' : 'Espanha'}.</p>
                        ) : (
                          <Select
                            value={newPayment.payment_account_id}
                            onValueChange={(v) => setNewPayment({ ...newPayment, payment_account_id: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a conta bancária" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.bank_name ? `${acc.bank_name} - ` : ''}{acc.account_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                    {newPayment.payment_account_id && (() => {
                      const selectedAcc = paymentAccounts.find(a => a.id === newPayment.payment_account_id);
                      if (!selectedAcc?.account_details) return null;
                      return (
                        <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-line">
                          <span className="font-medium text-foreground">Dados bancários:</span>
                          <br />{selectedAcc.account_details}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Discount */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de Desconto</Label>
                    <Select
                      value={newPayment.discount_type || '_none'}
                      onValueChange={(v) => setNewPayment({ ...newPayment, discount_type: v === '_none' ? '' : v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem desconto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sem desconto</SelectItem>
                        <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                        <SelectItem value="VALOR">Valor fixo (€)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newPayment.discount_type && (
                    <div>
                      <Label>{newPayment.discount_type === 'PERCENTUAL' ? 'Desconto (%)' : 'Desconto (€)'}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newPayment.discount_value}
                        onChange={(e) => setNewPayment({ ...newPayment, discount_value: e.target.value })}
                        placeholder={newPayment.discount_type === 'PERCENTUAL' ? '10' : '100.00'}
                      />
                    </div>
                  )}
                </div>


                {/* Calculation Summary */}
                {(newPayment.amount && (newPayment.discount_type || newPayment.apply_vat)) && (
                  <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor Bruto</span>
                      <span>€ {calculatedAmounts.gross.toFixed(2)}</span>
                    </div>
                    {newPayment.apply_vat && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IVA ({defaultVatRate || 21}%)</span>
                        <span>+ € {calculatedAmounts.vatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {(newPayment.apply_vat && calculatedAmounts.discountAmount > 0) && (
                      <div className="flex justify-between font-medium border-t pt-1">
                        <span>Total</span>
                        <span>€ {calculatedAmounts.totalBeforeDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {calculatedAmounts.discountAmount > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Desconto</span>
                        <span>- € {calculatedAmounts.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total Final</span>
                      <span>€ {calculatedAmounts.finalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                {newPayment.payment_method !== 'TRANSFERENCIA' && (
                  <div>
                    <Label className="mb-3 block">Origem da transferência</Label>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="origin-brasil"
                          checked={newPayment.transfer_origin === 'BRASIL'}
                          onCheckedChange={(checked) =>
                            setNewPayment({ ...newPayment, transfer_origin: checked ? 'BRASIL' : '' })
                          }
                        />
                        <Label htmlFor="origin-brasil" className="font-normal cursor-pointer">Brasil</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="origin-espanha"
                          checked={newPayment.transfer_origin === 'ESPANHA'}
                          onCheckedChange={(checked) =>
                            setNewPayment({ ...newPayment, transfer_origin: checked ? 'ESPANHA' : '' })
                          }
                        />
                        <Label htmlFor="origin-espanha" className="font-normal cursor-pointer">Espanha</Label>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={
                      !newPayment.opportunity_id || 
                      !newPayment.amount || 
                      createPayment.isPending ||
                      (newPayment.payment_method === 'TRANSFERENCIA' && (!newPayment.transfer_origin || !newPayment.payment_account_id))
                    }
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

      {(() => {
        // Group filtered payments by contract
        const groupsMap = new Map<string, { key: string; contract: any; clientName: string; items: typeof filteredPayments }>();
        filteredPayments.forEach((p: any) => {
          const key = p.contract_id || `no-contract-${p.opportunity_id || p.id}`;
          if (!groupsMap.has(key)) {
            groupsMap.set(key, {
              key,
              contract: p.contracts || null,
              clientName: p.opportunities?.leads?.contacts?.full_name || 'Sem cliente',
              items: [],
            });
          }
          groupsMap.get(key)!.items.push(p);
        });
        const groups = Array.from(groupsMap.values());

        if (isLoading) {
          return (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
              Carregando...
            </div>
          );
        }

        if (groups.length === 0) {
          return (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
              Nenhum pagamento encontrado
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {groups.map((group) => {
              const isExpanded = expandedContracts[group.key] ?? false;
              const totalAmount = group.items.reduce((sum, p) => sum + (p.amount || 0), 0);
              const paidCount = group.items.filter((p) => p.status === 'CONFIRMADO').length;
              const pendingCount = group.items.filter((p) => p.status === 'PENDENTE').length;
              const contractStatus = group.contract?.status;
              const contractLabel =
                contractStatus === 'APROVADO' ? 'A Assinar' :
                contractStatus === 'ASSINADO' ? 'Assinado' :
                contractStatus === 'EM_ELABORACAO' ? 'Em Elaboração' :
                contractStatus || 'Sem contrato';

              return (
                <div key={group.key} className="rounded-lg border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleContract(group.key)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{group.clientName}</span>
                        <Badge
                          className={cn(
                            'flex items-center gap-1 whitespace-nowrap',
                            contractStatus === 'APROVADO' && 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
                            contractStatus === 'ASSINADO' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
                          )}
                          variant={contractStatus === 'APROVADO' || contractStatus === 'ASSINADO' ? undefined : 'outline'}
                        >
                          <FileText className="h-3 w-3" />
                          {contractLabel}
                        </Badge>
                        {group.contract?.contract_number && (
                          <span className="text-xs text-muted-foreground">Nº {group.contract.contract_number}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {group.items.length} pagamento(s) · {paidCount} confirmado(s) · {pendingCount} pendente(s)
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: group.items[0]?.currency || 'EUR' }).format(totalAmount)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            {columns.map((col) => (
                              <TableHead key={col.key} className={cn('font-semibold', col.className)}>
                                {col.header}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((p) => (
                            <TableRow key={p.id} className={getRowClassName(p)}>
                              {columns.map((col) => (
                                <TableCell key={col.key} className={col.className}>
                                  {col.cell ? col.cell(p) : (p as any)[col.key]}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

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
