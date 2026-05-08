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
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { CreditCard, Plus, Trash2, Loader2, Pencil } from 'lucide-react';
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

type LocalPayment = {
  id: string;
  amount: number;
  due_date: string | null;
  installment_number: number | null;
  payment_method: string;
  payment_form: string;
  status: string;
  contract_id?: string | null;
  lead_id?: string | null;
  contract_number?: string | null;
  lead_name?: string;
  paid_at?: string | null;
};

type FormState = {
  contract_id: string;
  lead_id: string;
  amount: string;
  due_date: string;
  installment_number: string;
  payment_method: PaymentMethod;
  payment_form: PaymentForm;
  status: PaymentStatus;
};

const emptyForm = (): FormState => ({
  contract_id: '',
  lead_id: '',
  amount: '',
  due_date: '',
  installment_number: '',
  payment_method: 'TRANSFERENCIA',
  payment_form: 'UNICO',
  status: 'PENDENTE',
});

export function ContactPaymentsSection({ contactId, contactName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: serviceTypes } = useServiceTypes();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payments, setPayments] = useState<LocalPayment[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ------ Queries ------
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
        .eq('status', 'APROVADO')
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
    const ctr = contracts.find(c => c.id === form.contract_id);
    if (ctr?.lead_id) {
      return [{ id: ctr.lead_id, service_type_id: null, service_interest: 'OUTRO' }];
    }
    return [];
  }, [form.contract_id, contractLeadLinks, contracts]);

  useEffect(() => {
    if (form.contract_id && leadsForContract.length === 1 && !form.lead_id) {
      setForm(f => ({ ...f, lead_id: leadsForContract[0].id }));
    }
  }, [form.contract_id, leadsForContract]);

  // Fetch existing payments for the selected contract+service (only when both selected and not currently editing)
  const { data: existingPayments = [], isFetching: loadingExisting } = useQuery({
    queryKey: ['existing-payments-picker', form.contract_id, form.lead_id],
    queryFn: async () => {
      if (!form.contract_id || !form.lead_id) return [];
      const { data: opp } = await supabase
        .from('opportunities').select('id').eq('lead_id', form.lead_id).limit(1).maybeSingle();
      if (!opp) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, due_date, installment_number, payment_method, payment_form, status, paid_at')
        .eq('contract_id', form.contract_id)
        .eq('opportunity_id', opp.id)
        .order('installment_number', { ascending: true, nullsFirst: false })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!form.contract_id && !!form.lead_id && open,
  });

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

      const payload = {
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

      if (editingId) {
        const { data, error } = await supabase.from('payments').update(payload).eq('id', editingId).select('id').single();
        if (error) throw error;
        return { ...data, _edited: true };
      } else {
        const { data, error } = await supabase.from('payments').insert([payload]).select('id').single();
        if (error) throw error;
        return { ...data, _edited: false };
      }
    },
    onSuccess: (data, variables) => {
      const ctr = contracts.find(c => c.id === variables.contract_id);
      const lead = leadsForContract.find((l: any) => l.id === variables.lead_id);
      const item: LocalPayment = {
        id: data.id,
        amount: Number(variables.amount),
        due_date: variables.due_date || null,
        installment_number: variables.installment_number ? Number(variables.installment_number) : null,
        payment_method: variables.payment_method,
        payment_form: variables.payment_form,
        status: variables.status,
        contract_id: variables.contract_id,
        lead_id: variables.lead_id,
        contract_number: ctr?.contract_number || null,
        lead_name: leadName(lead),
        paid_at: variables.status === 'CONFIRMADO' ? new Date().toISOString() : null,
      };
      setPayments(prev => {
        const exists = prev.some(p => p.id === item.id);
        return exists ? prev.map(p => p.id === item.id ? item : p) : [...prev, item];
      });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['existing-payments-picker'] });
      toast({ title: data._edited ? 'Pagamento atualizado' : 'Pagamento criado' });
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      setPayments(prev => prev.filter(p => p.id !== id));
      queryClient.invalidateQueries({ queryKey: ['existing-payments-picker'] });
      toast({ title: 'Pagamento removido' });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const handleNew = () => { setEditingId(null); setForm(emptyForm()); setOpen(true); };

  const handleEdit = async (p: LocalPayment) => {
    let contract_id = p.contract_id || '';
    let lead_id = p.lead_id || '';
    if (!contract_id || !lead_id) {
      const { data } = await supabase
        .from('payments')
        .select('contract_id, opportunity_id')
        .eq('id', p.id)
        .maybeSingle();
      if (data) {
        contract_id = data.contract_id || '';
        if (data.opportunity_id) {
          const { data: opp } = await supabase
            .from('opportunities').select('lead_id').eq('id', data.opportunity_id).maybeSingle();
          lead_id = opp?.lead_id || '';
        }
      }
    }
    setEditingId(p.id);
    setForm({
      contract_id,
      lead_id,
      amount: String(p.amount ?? ''),
      due_date: p.due_date || '',
      installment_number: p.installment_number ? String(p.installment_number) : '',
      payment_method: (p.payment_method || 'TRANSFERENCIA') as PaymentMethod,
      payment_form: (p.payment_form || 'UNICO') as PaymentForm,
      status: (p.status || 'PENDENTE') as PaymentStatus,
    });
    setOpen(true);
  };

  const loadExistingIntoForm = (p: any) => {
    setEditingId(p.id);
    setForm(f => ({
      ...f,
      amount: String(p.amount ?? ''),
      due_date: p.due_date || '',
      installment_number: p.installment_number ? String(p.installment_number) : '',
      payment_method: (p.payment_method || 'TRANSFERENCIA') as PaymentMethod,
      payment_form: (p.payment_form || 'UNICO') as PaymentForm,
      status: (p.status || 'PENDENTE') as PaymentStatus,
    }));
    // also reflect in local list so user sees it on the section
    const ctr = contracts.find(c => c.id === form.contract_id);
    const lead = leadsForContract.find((l: any) => l.id === form.lead_id);
    setPayments(prev => {
      if (prev.some(x => x.id === p.id)) return prev;
      return [...prev, {
        id: p.id,
        amount: Number(p.amount),
        due_date: p.due_date,
        installment_number: p.installment_number,
        payment_method: p.payment_method,
        payment_form: p.payment_form,
        status: p.status,
        contract_number: ctr?.contract_number || null,
        lead_name: leadName(lead),
        paid_at: p.paid_at,
      }];
    });
  };

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPaid = payments
    .filter(p => p.status === 'CONFIRMADO')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

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
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {contracts.length === 0
              ? 'Este contato ainda não possui contratos. Crie um contrato antes de registrar pagamentos.'
              : 'Nenhum pagamento registrado.'}
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-background">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">€ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {p.installment_number && (
                      <Badge variant="outline" className="text-xs">Parcela {p.installment_number}</Badge>
                    )}
                    {p.contract_number && (
                      <Badge variant="secondary" className="text-xs">{p.contract_number}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {p.lead_name || '—'}
                    {p.due_date && <> · Venc: {format(new Date(`${p.due_date}T12:00:00`), 'dd/MM/yyyy')}</>}
                    {p.payment_method && <> · {PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod] || p.payment_method}</>}
                  </p>
                </div>
                <StatusBadge
                  status={p.status || 'PENDENTE'}
                  label={PAYMENT_STATUS_LABELS[p.status as PaymentStatus] || p.status}
                />
                <div className="flex items-center gap-1">
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
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm()); setEditingId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar pagamento' : 'Novo pagamento'}</DialogTitle>
            <DialogDescription>
              Vincule o pagamento a um contrato e a um serviço de {contactName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Contrato *</Label>
                <Select value={form.contract_id} onValueChange={(v) => { setEditingId(null); setForm({ ...form, contract_id: v, lead_id: '' }); }}>
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
                <Select value={form.lead_id} onValueChange={(v) => { setEditingId(null); setForm({ ...form, lead_id: v }); }} disabled={!form.contract_id}>
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

              {/* Existing payments for the selected contract + service */}
              {form.contract_id && form.lead_id && (
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Pagamentos existentes deste serviço {loadingExisting && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                  </Label>
                  {existingPayments.length === 0 && !loadingExisting && (
                    <p className="text-xs text-muted-foreground italic">Nenhum pagamento existente. Preencha os campos abaixo para criar um novo.</p>
                  )}
                  {existingPayments.length > 0 && (
                    <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
                      {existingPayments.map((p: any) => {
                        const isSelected = editingId === p.id;
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => loadExistingIntoForm(p)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between gap-2 ${isSelected ? 'bg-muted' : ''}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">€ {Number(p.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              {p.installment_number && <Badge variant="outline" className="text-[10px] py-0">Parc. {p.installment_number}</Badge>}
                              {p.due_date && <span className="text-muted-foreground">{format(new Date(`${p.due_date}T12:00:00`), 'dd/MM/yyyy')}</span>}
                              <StatusBadge status={p.status} label={PAYMENT_STATUS_LABELS[p.status as PaymentStatus] || p.status} />
                            </div>
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {editingId && (
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-primary">Editando pagamento existente</span>
                      <button
                        type="button"
                        className="underline text-muted-foreground hover:text-foreground"
                        onClick={() => { setEditingId(null); setForm(f => ({ ...emptyForm(), contract_id: f.contract_id, lead_id: f.lead_id })); }}
                      >
                        Criar novo em vez de editar
                      </button>
                    </div>
                  )}
                </div>
              )}

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
              {editingId ? 'Salvar' : 'Criar'}
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
