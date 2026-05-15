import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Receipt as ReceiptIcon, Euro, Download, CheckCircle2 } from 'lucide-react';
import { useContracts } from '@/hooks/useContracts';
import { downloadReceipt, generateReceiptNumber } from '@/lib/generate-receipt';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useReceipts } from '@/hooks/useReceipts';
import { format } from 'date-fns';

const PAYMENT_METHODS = [
  { value: 'TRANSFERENCIA', label: 'Transferência Bancária' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
  { value: 'PIX', label: 'PIX' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'BIZUM', label: 'Bizum' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'STRIPE', label: 'Stripe' },
  { value: 'OUTRO', label: 'Outro' },
];

export default function Receipts() {
  const { contracts } = useContracts();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedContractId, setSelectedContractId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [formData, setFormData] = useState({
    client_name: '',
    client_document: '',
    description: '',
    amount: 0,
    currency: 'EUR',
    payment_method: 'TRANSFERENCIA',
    payment_date: new Date().toISOString().slice(0, 10),
    transaction_id: '',
  });

  const clientsMap = new Map<string, { id: string; name: string; document?: string | null }>();
  contracts.forEach((c) => {
    const contact = c.opportunities?.leads?.contacts;
    if (contact?.id && !clientsMap.has(contact.id)) {
      clientsMap.set(contact.id, {
        id: contact.id,
        name: contact.full_name,
        document: (contact as { document_number?: string | null }).document_number ?? null,
      });
    }
  });
  const clients = Array.from(clientsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const clientContracts = selectedClientId
    ? contracts.filter((c) => c.opportunities?.leads?.contacts?.id === selectedClientId)
    : [];

  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  const contractServices: { id: string; name: string }[] = [];
  if (selectedContract) {
    const mainLead = selectedContract.opportunities?.leads;
    if (mainLead) {
      contractServices.push({
        id: mainLead.id,
        name: mainLead.service_types?.name || mainLead.service_interest || 'Serviço',
      });
    }
    selectedContract.contract_leads?.forEach((cl) => {
      if (cl.leads && !contractServices.find((s) => s.id === cl.leads.id)) {
        contractServices.push({
          id: cl.leads.id,
          name: cl.leads.service_types?.name || cl.leads.service_interest || 'Serviço',
        });
      }
    });
  }

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedContractId('');
    setSelectedServiceId('');
    const client = clientsMap.get(clientId);
    setFormData((f) => ({
      ...f,
      client_name: client?.name || '',
      client_document: client?.document || '',
      amount: 0,
      description: '',
    }));
  };

  const handleContractSelect = (contractId: string) => {
    setSelectedContractId(contractId);
    setSelectedServiceId('');
    const contract = contracts.find((c) => c.id === contractId);
    if (contract) {
      setFormData((f) => ({
        ...f,
        amount: contract.total_fee || 0,
      }));
    }
  };

  const handleServiceSelect = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const svc = contractServices.find((s) => s.id === serviceId);
    if (svc) {
      setFormData((f) => ({
        ...f,
        description: `Serviços de assessoria - ${svc.name}`,
      }));
    }
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedContractId('');
    setSelectedServiceId('');
    setFormData({
      client_name: '',
      client_document: '',
      description: '',
      amount: 0,
      currency: 'EUR',
      payment_method: 'TRANSFERENCIA',
      payment_date: new Date().toISOString().slice(0, 10),
      transaction_id: '',
    });
  };

  const handleSubmit = () => {
    const receiptNumber = generateReceiptNumber();
    const methodLabel =
      PAYMENT_METHODS.find((m) => m.value === formData.payment_method)?.label || formData.payment_method;
    try {
      downloadReceipt({
        receiptNumber,
        clientName: formData.client_name,
        clientDocument: formData.client_document || undefined,
        amount: formData.amount,
        currency: formData.currency,
        paymentMethod: methodLabel,
        paymentDate: new Date(formData.payment_date).toLocaleDateString('pt-BR'),
        transactionId: formData.transaction_id || undefined,
        description: formData.description,
      });
      toast({ title: 'Recibo gerado', description: `Nº ${receiptNumber}` });
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao gerar recibo', description: message, variant: 'destructive' });
    }
  };

  const canSubmit =
    !!formData.client_name && !!formData.description && formData.amount > 0 && !!formData.payment_method;

  return (
    <div className="space-y-6">
      <PageHeader title="Recibos" description="Emissão e gestão de recibos financeiros">
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Recibo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Emitir Recibo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={selectedClientId} onValueChange={handleClientSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Contrato *</Label>
                <Select
                  value={selectedContractId}
                  onValueChange={handleContractSelect}
                  disabled={!selectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedClientId ? 'Selecione um contrato' : 'Selecione um cliente primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientContracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.contract_number ? `Nº ${contract.contract_number} - ` : ''}€{contract.total_fee?.toFixed(2) || '0.00'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Serviço *</Label>
                <Select
                  value={selectedServiceId}
                  onValueChange={handleServiceSelect}
                  disabled={!selectedContractId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedContractId ? 'Selecione um serviço' : 'Selecione um contrato primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {contractServices.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                    value={formData.client_document}
                    onChange={(e) => setFormData({ ...formData, client_document: e.target.value })}
                    placeholder="Número do documento"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Concepto do recibo"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Moeda</Label>
                  <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="BRL">BRL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data do Pagamento *</Label>
                  <Input
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Método de Pagamento *</Label>
                  <Select
                    value={formData.payment_method}
                    onValueChange={(v) => setFormData({ ...formData, payment_method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>ID Transação</Label>
                  <Input
                    value={formData.transaction_id}
                    onChange={(e) => setFormData({ ...formData, transaction_id: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-md flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="h-5 w-5 text-primary" />
                  <span className="font-medium">Total do Recibo:</span>
                </div>
                <span className="text-2xl font-bold text-primary">
                  {formData.amount.toFixed(2)} {formData.currency}
                </span>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={!canSubmit}>
                Emitir Recibo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptIcon className="h-5 w-5" /> Recibos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Em breve: listagem e histórico de recibos emitidos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
