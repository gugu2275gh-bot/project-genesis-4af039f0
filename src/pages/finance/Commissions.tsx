import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/ui/data-table';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle,
  Clock,
  Users,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCommissions, CommissionWithContract, CommissionInsert, COMMISSION_STATUS_LABELS, CommissionStatus } from '@/hooks/useCommissions';
import { useContracts } from '@/hooks/useContracts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_VARIANTS: Record<CommissionStatus, 'outline' | 'default' | 'destructive' | 'secondary'> = {
  PENDENTE_APROVACAO: 'outline',
  APROVADA: 'secondary',
  PAGA: 'default',
  REJEITADA: 'destructive',
  CANCELADA: 'destructive',
};

export default function Commissions() {
  const { 
    commissions, 
    isLoading, 
    createCommission, 
    approveCommission,
    rejectCommission,
    markAsPaid,
    pendingApproval,
    approved,
    pendingToPay,
    pendingToReceive,
    totalPendingToPay,
    totalPendingToReceive,
  } = useCommissions();
  const { contracts } = useContracts();

  const { data: configuredRate } = useQuery({
    queryKey: ['system-config', 'default_commission_rate'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'default_commission_rate')
        .maybeSingle();
      const n = parseFloat(data?.value ?? '');
      return Number.isFinite(n) ? n : 10;
    },
  });
  const commissionRate = (configuredRate ?? 10) / 100;

  // Lista de SERVIÇOS (oportunidades) elegíveis para comissão manual:
  // apenas serviços cujo cliente tem indicado preenchido.
  const { data: eligibleServices = [] } = useQuery({
    queryKey: ['commission-eligible-services'],
    queryFn: async () => {
      const result: Array<{
        opportunity_id: string;
        contract_id: string;
        client_name: string;
        referral_name: string;
        service_name: string;
        total_amount: number;
      }> = [];

      for (const c of contracts) {
        const opps: Array<{ id: string; total_amount: number | null; lead: any }> = [];
        if (c.opportunities) {
          opps.push({ id: c.opportunities.id, total_amount: c.opportunities.total_amount, lead: c.opportunities.leads });
        }
        for (const cl of c.contract_leads || []) {
          if (cl.leads?.id && !opps.some(o => o.lead?.id === cl.leads.id)) {
            // buscar oportunidade do lead
            const { data: oppRow } = await supabase
              .from('opportunities')
              .select('id, total_amount, leads(id, service_interest, service_types(name), contacts(full_name, referral_name))')
              .eq('lead_id', cl.leads.id)
              .maybeSingle();
            if (oppRow) opps.push({ id: oppRow.id, total_amount: oppRow.total_amount, lead: (oppRow as any).leads });
          }
        }
        for (const o of opps) {
          const referral = o.lead?.contacts?.referral_name?.trim();
          if (!referral) continue;
          result.push({
            opportunity_id: o.id,
            contract_id: c.id,
            client_name: o.lead?.contacts?.full_name || 'Sem nome',
            referral_name: referral,
            service_name: o.lead?.service_types?.name || o.lead?.service_interest || 'Serviço',
            total_amount: Number(o.total_amount || 0),
          });
        }
      }
      return result;
    },
    enabled: contracts.length > 0,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<CommissionWithContract | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedServiceKey, setSelectedServiceKey] = useState('');
  const [addIva, setAddIva] = useState(false);
  const IVA_RATE = 0.21;
  const [formData, setFormData] = useState<CommissionInsert>({
    contract_id: '',
    opportunity_id: null,
    collaborator_name: '',
    collaborator_type: 'CAPTADOR',
    base_amount: 0,
    commission_rate: commissionRate,
    commission_amount: 0,
    has_invoice: true,
    vat_enabled: false,
    reference_period: '',
    paid_at: null,
  });

  const selectedService = eligibleServices.find(
    (s) => `${s.contract_id}:${s.opportunity_id}` === selectedServiceKey,
  );

  const handleServiceChange = (key: string) => {
    setSelectedServiceKey(key);
    const svc = eligibleServices.find((s) => `${s.contract_id}:${s.opportunity_id}` === key);
    const baseAmount = svc?.total_amount ?? 0;
    const baseCommission = baseAmount * commissionRate;
    setFormData((prev) => ({
      ...prev,
      contract_id: svc?.contract_id || '',
      opportunity_id: svc?.opportunity_id || null,
      base_amount: baseAmount,
      commission_rate: commissionRate,
      commission_amount: baseCommission,
      collaborator_name: svc?.referral_name || prev.collaborator_name,
    }));
  };


  const baseCommission = formData.base_amount * commissionRate;
  const ivaAmount = addIva ? baseCommission * IVA_RATE : 0;
  const totalCommission = baseCommission + ivaAmount;

  const handleSubmit = () => {
    if (!formData.opportunity_id) return;
    const ivaNote = addIva
      ? `IVA aplicado (21%): €${ivaAmount.toFixed(2)} · Total c/ IVA: €${totalCommission.toFixed(2)}`
      : 'Sem IVA';
    const payload: CommissionInsert = {
      ...formData,
      base_amount: addIva ? formData.base_amount * (1 + IVA_RATE) : formData.base_amount,
      notes: [formData.notes, ivaNote].filter(Boolean).join(' | '),
    };
    createCommission.mutate(payload, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setSelectedServiceKey('');
        setAddIva(false);
        setFormData({
          contract_id: '',
          opportunity_id: null,
          collaborator_name: '',
          collaborator_type: 'CAPTADOR',
          base_amount: 0,
          has_invoice: true,
          reference_period: '',
          paid_at: null,
        });
      },
    });
  };


  const handleApprove = (commission: CommissionWithContract) => {
    approveCommission.mutate(commission.id);
  };

  const handleReject = () => {
    if (selectedCommission && rejectionReason) {
      rejectCommission.mutate(
        { id: selectedCommission.id, reason: rejectionReason },
        {
          onSuccess: () => {
            setRejectDialogOpen(false);
            setSelectedCommission(null);
            setRejectionReason('');
          },
        }
      );
    }
  };

  const handleMarkAsPaid = () => {
    if (selectedCommission && paymentMethod) {
      markAsPaid.mutate(
        { id: selectedCommission.id, paymentMethod },
        {
          onSuccess: () => {
            setPayDialogOpen(false);
            setSelectedCommission(null);
            setPaymentMethod('');
          },
        }
      );
    }
  };

  const columns: Column<CommissionWithContract>[] = [
    {
      key: 'collaborator_name',
      header: 'Colaborador',
      cell: (item) => (
        <div>
          <p className="font-medium">{item.collaborator_name}</p>
          <p className="text-xs text-muted-foreground">
            {item.collaborator_type === 'CAPTADOR' ? 'Captador (a pagar)' : 'Fornecedor (a receber)'}
          </p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Cliente / Serviço',
      cell: (item) => {
        const clientName =
          item.opportunity?.leads?.contacts?.full_name ||
          item.contracts?.opportunities?.leads?.contacts?.full_name ||
          '-';
        const serviceName =
          item.opportunity?.leads?.service_types?.name ||
          item.opportunity?.leads?.service_interest ||
          null;
        return (
          <div>
            <p className="font-medium">{clientName}</p>
            {serviceName && (
              <p className="text-xs text-muted-foreground">{serviceName}</p>
            )}
          </div>
        );
      },
    },

    {
      key: 'reference_period',
      header: 'Período',
      cell: (item) => item.reference_period || '-',
    },
    {
      key: 'commission_amount',
      header: 'Comissão',
      cell: (item) => (
        <span className="font-semibold">€{item.commission_amount?.toFixed(2) || '0.00'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (item) => {
        const status = item.status as CommissionStatus;
        return (
          <div>
            <Badge variant={STATUS_VARIANTS[status] || 'outline'}>
              {COMMISSION_STATUS_LABELS[status] || status}
            </Badge>
            {item.approved_by_profile && item.approved_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {status === 'REJEITADA' ? 'Rejeitada' : 'Aprovada'} por {item.approved_by_profile.full_name}
              </p>
            )}
            {item.rejection_reason && (
              <p className="text-xs text-destructive mt-0.5">Motivo: {item.rejection_reason}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'paid_at',
      header: 'Pago em',
      cell: (item) => item.paid_at 
        ? format(new Date(item.paid_at), 'dd/MM/yyyy', { locale: ptBR })
        : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (item) => {
        const status = item.status as CommissionStatus;
        return (
          <div className="flex gap-1">
            {status === 'PENDENTE_APROVACAO' && (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); handleApprove(item); }}
                  disabled={approveCommission.isPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Aprovar
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCommission(item);
                    setRejectDialogOpen(true);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
            {status === 'APROVADA' && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCommission(item);
                  setPayDialogOpen(true);
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Pagar
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissionamentos"
        description="Gestão de comissões de captadores e fornecedores"
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Comissão
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Comissão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Serviço (somente serviços com indicado)</Label>
                <Select
                  value={selectedServiceKey}
                  onValueChange={handleServiceChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleServices.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum serviço com indicado disponível
                      </div>
                    )}
                    {eligibleServices.map((s) => (
                      <SelectItem
                        key={`${s.contract_id}:${s.opportunity_id}`}
                        value={`${s.contract_id}:${s.opportunity_id}`}
                      >
                        {s.client_name} — {s.service_name} (€{s.total_amount.toFixed(2)}) · Indicado: {s.referral_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedService && (
                <div className="space-y-2">
                  <Label>Cliente / Indicado</Label>
                  <Input value={`${selectedService.client_name} · Indicado por ${selectedService.referral_name}`} disabled />
                </div>
              )}



              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select 
                  value={formData.collaborator_type} 
                  onValueChange={(v: 'CAPTADOR' | 'FORNECEDOR') => 
                    setFormData({ ...formData, collaborator_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAPTADOR">Captador (a pagar)</SelectItem>
                    <SelectItem value="FORNECEDOR">Fornecedor (a receber)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nome do Colaborador</Label>
                <Input
                  value={formData.collaborator_name}
                  onChange={(e) => setFormData({ ...formData, collaborator_name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label>Honorário do Serviço (€)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.base_amount}
                  onChange={(e) => setFormData({ ...formData, base_amount: parseFloat(e.target.value.replace(',', '.')) || 0 })}
                  placeholder="Auto-preenchido pelo contrato"
                />
                <p className="text-xs text-muted-foreground">
                  Preenchido automaticamente ao selecionar o contrato. Pode ser ajustado.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Data de Pagamento</Label>
                <Input
                  type="date"
                  value={formData.paid_at ? formData.paid_at.substring(0, 10) : ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      paid_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Deixe em branco se ainda não foi paga.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-iva"
                  checked={addIva}
                  onCheckedChange={(v) => setAddIva(v === true)}
                />
                <Label htmlFor="add-iva" className="cursor-pointer">
                  Adicionar IVA (21%) sobre a comissão
                </Label>
              </div>

              <div className="bg-muted p-3 rounded-md space-y-1">
                <p className="text-sm text-muted-foreground">
                  Comissão ({((configuredRate ?? 10)).toString()}%): <strong>€{baseCommission.toFixed(2)}</strong>
                </p>
                {addIva && (
                  <p className="text-sm text-muted-foreground">
                    IVA (21%): <strong>€{ivaAmount.toFixed(2)}</strong>
                  </p>
                )}
                <p className="text-sm">
                  Total: <strong>€{totalCommission.toFixed(2)}</strong>
                </p>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createCommission.isPending}>
                {createCommission.isPending ? 'Salvando...' : 'Registrar Comissão'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Aprovação</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApproval.length}</div>
            <p className="text-xs text-muted-foreground">comissões para aprovar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">€{totalPendingToPay.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{pendingToPay.length} aprovadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">€{totalPendingToReceive.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{pendingToReceive.length} aprovadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Colaboradores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(commissions.map(c => c.collaborator_name)).size}
            </div>
            <p className="text-xs text-muted-foreground">Colaboradores únicos</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todas ({commissions.length})</TabsTrigger>
          <TabsTrigger value="pending-approval">Pendentes ({pendingApproval.length})</TabsTrigger>
          <TabsTrigger value="approved">Aprovadas ({approved.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <DataTable columns={columns} data={commissions} emptyMessage="Nenhuma comissão registrada" />
        </TabsContent>

        <TabsContent value="pending-approval" className="mt-4">
          <DataTable columns={columns} data={pendingApproval} emptyMessage="Nenhuma comissão pendente de aprovação" />
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <DataTable columns={columns} data={approved} emptyMessage="Nenhuma comissão aprovada" />
        </TabsContent>
      </Tabs>


      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedCommission && (
              <>
                <div className="bg-muted p-4 rounded-md space-y-2">
                  <p><strong>Colaborador:</strong> {selectedCommission.collaborator_name}</p>
                  <p><strong>Valor:</strong> €{selectedCommission.commission_amount?.toFixed(2)}</p>
                  <p><strong>Tipo:</strong> {selectedCommission.collaborator_type === 'CAPTADOR' ? 'A Pagar' : 'A Receber'}</p>
                </div>

                <div className="space-y-2">
                  <Label>Método de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRANSFERENCIA_ES">Transferência Espanha</SelectItem>
                      <SelectItem value="PIX_BR">PIX Brasil</SelectItem>
                      <SelectItem value="PAYPAL">PayPal</SelectItem>
                      <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleMarkAsPaid} 
                  className="w-full"
                  disabled={!paymentMethod || markAsPaid.isPending}
                >
                  {markAsPaid.isPending ? 'Processando...' : 'Confirmar Pagamento'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedCommission && (
              <>
                <div className="bg-muted p-4 rounded-md space-y-2">
                  <p><strong>Colaborador:</strong> {selectedCommission.collaborator_name}</p>
                  <p><strong>Valor:</strong> €{selectedCommission.commission_amount?.toFixed(2)}</p>
                </div>

                <div className="space-y-2">
                  <Label>Motivo da Rejeição *</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Informe o motivo da rejeição"
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleReject} 
                  className="w-full"
                  variant="destructive"
                  disabled={!rejectionReason || rejectCommission.isPending}
                >
                  {rejectCommission.isPending ? 'Processando...' : 'Confirmar Rejeição'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
