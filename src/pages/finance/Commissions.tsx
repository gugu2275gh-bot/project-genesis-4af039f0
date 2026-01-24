import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/ui/data-table';
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
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle,
  Clock,
  Receipt,
  Users
} from 'lucide-react';
import { useCommissions, CommissionWithContract, CommissionInsert } from '@/hooks/useCommissions';
import { useContracts } from '@/hooks/useContracts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_BADGES = {
  PENDENTE: { label: 'Pendente', variant: 'outline' as const },
  PAGA: { label: 'Paga', variant: 'default' as const },
  CANCELADA: { label: 'Cancelada', variant: 'destructive' as const },
};

export default function Commissions() {
  const { 
    commissions, 
    isLoading, 
    createCommission, 
    markAsPaid,
    pendingToPay,
    pendingToReceive,
    totalPendingToPay,
    totalPendingToReceive,
  } = useCommissions();
  const { contracts } = useContracts();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<CommissionWithContract | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [formData, setFormData] = useState<CommissionInsert>({
    contract_id: '',
    collaborator_name: '',
    collaborator_type: 'CAPTADOR',
    base_amount: 0,
    has_invoice: false,
  });

  const handleSubmit = () => {
    createCommission.mutate(formData, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setFormData({
          contract_id: '',
          collaborator_name: '',
          collaborator_type: 'CAPTADOR',
          base_amount: 0,
          has_invoice: false,
        });
      },
    });
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
      header: 'Cliente',
      cell: (item) => item.contracts?.opportunities?.leads?.contacts?.full_name || '-',
    },
    {
      key: 'base_amount',
      header: 'Base',
      cell: (item) => `€${item.base_amount.toFixed(2)}`,
    },
    {
      key: 'rate',
      header: 'Taxa',
      cell: (item) => (
        <div className="flex items-center gap-1">
          <span>{(item.commission_rate * 100).toFixed(0)}%</span>
          {item.has_invoice && <Receipt className="h-3 w-3 text-muted-foreground" />}
        </div>
      ),
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
        const badge = STATUS_BADGES[item.status];
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
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
      cell: (item) => item.status === 'PENDENTE' && (
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
      ),
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
                <Label>Contrato</Label>
                <Select 
                  value={formData.contract_id} 
                  onValueChange={(v) => setFormData({ ...formData, contract_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.opportunities?.leads?.contacts?.full_name || 'Sem nome'} - 
                        €{contract.total_fee?.toFixed(2) || '0.00'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <Label>Valor Base (€)</Label>
                <Input
                  type="number"
                  value={formData.base_amount}
                  onChange={(e) => setFormData({ ...formData, base_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="has_invoice"
                  checked={formData.has_invoice}
                  onChange={(e) => setFormData({ ...formData, has_invoice: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="has_invoice">
                  Emite Nota Fiscal (10% ao invés de 8%)
                </Label>
              </div>

              <div className="bg-muted p-3 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Comissão calculada: <strong>€{(formData.base_amount * (formData.has_invoice ? 0.10 : 0.08)).toFixed(2)}</strong>
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
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">€{totalPendingToPay.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{pendingToPay.length} comissões pendentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">€{totalPendingToReceive.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{pendingToReceive.length} comissões pendentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingToPay.length + pendingToReceive.length}</div>
            <p className="text-xs text-muted-foreground">Total de comissões</p>
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
          <TabsTrigger value="to-pay">A Pagar ({pendingToPay.length})</TabsTrigger>
          <TabsTrigger value="to-receive">A Receber ({pendingToReceive.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <DataTable columns={columns} data={commissions} emptyMessage="Nenhuma comissão registrada" />
        </TabsContent>

        <TabsContent value="to-pay" className="mt-4">
          <DataTable columns={columns} data={pendingToPay} emptyMessage="Nenhuma comissão a pagar" />
        </TabsContent>

        <TabsContent value="to-receive" className="mt-4">
          <DataTable columns={columns} data={pendingToReceive} emptyMessage="Nenhuma comissão a receber" />
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
    </div>
  );
}
