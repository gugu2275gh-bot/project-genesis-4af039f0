import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  FileText, 
  Send,
  Ban,
  Download,
  Receipt,
  Euro
} from 'lucide-react';
import { useInvoices, Invoice, InvoiceInsert } from '@/hooks/useInvoices';
import { useContracts } from '@/hooks/useContracts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_BADGES = {
  EMITIDA: { label: 'Emitida', variant: 'outline' as const, icon: FileText },
  ENVIADA: { label: 'Enviada', variant: 'default' as const, icon: Send },
  CANCELADA: { label: 'Cancelada', variant: 'destructive' as const, icon: Ban },
};

export default function Invoices() {
  const { 
    invoices, 
    isLoading, 
    createInvoice, 
    markAsSent,
    cancelInvoice,
    issuedInvoices,
    sentInvoices,
    totalIssued,
    totalSent,
  } = useInvoices();
  const { contracts } = useContracts();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<InvoiceInsert>({
    client_name: '',
    service_description: '',
    amount_without_vat: 0,
    vat_rate: 0.21,
  });

  const handleContractSelect = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (contract) {
      const clientName = contract.opportunities?.leads?.contacts?.full_name || '';
      setFormData({
        ...formData,
        contract_id: contractId,
        client_name: clientName,
        amount_without_vat: contract.total_fee || 0,
        service_description: `Serviços de assessoria - ${contract.service_type}`,
      });
    }
  };

  const handleSubmit = () => {
    createInvoice.mutate(formData, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setFormData({
          client_name: '',
          service_description: '',
          amount_without_vat: 0,
          vat_rate: 0.21,
        });
      },
    });
  };

  const calculatedVat = formData.amount_without_vat * (formData.vat_rate || 0.21);
  const calculatedTotal = formData.amount_without_vat + calculatedVat;

  const columns: Column<Invoice>[] = [
    {
      key: 'invoice_number',
      header: 'Nº Fatura',
      cell: (item) => (
        <span className="font-mono font-semibold">{item.invoice_number}</span>
      ),
    },
    {
      key: 'issued_at',
      header: 'Emissão',
      cell: (item) => format(new Date(item.issued_at), 'dd/MM/yyyy', { locale: ptBR }),
    },
    {
      key: 'client_name',
      header: 'Cliente',
      cell: (item) => (
        <div>
          <p className="font-medium">{item.client_name}</p>
          {item.client_document && (
            <p className="text-xs text-muted-foreground">{item.client_document}</p>
          )}
        </div>
      ),
    },
    {
      key: 'service_description',
      header: 'Serviço',
      cell: (item) => (
        <span className="text-sm truncate max-w-[200px] block">{item.service_description}</span>
      ),
    },
    {
      key: 'amount_without_vat',
      header: 'Base',
      cell: (item) => `€${item.amount_without_vat.toFixed(2)}`,
    },
    {
      key: 'vat_amount',
      header: 'IVA (21%)',
      cell: (item) => `€${item.vat_amount.toFixed(2)}`,
    },
    {
      key: 'total_amount',
      header: 'Total',
      cell: (item) => (
        <span className="font-semibold">€{item.total_amount.toFixed(2)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (item) => {
        const badge = STATUS_BADGES[item.status];
        const Icon = badge.icon;
        return (
          <Badge variant={badge.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {badge.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      cell: (item) => (
        <div className="flex gap-2">
          {item.status === 'EMITIDA' && (
            <>
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  markAsSent.mutate(item.id);
                }}
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelInvoice.mutate(item.id);
                }}
              >
                <Ban className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost">
            <Download className="h-4 w-4" />
          </Button>
        </div>
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
        title="Faturas"
        description="Emissão e gestão de faturas com IVA"
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Fatura
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Emitir Fatura</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Vincular a Contrato (opcional)</Label>
                <Select onValueChange={handleContractSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um contrato" />
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Cliente *</Label>
                  <Input
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    placeholder="Nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Documento (NIE/Passaporte)</Label>
                  <Input
                    value={formData.client_document || ''}
                    onChange={(e) => setFormData({ ...formData, client_document: e.target.value })}
                    placeholder="Número do documento"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Endereço do Cliente</Label>
                <Input
                  value={formData.client_address || ''}
                  onChange={(e) => setFormData({ ...formData, client_address: e.target.value })}
                  placeholder="Endereço completo"
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição do Serviço *</Label>
                <Textarea
                  value={formData.service_description}
                  onChange={(e) => setFormData({ ...formData, service_description: e.target.value })}
                  placeholder="Descrição dos serviços prestados"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Valor Base (€) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount_without_vat}
                    onChange={(e) => setFormData({ ...formData, amount_without_vat: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Taxa IVA (%)</Label>
                  <Select 
                    value={String(formData.vat_rate)} 
                    onValueChange={(v) => setFormData({ ...formData, vat_rate: parseFloat(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.21">21% (Padrão)</SelectItem>
                      <SelectItem value="0.10">10% (Reduzido)</SelectItem>
                      <SelectItem value="0.04">4% (Super-reduzido)</SelectItem>
                      <SelectItem value="0">0% (Isento)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>IVA Calculado</Label>
                  <div className="h-10 flex items-center px-3 bg-muted rounded-md">
                    €{calculatedVat.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-md flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="h-5 w-5 text-primary" />
                  <span className="font-medium">Total da Fatura:</span>
                </div>
                <span className="text-2xl font-bold text-primary">€{calculatedTotal.toFixed(2)}</span>
              </div>

              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createInvoice.isPending || !formData.client_name || !formData.service_description}
              >
                {createInvoice.isPending ? 'Emitindo...' : 'Emitir Fatura'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Faturas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoices.length}</div>
            <p className="text-xs text-muted-foreground">Faturas emitidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Envio</CardTitle>
            <Receipt className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{issuedInvoices.length}</div>
            <p className="text-xs text-muted-foreground">€{totalIssued.toFixed(2)} em faturas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Enviadas</CardTitle>
            <Send className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{sentInvoices.length}</div>
            <p className="text-xs text-muted-foreground">€{totalSent.toFixed(2)} em faturas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">IVA a Recolher</CardTitle>
            <Euro className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              €{invoices.filter(i => i.status !== 'CANCELADA').reduce((sum, i) => sum + i.vat_amount, 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Total de IVA</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de faturas */}
      <Card>
        <CardHeader>
          <CardTitle>Faturas Emitidas</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={invoices} emptyMessage="Nenhuma fatura emitida" />
        </CardContent>
      </Card>
    </div>
  );
}
