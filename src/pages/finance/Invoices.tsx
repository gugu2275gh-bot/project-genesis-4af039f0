import { useEffect, useMemo, useState } from 'react';
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
  Euro,
  Trash2
} from 'lucide-react';
import { useInvoices, Invoice, InvoiceInsert } from '@/hooks/useInvoices';
import { useContracts } from '@/hooks/useContracts';
import { useContacts } from '@/hooks/useContacts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { downloadInvoice } from '@/lib/generate-invoice';
import { supabase } from '@/integrations/supabase/client';

// Parses an amount string that may be in JS format ("2500.00") or EU format ("2.500,00").
// If a comma exists, treat as EU: strip thousand dots, comma is decimal.
// Otherwise, treat dot as decimal separator (JS toFixed output).
function parseAmount(raw: string): number {
  const s = raw.trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s);
}

async function handleDownloadInvoice(inv: Invoice) {
  const issueDate = format(new Date(inv.issued_at), 'dd/MM/yyyy');
  const yearStr = format(new Date(inv.issued_at), 'yyyy');
  const numOnly = inv.invoice_number.includes('-')
    ? inv.invoice_number.split('-').slice(1).join('-')
    : inv.invoice_number;

  // Resolve bank account from the linked payment (or first payment of the contract)
  let bankName: string | undefined;
  let iban: string | undefined;
  let paymentAccountId: string | null = null;
  if (inv.payment_id) {
    const { data: pay } = await supabase
      .from('payments')
      .select('payment_account_id')
      .eq('id', inv.payment_id)
      .maybeSingle();
    paymentAccountId = (pay as any)?.payment_account_id || null;
  }
  if (!paymentAccountId && inv.contract_id) {
    const { data: pays } = await supabase
      .from('payments')
      .select('payment_account_id')
      .eq('contract_id', inv.contract_id)
      .not('payment_account_id', 'is', null)
      .limit(1);
    paymentAccountId = (pays && pays[0] as any)?.payment_account_id || null;
  }
  if (paymentAccountId) {
    const { data: acc } = await supabase
      .from('payment_accounts')
      .select('bank_name, account_name, account_details')
      .eq('id', paymentAccountId)
      .maybeSingle();
    if (acc) {
      bankName = (acc as any).bank_name || (acc as any).account_name || undefined;
      iban = (acc as any).account_details || undefined;
    }
  }
  const addressLines = inv.client_address
    ? inv.client_address.split(/\n|,\s*/).filter(Boolean)
    : [];
  let extras = (inv.additional_costs || {}) as Record<string, number>;
  // Fallback 1: taxes registered in the contract's costs
  if (Object.keys(extras).length === 0 && inv.contract_id) {
    const { data: costs } = await supabase
      .from('contract_costs')
      .select('description, amount')
      .eq('contract_id', inv.contract_id);
    if (costs && costs.length > 0) {
      extras = costs.reduce((acc, c) => {
        acc[c.description] = Number(c.amount) || 0;
        return acc;
      }, {} as Record<string, number>);
    }
  }
  // Fallback 2: parse "Outros Custos" from contact's payment_notes (Payment Agreement Dialog)
  if (Object.keys(extras).length === 0 && inv.contract_id) {
    const { data: contract } = await supabase
      .from('contracts')
      .select('opportunities:opportunity_id(leads:lead_id(contacts:contact_id(payment_notes)))')
      .eq('id', inv.contract_id)
      .single();
    const notes: string | undefined = (contract as any)?.opportunities?.leads?.contacts?.payment_notes;
    if (notes) {
      const blocks = notes.split(/\n---\n\n?/);
      const lastBlock = blocks[blocks.length - 1] || '';
      const lines = lastBlock.split('\n');
      const outIdx = lines.findIndex((l) => /^Outros Custos:/i.test(l.trim()));
      if (outIdx >= 0) {
        for (let i = outIdx + 1; i < lines.length; i++) {
          const m = lines[i].match(/^\s{2,}(.+?):\s*\+?\s*€\s*([\d.,]+)/);
          if (!m) break;
          const desc = m[1].trim();
          const amt = parseAmount(m[2]);
          if (desc && !isNaN(amt) && amt > 0) extras[desc] = amt;
        }
      }
    }
  }
  const extraItems = Object.entries(extras).map(([desc, amt]) => ({
    date: issueDate,
    description: desc,
    quantity: 1,
    amount: Number(amt) || 0,
  }));
  const pagosDelegados = Object.values(extras).reduce((s, v) => s + (Number(v) || 0), 0);
  // Total do PDF = serviço + IVA (sobre serviço) + taxas (taxas não entram no IVA)
  const totalLiquido = inv.amount_without_vat + inv.vat_amount + pagosDelegados;
  downloadInvoice({
    invoiceNumber: numOnly,
    year: yearStr,
    issueDate,
    clientName: inv.client_name,
    clientDocument: inv.client_document || undefined,
    clientAddressLines: addressLines,
    items: [
      {
        date: issueDate,
        description: inv.service_description,
        quantity: 1,
        amount: inv.amount_without_vat,
      },
      ...extraItems,
    ],
    honorarios: inv.amount_without_vat,
    pagosDelegados,
    vatBase: inv.amount_without_vat,
    vatRate: inv.vat_rate,
    vatAmount: inv.vat_amount,
    totalLiquido,
    bankName,
    iban,
  });
}

function EditExtrasDialog({
  invoice,
  onSave,
  isSaving,
}: {
  invoice: Invoice;
  onSave: (extras: Record<string, number>) => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initial = Object.entries((invoice.additional_costs || {}) as Record<string, number>).map(
    ([description, amount]) => ({ description, amount: Number(amount) || 0 })
  );
  const [rows, setRows] = useState<{ description: string; amount: number }[]>(
    initial.length ? initial : [{ description: '', amount: 0 }]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setRows(initial.length ? initial : [{ description: '', amount: 0 }]);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()} title="Editar taxas">
          <Euro className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Editar taxas — {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {rows.map((r, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
              <Input
                placeholder="Descrição (ex: Tasa 790)"
                value={r.description}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...next[idx], description: e.target.value };
                  setRows(next);
                }}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Valor (€)"
                value={r.amount || ''}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 };
                  setRows(next);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRows(rows.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows([...rows, { description: '', amount: 0 }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar taxa
          </Button>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={isSaving}
              onClick={() => {
                const clean = rows.filter((r) => r.description.trim() && r.amount > 0);
                const extras = clean.reduce((acc, r) => {
                  acc[r.description.trim()] = r.amount;
                  return acc;
                }, {} as Record<string, number>);
                onSave(extras);
                setOpen(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
    updateInvoice,
    markAsSent,
    cancelInvoice,
    issuedInvoices,
    sentInvoices,
    totalIssued,
    totalSent,
  } = useInvoices();

  const { contracts } = useContracts();
  const { contacts } = useContacts();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [formData, setFormData] = useState<InvoiceInsert>({
    client_name: '',
    service_description: '',
    amount_without_vat: 0,
    vat_rate: 0.21,
  });
  const [extraFees, setExtraFees] = useState<{ description: string; amount: number }[]>([]);
  const [contractExtrasMap, setContractExtrasMap] = useState<Record<string, number>>({});

  // Fallback: fetch contract_costs for invoices missing additional_costs (mirrors PDF logic)
  useEffect(() => {
    const contractIds = Array.from(
      new Set(
        (invoices || [])
          .filter((i) => {
            const ac = (i.additional_costs || {}) as Record<string, number>;
            return i.contract_id && Object.keys(ac).length === 0;
          })
          .map((i) => i.contract_id as string)
      )
    );
    if (contractIds.length === 0) {
      setContractExtrasMap({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('contract_costs')
        .select('contract_id, amount')
        .in('contract_id', contractIds);
      const map: Record<string, number> = {};
      (data || []).forEach((c: any) => {
        map[c.contract_id] = (map[c.contract_id] || 0) + (Number(c.amount) || 0);
      });
      setContractExtrasMap(map);
    })();
  }, [invoices]);

  const getInvoiceExtras = (inv: Invoice): number => {
    const ac = (inv.additional_costs || {}) as Record<string, number>;
    const own = Object.values(ac).reduce((s, v) => s + (Number(v) || 0), 0);
    if (own > 0) return own;
    if (inv.contract_id && contractExtrasMap[inv.contract_id]) return contractExtrasMap[inv.contract_id];
    return 0;
  };

  // Source clients from contacts table (so all registered clients appear, even without contracts)
  const clientsMap = new Map<string, { id: string; name: string; document?: string | null; address?: string | null }>();
  (contacts || []).forEach((c) => {
    if (!clientsMap.has(c.id)) {
      clientsMap.set(c.id, { id: c.id, name: c.full_name, document: c.document_number, address: c.address });
    }
  });
  const clients = Array.from(clientsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Filter contracts by selected client
  const clientContracts = selectedClientId
    ? contracts.filter((c) => c.opportunities?.leads?.contacts?.id === selectedClientId)
    : [];

  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  // Build services list from selected contract
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
      client_address: client?.address || '',
      contract_id: undefined,
      amount_without_vat: 0,
      service_description: '',
    }));
  };

  const contractEffectiveTotal = (contract: typeof contracts[number] | undefined) => {
    if (!contract) return 0;
    if (contract.total_fee && contract.total_fee > 0) return contract.total_fee;
    const paymentsSum = (contract.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return paymentsSum;
  };

  const handleContractSelect = async (contractId: string) => {
    setSelectedContractId(contractId);
    setSelectedServiceId('');
    const contract = contracts.find((c) => c.id === contractId);
    if (contract) {
      const rate = formData.vat_rate ?? 0.21;
      // Fetch payments to compute net honorarios: gross - discount
      const { data: pays } = await supabase
        .from('payments')
        .select('amount, gross_amount, discount_value, discount_type')
        .eq('contract_id', contractId);
      let netTotal = 0;
      if (pays && pays.length > 0) {
        const first: any = pays[0];
        const grossTotal = pays.reduce((s, p: any) => s + (Number(p.gross_amount) || Number(p.amount) || 0), 0);
        const discountVal = Number(first?.discount_value || 0);
        const isPercent = first?.discount_type === 'PERCENTUAL';
        const discountMoney = isPercent && grossTotal > 0 ? grossTotal * discountVal / 100 : discountVal;
        netTotal = Math.max(0, grossTotal - discountMoney);
      } else {
        netTotal = contractEffectiveTotal(contract);
      }
      // Honorários concluídos são a base sem IVA; o IVA é somado somente no final.
      const base = netTotal;
      setFormData((f) => ({
        ...f,
        contract_id: contractId,
        amount_without_vat: Math.round(base * 100) / 100,
        service_description: '',
      }));
    }
    // Auto-preencher taxas: primeiro contract_costs, depois "Outros Custos" do acordo de pagamento
    const { data: costs } = await supabase
      .from('contract_costs')
      .select('description, amount')
      .eq('contract_id', contractId);
    if (costs && costs.length > 0) {
      setExtraFees(costs.map((c) => ({ description: c.description, amount: Number(c.amount) || 0 })));
    } else {
      // Fallback: parse contact's payment_notes
      const { data: ct } = await supabase
        .from('contracts')
        .select('opportunities:opportunity_id(leads:lead_id(contacts:contact_id(payment_notes)))')
        .eq('id', contractId)
        .single();
      const notes: string | undefined = (ct as any)?.opportunities?.leads?.contacts?.payment_notes;
      const parsed: { description: string; amount: number }[] = [];
      if (notes) {
        const blocks = notes.split(/\n---\n\n?/);
        const lastBlock = blocks[blocks.length - 1] || '';
        const lines = lastBlock.split('\n');
        const outIdx = lines.findIndex((l) => /^Outros Custos:/i.test(l.trim()));
        if (outIdx >= 0) {
          for (let i = outIdx + 1; i < lines.length; i++) {
            const m = lines[i].match(/^\s{2,}(.+?):\s*\+?\s*€\s*([\d.,]+)/);
            if (!m) break;
            const desc = m[1].trim();
            const amt = parseAmount(m[2]);
            if (desc && !isNaN(amt) && amt > 0) parsed.push({ description: desc, amount: amt });
          }
        }
      }
      setExtraFees(parsed);
    }
  };

  const handleServiceSelect = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const svc = contractServices.find((s) => s.id === serviceId);
    if (svc) {
      setFormData((f) => ({
        ...f,
        service_description: `Serviços de assessoria - ${svc.name}`,
      }));
    }
  };

  const handleSubmit = () => {
    const cleanExtras = extraFees.filter((e) => e.description.trim() && e.amount > 0);
    const additional_costs = cleanExtras.reduce((acc, e) => {
      acc[e.description.trim()] = e.amount;
      return acc;
    }, {} as Record<string, number>);
    const payload: InvoiceInsert = {
      ...formData,
      ...(Object.keys(additional_costs).length ? { additional_costs } : {}),
    };
    createInvoice.mutate(payload, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setSelectedClientId('');
        setSelectedContractId('');
        setSelectedServiceId('');
        setExtraFees([]);
        setFormData({
          client_name: '',
          service_description: '',
          amount_without_vat: 0,
          vat_rate: 0.21,
        });
      },
    });
  };

  const extrasTotal = extraFees.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const vatRate = formData.vat_rate ?? 0.21;
  const calculatedVat = formData.amount_without_vat * vatRate;
  const calculatedTotal = formData.amount_without_vat + calculatedVat + extrasTotal;

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
      cell: (item) => {
        const extras = getInvoiceExtras(item);
        // Importe líquido da fatura = base + IVA + taxas adicionais
        const total = Number(item.amount_without_vat) + Number(item.vat_amount) + extras;
        return <span className="font-semibold">€{total.toFixed(2)}</span>;
      },
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
          <EditExtrasDialog
            invoice={item}
            isSaving={updateInvoice.isPending}
            onSave={(extras) =>
              updateInvoice.mutate({ id: item.id, additional_costs: Object.keys(extras).length ? extras : null })
            }
          />
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(item); }}>
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
                <Label>Contrato</Label>
                <Select
                  value={selectedContractId}
                  onValueChange={handleContractSelect}
                  disabled={!selectedClientId || clientContracts.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !selectedClientId
                        ? 'Selecione um cliente primeiro'
                        : clientContracts.length === 0
                          ? 'Nenhum contrato — preencha valor manualmente'
                          : 'Selecione um contrato (opcional)'
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {clientContracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.contract_number ? `Nº ${contract.contract_number} - ` : ''}€{contractEffectiveTotal(contract).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {contractServices.length > 0 && (
                <div className="space-y-2">
                  <Label>Serviço *</Label>
                  <Select
                    value={selectedServiceId}
                    onValueChange={handleServiceSelect}
                    disabled={!selectedContractId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o serviço a faturar" />
                    </SelectTrigger>
                    <SelectContent>
                      {contractServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Faturas são emitidas por serviço. O valor base é calculado a partir do total do contrato sem IVA.
                  </p>
                </div>
              )}

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
                    value={String(vatRate)} 
                    onValueChange={(v) => {
                      const newRate = parseFloat(v);
                      const contract = contracts.find((c) => c.id === selectedContractId);
                      if (contract) {
                        const total = contractEffectiveTotal(contract);
                        const base = newRate > 0 ? total / (1 + newRate) : total;
                        setFormData({ ...formData, vat_rate: newRate, amount_without_vat: Math.round(base * 100) / 100 });
                      } else {
                        setFormData({ ...formData, vat_rate: newRate });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.21">21% (Padrão)</SelectItem>
                      <SelectItem value="0.1">10% (Reduzido)</SelectItem>
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

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Taxas adicionais</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExtraFees([...extraFees, { description: '', amount: 0 }])}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Adicionar taxa
                  </Button>
                </div>
                {extraFees.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    As taxas aparecerão como linhas abaixo do serviço na fatura.
                  </p>
                )}
                {extraFees.map((fee, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
                    <Input
                      placeholder="Descrição da taxa (ex: Tasa 790)"
                      value={fee.description}
                      onChange={(e) => {
                        const next = [...extraFees];
                        next[idx] = { ...next[idx], description: e.target.value };
                        setExtraFees(next);
                      }}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Valor (€)"
                      value={fee.amount || ''}
                      onChange={(e) => {
                        const next = [...extraFees];
                        next[idx] = { ...next[idx], amount: parseFloat(e.target.value) || 0 };
                        setExtraFees(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setExtraFees(extraFees.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
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
                disabled={createInvoice.isPending || !selectedClientId || !formData.service_description || !formData.amount_without_vat}
              >
                {createInvoice.isPending ? 'Emitindo...' : 'Emitir Fatura'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Stats Cards */}
      {(() => {
        const cancelled = invoices.filter(i => i.status === 'CANCELADA');
        const valid = invoices.filter(i => i.status !== 'CANCELADA');
        const totalSentValue = sentInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
        const totalVat = valid.reduce((s, i) => s + (i.vat_amount || 0), 0);
        const totalBase = valid.reduce((s, i) => s + (i.amount_without_vat || 0), 0);
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Emitidas</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.length}</div>
                <p className="text-xs text-muted-foreground">Total geral</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Canceladas</CardTitle>
                <Ban className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{cancelled.length}</div>
                <p className="text-xs text-muted-foreground">Anuladas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Aguardando Envio</CardTitle>
                <Receipt className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{issuedInvoices.length}</div>
                <p className="text-xs text-muted-foreground">€{totalIssued.toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Enviadas ao Contador</CardTitle>
                <Send className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{sentInvoices.length}</div>
                <p className="text-xs text-muted-foreground">Quantidade</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Valor Enviado</CardTitle>
                <Euro className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">€{totalSentValue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Total faturas enviadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">IVA</CardTitle>
                <Euro className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">€{totalVat.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Base €{totalBase.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Tabela de faturas */}
      <InvoicesTable invoices={invoices} columns={columns} />
    </div>
  );
}

function InvoicesTable({ invoices, columns }: { invoices: Invoice[]; columns: Column<Invoice>[] }) {
  const [filterClient, setFilterClient] = useState('');
  const [filterNumber, setFilterNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const filtered = invoices.filter((i) => {
    if (filterClient && !i.client_name.toLowerCase().includes(filterClient.toLowerCase())) return false;
    if (filterNumber && !i.invoice_number.toLowerCase().includes(filterNumber.toLowerCase())) return false;
    if (filterStatus !== 'ALL' && i.status !== filterStatus) return false;
    const d = new Date(i.issued_at);
    if (filterFrom && d < new Date(filterFrom)) return false;
    if (filterTo && d > new Date(filterTo + 'T23:59:59')) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <Input placeholder="Buscar cliente" value={filterClient} onChange={(e) => setFilterClient(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nº Fatura</Label>
            <Input placeholder="Nº" value={filterNumber} onChange={(e) => setFilterNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="EMITIDA">Emitida</SelectItem>
                <SelectItem value="ENVIADA">Enviada</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </div>
        </div>
        <DataTable columns={columns} data={filtered} emptyMessage="Nenhuma fatura encontrada" />
      </CardContent>
    </Card>
  );
}
