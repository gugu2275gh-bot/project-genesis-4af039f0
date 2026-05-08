import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { CreditCard, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_FORM_LABELS,
  SERVICE_INTEREST_LABELS,
  type PaymentMethod, type PaymentStatus, type PaymentForm,
} from '@/types/database';

interface Props {
  contactId: string;
  contactName: string;
}

type FormState = {
  id: string | null;
  contract_id: string;
  lead_id: string;
  amount: string;
  due_date: string;
  installment_number: string;
  payment_method: PaymentMethod;
  payment_form: PaymentForm;
  status: PaymentStatus;
  notes: string;
};

const emptyForm = (): FormState => ({
  id: null,
  contract_id: '',
  lead_id: '',
  amount: '',
  due_date: '',
  installment_number: '',
  payment_method: 'TRANSFERENCIA',
  payment_form: 'UNICO',
  status: 'PENDENTE',
  notes: '',
});

export function ContactPaymentsSection({ contactId, contactName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: serviceTypes } = useServiceTypes();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ------ Queries ------
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['contact-avulso-payments', contactId],
    queryFn: async () => {
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      const leadIds = (cLeads || []).map(l => l.id);
      let oppIds: string[] = [];
      if (leadIds.length) {
        const { data: opps } = await supabase.from('opportunities').select('id').in('lead_id', leadIds);
        oppIds = (opps || []).map(o => o.id);
      }
      // payments via own opportunities OR via beneficiary_contact_id
      const orFilters: string[] = [];
      if (oppIds.length) orFilters.push(`opportunity_id.in.(${oppIds.join(',')})`);
      orFilters.push(`beneficiary_contact_id.eq.${contactId}`);
      const { data, error } = await supabase
        .from('payments')
        .select('*, contracts(id, contract_number), opportunities(id, lead_id, leads(id, service_type_id, service_interest))')
        .or(orFilters.join(','))
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contact-contracts-picker', contactId],
    queryFn: async () => {
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      const leadIds = (cLeads || []).map(l => l.id);
      if (!leadIds.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id, lead_id').in('lead_id', leadIds);
      if (!opps?.length) return [];
      const { data: ctrs } = await supabase
        .from('contracts')
        .select('id, contract_number, status, opportunity_id')
        .in('opportunity_id', opps.map(o => o.id))
        .order('created_at', { ascending: false });
      return (ctrs || []).map(c => ({
        ...c,
        lead_id: opps.find(o => o.id === c.opportunity_id)?.lead_id,
      }));
    },
  });

  const { data: contractLeadLinks = [] } = useQuery({
    queryKey: ['contact-contract-leads-picker', contactId, contracts.map(c => c.id).join(',')],
    queryFn: async () => {
      if (!contracts.length) return [];
      const { data } = await supabase
        .from('contract_leads')
        .select('contract_id, lead_id, leads(id, contact_id, service_type_id, service_interest, contacts(full_name))')
        .in('contract_id', contracts.map(c => c.id));
      return data || [];
    },
    enabled: contracts.length > 0,
  });

  // ------ Helpers ------
  const leadName = (lead: any) => {
    if (!lead) return '—';
    const st = lead.service_type_id ? serviceTypes?.find(t => t.id === lead.service_type_id)?.name : null;
    return st || SERVICE_INTEREST_LABELS[(lead.service_interest as keyof typeof SERVICE_INTEREST_LABELS) || 'OUTRO'] || 'Serviço';
  };

  const leadsForContract = useMemo(() => {
    if (!form.contract_id) return [];
    const links = contractLeadLinks.filter((cl: any) => cl.contract_id === form.contract_id);
    if (links.length) return links.map((cl: any) => cl.leads).filter(Boolean);
    // fallback via opportunity
    const ctr = contracts.find(c => c.id === form.contract_id);
    if (ctr?.lead_id) {
      const fromPayments = payments.find((p: any) => p.opportunities?.lead_id === ctr.lead_id);
      const lead = fromPayments?.opportunities?.leads;
      return lead ? [lead] : [{ id: ctr.lead_id, service_type_id: null, service_interest: 'OUTRO' }];
    }
    return [];
  }, [form.contract_id, contractLeadLinks, contracts, payments, serviceTypes]);

  // Reset lead when contract changes
  useEffect(() => {
    if (form.contract_id && leadsForContract.length === 1) {
      setForm(f => ({ ...f, lead_id: leadsForContract[0].id }));
    }
  }, [form.contract_id, leadsForContract]);

  // ------ Mutations ------
  const upsertPayment = useMutation({
    mutationFn: async (f: FormState) => {
      if (!f.contract_id) throw new Error('Selecione o contrato');
      if (!f.lead_id) throw new Error('Selecione o serviço');
      if (!f.amount || Number(f.amount) <= 0) throw new Error('Informe um valor válido');

      const { data: opp, error: oppErr } = await supabase
        .from('opportunities').select('id').eq('lead_id', f.lead_id).limit(1).maybeSingle();
      if (oppErr) throw oppErr;
      if (!opp) throw new Error('Não foi possível localizar a oportunidade do serviço selecionado');

      const payload: any = {
        contract_id: f.contract_id,
        opportunity_id: opp.id,
        amount: Number(f.amount),
        due_date: f.due_date || null,
        installment_number: f.installment_number ? Number(f.installment_number) : null,
        payment_method: f.payment_method,
        payment_form: f.payment_form,
        status: f.status,
        paid_at: f.status === 'CONFIRMADO' ? new Date().toISOString() : null,
      };

      if (f.id) {
        const { error } = await supabase.from('payments').update(payload).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payments').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-avulso-payments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: form.id ? 'Pagamento atualizado' : 'Pagamento criado' });
      setOpen(false);
      setForm(emptyForm());
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-avulso-payments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
      toast({ title: 'Pagamento excluído' });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleEdit = (p: any) => {
    setForm({
      id: p.id,
      contract_id: p.contract_id || '',
      lead_id: p.opportunities?.lead_id || '',
      amount: String(p.amount ?? ''),
      due_date: p.due_date || '',
      installment_number: p.installment_number ? String(p.installment_number) : '',
      payment_method: (p.payment_method || 'TRANSFERENCIA') as PaymentMethod,
      payment_form: (p.payment_form || 'UNICO') as PaymentForm,
      status: (p.status || 'PENDENTE') as PaymentStatus,
      notes: '',
    });
    setOpen(true);
  };

  const handleNew = () => { setForm(emptyForm()); setOpen(true); };

  const total = payments.reduce((s, p: any) => s + Number(p.amount || 0), 0);
  const totalPaid = payments
    .filter((p: any) => p.status === 'CONFIRMADO')
    .reduce((s, p: any) => s + Number(p.amount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pagamentos ({payments.length})
            </CardTitle>
            <CardDescription>
              Pagamentos avulsos vinculados a um contrato e serviço deste cliente
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleNew} disabled={!contracts.length}>
            <Plus className="h-4 w-4 mr-1" /> Novo pagamento
          </Button>
        </div>
        {payments.length > 0 && (
          <div className="flex gap-4 pt-2 text-sm">
            <span className="text-muted-foreground">Total: <strong className="text-foreground">€ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
            <span className="text-muted-foreground">Pago: <strong className="text-emerald-600">€ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {contracts.length === 0
              ? 'Este contato ainda não possui contratos. Crie um contrato antes de registrar pagamentos.'
              : 'Nenhum pagamento registrado.'}
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-background">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">€ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {p.installment_number && (
                      <Badge variant="outline" className="text-xs">Parcela {p.installment_number}</Badge>
                    )}
                    {p.contracts?.contract_number && (
                      <Badge variant="secondary" className="text-xs">{p.contracts.contract_number}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {leadName(p.opportunities?.leads)}
                    {p.due_date && <> · Venc: {format(new Date(`${p.due_date}T12:00:00`), 'dd/MM/yyyy')}</>}
                    {p.payment_method && <> · {PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod] || p.payment_method}</>}
                  </p>
                </div>
                <StatusBadge
                  status={p.status || 'PENDENTE'}
                  label={PAYMENT_STATUS_LABELS[p.status as PaymentStatus] || p.status}
                />
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(p)} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(p.id)} title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyForm()); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar pagamento' : 'Novo pagamento avulso'}</DialogTitle>
            <DialogDescription>
              Vincule o pagamento a um contrato e a um serviço de {contactName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Contrato *</Label>
                <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v, lead_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
                  <SelectContent>
                    {contracts.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.contract_number || `Rascunho ${c.id.slice(0, 6)}`} {c.status ? `· ${c.status}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label>Serviço *</Label>
                <Select value={form.lead_id} onValueChange={(v) => setForm({ ...form, lead_id: v })} disabled={!form.contract_id}>
                  <SelectTrigger><SelectValue placeholder={form.contract_id ? 'Selecione o serviço' : 'Selecione um contrato primeiro'} /></SelectTrigger>
                  <SelectContent>
                    {leadsForContract.map((l: any) => (
                      <SelectItem key={l.id} value={l.id}>
                        {leadName(l)}{l.contacts?.full_name && l.contact_id !== contactId ? ` (${l.contacts.full_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor (€) *</Label>
                <Input
                  type="text" inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(',', '.') })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>

              <div>
                <Label>Forma</Label>
                <Select value={form.payment_form} onValueChange={(v) => setForm({ ...form, payment_form: v as PaymentForm })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_FORM_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Parcela nº</Label>
                <Input
                  type="number" min="1"
                  value={form.installment_number}
                  onChange={(e) => setForm({ ...form, installment_number: e.target.value })}
                  placeholder="—"
                />
              </div>

              <div>
                <Label>Método</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as PaymentStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={upsertPayment.isPending}>Cancelar</Button>
            <Button onClick={() => upsertPayment.mutate(form)} disabled={upsertPayment.isPending}>
              {upsertPayment.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {form.id ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir pagamento?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deletePayment.isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deletePayment.mutate(deleteId)} disabled={deletePayment.isPending}>
              {deletePayment.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
