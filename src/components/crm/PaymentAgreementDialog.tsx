import { useState, useMemo, useEffect } from 'react';
import { TitularLink } from '@/hooks/useContactBeneficiaries';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useContacts } from '@/hooks/useContacts';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { PAYMENT_METHOD_LABELS, PAYMENT_FORM_LABELS } from '@/types/database';
import { DollarSign, Plus, Trash2, CalendarIcon, ChevronsUpDown, Check, Star } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ServiceTypeCombobox } from '@/components/ui/service-type-combobox';
import { useServiceTypes } from '@/hooks/useServiceTypes';

export interface PaymentAgreementInitialData {
  amount?: number;
  payment_method?: string;
  payment_form?: string;
  apply_vat?: boolean;
  vat_rate?: number;
  discount_type?: string;
  discount_value?: number;
  gross_amount?: number;
  serviceTypeId?: string;
  due_date?: string;
  installments?: { amount: string; due_date: string }[];
  notes?: string;
  fees?: { description: string; amount: string }[];
  leadId?: string;
  opportunityId?: string;
}

interface PaymentAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  serviceTypeId?: string | null;
  onServiceTypeChange?: (serviceTypeId: string) => void;
  initialData?: PaymentAgreementInitialData | null;
  isBeneficiary?: boolean;
  titulares?: TitularLink[];
}

export function PaymentAgreementDialog({ open, onOpenChange, contactId, contactName, serviceTypeId, onServiceTypeChange, initialData, isBeneficiary = false, titulares = [] }: PaymentAgreementDialogProps) {
  const { updateContact } = useContacts();
  const { data: serviceTypes } = useServiceTypes();
  const queryClient = useQueryClient();
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState(serviceTypeId || '');
  const [selectedTitularId, setSelectedTitularId] = useState<string>('');

  const serviceTypeOptions = useMemo(() => 
    serviceTypes?.map(st => ({ code: st.id, name: st.name })) || [],
    [serviceTypes]
  );
  const { toast } = useToast();

  const defaultForm = {
    amount: '',
    payment_method: 'TRANSFERENCIA' as string,
    payment_form: 'UNICO' as string,
    custom_payment_method: '',
    transfer_origin: '' as '' | 'BRASIL' | 'ESPANHA',
    payment_account_id: '',
    discount_type: '' as '' | 'PERCENTUAL' | 'VALOR',
    discount_value: '',
    apply_vat: false,
    notes: '',
    due_date: '',
    installment_count: 2,
    installments: [] as { amount: string; due_date: string }[],
    fees: [] as { description: string; amount: string }[],
  };

  const [form, setForm] = useState(defaultForm);

  // Pre-fill form when dialog opens with initialData
  useEffect(() => {
    if (open && initialData) {
      setForm({
        ...defaultForm,
        amount: initialData.gross_amount?.toString() || initialData.amount?.toString() || '',
        payment_method: initialData.payment_method || 'TRANSFERENCIA',
        payment_form: initialData.payment_form || 'UNICO',
        apply_vat: initialData.apply_vat || false,
        discount_type: (initialData.discount_type || '') as '' | 'PERCENTUAL' | 'VALOR',
        discount_value: initialData.discount_value?.toString() || '',
        due_date: initialData.due_date || '',
        installment_count: initialData.installments?.length || 2,
        installments: initialData.installments || [],
        notes: initialData.notes || '',
        fees: initialData.fees || [],
      });
      if (initialData.serviceTypeId) {
        setSelectedServiceTypeId(initialData.serviceTypeId);
      }
    } else if (open && !initialData) {
      setForm(defaultForm);
      setSelectedServiceTypeId(serviceTypeId || '');
      // Auto-select titular if only one available
      setSelectedTitularId(titulares.length === 1 ? (titulares[0].contact_id || '') : '');
    }
  }, [open, initialData, serviceTypeId]);

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

  const filteredAccounts = paymentAccounts.filter(a =>
    !form.transfer_origin || a.country === form.transfer_origin
  );

  const totalFees = useMemo(() => {
    return form.fees.reduce((sum, fee) => sum + (parseFloat(fee.amount) || 0), 0);
  }, [form.fees]);

  const calculatedAmounts = useMemo(() => {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const gross = round2(parseFloat(form.amount) || 0);
    const vatRate = form.apply_vat ? (defaultVatRate || 21) / 100 : 0;
    const vatAmount = round2(gross * vatRate);
    const totalBeforeDiscount = round2(gross + vatAmount + totalFees);
    let discountAmount = 0;
    if (form.discount_type === 'PERCENTUAL') {
      discountAmount = round2(totalBeforeDiscount * ((parseFloat(form.discount_value) || 0) / 100));
    } else if (form.discount_type === 'VALOR') {
      discountAmount = round2(parseFloat(form.discount_value) || 0);
    }
    const finalAmount = round2(Math.max(0, totalBeforeDiscount - discountAmount));
    return { gross, discountAmount, totalBeforeDiscount, vatAmount, finalAmount, vatRate };
  }, [form.amount, form.discount_type, form.discount_value, form.apply_vat, defaultVatRate, totalFees]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (keepOpen = false) => {
    if (!form.amount || isSaving) return;
    // Validate titular selection for beneficiaries
    if (isBeneficiary && titulares.length > 0 && !selectedTitularId) {
      toast({ title: 'Selecione o titular do contrato', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
    await handleSaveInner(keepOpen);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInner = async (keepOpen = false) => {

    // Validate installment dates when PARCELADO
    if (form.payment_form === 'PARCELADO' && form.installments.length > 0) {
      const missingDates = form.installments.some(inst => !inst.due_date);
      if (missingDates) {
        toast({ title: 'Preencha todas as datas de vencimento das parcelas', variant: 'destructive' });
        return;
      }
    }

    const { finalAmount, gross, discountAmount, vatAmount } = calculatedAmounts;
    const methodLabel = PAYMENT_METHOD_LABELS[form.payment_method as keyof typeof PAYMENT_METHOD_LABELS] || form.payment_method;
    const formLabel = PAYMENT_FORM_LABELS[form.payment_form as keyof typeof PAYMENT_FORM_LABELS] || form.payment_form;

    const selectedServiceName = serviceTypeOptions.find(st => st.code === selectedServiceTypeId)?.name;
    let summary = `Acordo de Pagamento — ${new Date().toLocaleDateString('pt-BR')}\n`;
    if (selectedServiceName) {
      summary += `Serviço: ${selectedServiceName}\n`;
    }
    summary += `Valor Bruto: € ${gross.toFixed(2)}\n`;
    if (form.apply_vat) {
      summary += `IVA (${defaultVatRate || 21}%): + € ${vatAmount.toFixed(2)}\n`;
    }
    if (form.fees.length > 0) {
      form.fees.forEach(fee => {
        if (parseFloat(fee.amount) > 0) {
          summary += `${fee.description || 'Custo'}: + € ${parseFloat(fee.amount).toFixed(2)}\n`;
        }
      });
    }
    const totalBeforeDiscount = calculatedAmounts.totalBeforeDiscount;
    if (form.apply_vat || discountAmount > 0) {
      summary += `Total: € ${totalBeforeDiscount.toFixed(2)}\n`;
    }
    if (discountAmount > 0) {
      summary += `Desconto: - € ${discountAmount.toFixed(2)}`;
      if (form.discount_type === 'PERCENTUAL') summary += ` (${form.discount_value}%)`;
      summary += '\n';
    }
    summary += `Total Final: € ${finalAmount.toFixed(2)}\n`;
    summary += `Método: ${methodLabel}\n`;
    summary += `Forma: ${formLabel}\n`;
    if (form.payment_form === 'PARCELADO' && form.installments.length > 0) {
      summary += `Parcelas: ${form.installments.length}x\n`;
      form.installments.forEach((inst, idx) => {
        const dateStr = inst.due_date ? new Date(inst.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'A definir';
        summary += `  ${idx + 1}ª: € ${parseFloat(inst.amount || '0').toFixed(2)} — Venc: ${dateStr}\n`;
      });
    }
    if (form.transfer_origin) {
      summary += `Origem: ${form.transfer_origin}\n`;
      const selectedAcc = paymentAccounts.find(a => a.id === form.payment_account_id);
      if (selectedAcc) {
        summary += `Conta: ${selectedAcc.bank_name ? selectedAcc.bank_name + ' - ' : ''}${selectedAcc.account_name}\n`;
      }
    }
    if (form.custom_payment_method) {
      summary += `Detalhe: ${form.custom_payment_method}\n`;
    }
    if (form.notes) {
      summary += `Observações: ${form.notes}\n`;
    }

    // Determine which contact owns the lead/contract
    // For beneficiaries with a selected titular, the lead goes under the titular
    const leadOwnerContactId = (isBeneficiary && selectedTitularId) ? selectedTitularId : contactId;

    // Append new agreement to existing payment_notes on the lead owner's contact
    const { data: currentContact } = await supabase
      .from('contacts')
      .select('payment_notes')
      .eq('id', leadOwnerContactId)
      .single();

    const existingNotes = currentContact?.payment_notes || '';
    const separator = existingNotes ? '\n---\n\n' : '';

    // Add beneficiary name to summary when saving under titular
    const titularSummary = (isBeneficiary && selectedTitularId)
      ? `Beneficiário: ${contactName}\n` + summary
      : summary;

    await updateContact.mutateAsync({
      id: leadOwnerContactId,
      payment_notes: existingNotes + separator + titularSummary,
    });

    // Create or reuse a lead under the lead owner's contact
    let leadId: string | null = initialData?.leadId || null;
    if (selectedServiceTypeId && !leadId) {
      // Always create a new lead for new agreements — allows multiple services of the same type
      const { data: newLead, error: leadError } = await supabase.from('leads').insert({
        contact_id: leadOwnerContactId,
        service_type_id: selectedServiceTypeId,
        service_interest: 'OUTRO' as any,
        status: 'NOVO',
      }).select('id').single();
      if (leadError) {
        console.error('Error creating lead for service:', leadError);
      } else {
        leadId = newLead.id;
      }
    }

    // Create opportunity and payments if we have a lead and amount
    if (leadId && form.amount) {
      let opportunityId: string | null = initialData?.opportunityId || null;

      if (opportunityId) {
        // Editing: update existing opportunity directly
        const { error: oppUpdateError } = await supabase.from('opportunities').update({
          total_amount: finalAmount,
          status: 'PAGAMENTO_PENDENTE',
        }).eq('id', opportunityId);
        if (oppUpdateError) {
          console.error('Error updating opportunity:', oppUpdateError);
          toast({ title: 'Erro ao atualizar oportunidade', description: oppUpdateError.message, variant: 'destructive' });
        }
      } else {
        // Creating: find or create opportunity for this lead
        const { data: existingOpp, error: oppQueryError } = await supabase
          .from('opportunities')
          .select('id')
          .eq('lead_id', leadId)
          .limit(1);

        if (oppQueryError) {
          console.error('Error querying opportunities:', oppQueryError);
          toast({ title: 'Erro ao buscar oportunidade', description: oppQueryError.message, variant: 'destructive' });
        }

        if (existingOpp?.length) {
          opportunityId = existingOpp[0].id;
          const { error: oppUpdateError } = await supabase.from('opportunities').update({
            total_amount: finalAmount,
            status: 'PAGAMENTO_PENDENTE',
          }).eq('id', opportunityId);
          if (oppUpdateError) {
            console.error('Error updating opportunity:', oppUpdateError);
          }
        } else {
          const { data: newOpp, error: oppError } = await supabase.from('opportunities').insert({
            lead_id: leadId,
            total_amount: finalAmount,
            status: 'PAGAMENTO_PENDENTE',
          }).select('id').single();
          if (oppError) {
            console.error('Error creating opportunity:', oppError);
            toast({ title: 'Erro ao criar oportunidade', description: oppError.message, variant: 'destructive' });
          } else {
            opportunityId = newOpp.id;
          }
        }
      }

      if (opportunityId) {
        // Check if payments already exist for this opportunity
        const { data: existingPayments } = await supabase
          .from('payments')
          .select('id, status')
          .eq('opportunity_id', opportunityId);

        // Only create payments if none exist yet; otherwise update existing pending ones
        if (!existingPayments?.length) {
          const paymentMethod = form.payment_method as any;

          if (form.payment_form === 'PARCELADO' && form.installments.length > 0) {
            const paymentInserts = form.installments.map((inst, idx) => ({
              opportunity_id: opportunityId!,
              amount: Math.round((parseFloat(inst.amount) || 0) * 100) / 100,
              due_date: inst.due_date || null,
              installment_number: idx + 1,
              payment_method: paymentMethod,
              payment_form: 'PARCELADO' as any,
              status: 'PENDENTE' as any,
              gross_amount: gross,
              apply_vat: form.apply_vat,
              vat_rate: form.apply_vat ? (defaultVatRate || 21) / 100 : 0,
              discount_type: form.discount_type || null,
              discount_value: form.discount_value ? parseFloat(form.discount_value) : 0,
              beneficiary_contact_id: contactId,
            }));
            const { error: payError } = await supabase.from('payments').insert(paymentInserts);
            if (payError) {
              console.error('Error creating installment payments:', payError);
              toast({ title: 'Erro ao criar parcelas', description: payError.message, variant: 'destructive' });
            }
          } else {
            const { error: payError } = await supabase.from('payments').insert({
              opportunity_id: opportunityId,
              amount: finalAmount,
              payment_method: paymentMethod,
              payment_form: 'UNICO' as any,
              status: 'PENDENTE' as any,
              gross_amount: gross,
              apply_vat: form.apply_vat,
              vat_rate: form.apply_vat ? (defaultVatRate || 21) / 100 : 0,
              vat_amount: vatAmount,
              discount_type: form.discount_type || null,
              discount_value: form.discount_value ? parseFloat(form.discount_value) : 0,
              beneficiary_contact_id: contactId,
              due_date: form.due_date || null,
            });
            if (payError) {
              console.error('Error creating payment:', payError);
              toast({ title: 'Erro ao criar pagamento', description: payError.message, variant: 'destructive' });
            }
          }
        } else {
          // Update existing pending payments with new values
          const paymentMethod = form.payment_method as any;
          const pendingPayments = existingPayments.filter(p => p.status === 'PENDENTE');

          if (pendingPayments.length) {
            for (const pp of pendingPayments) {
              const { error: updateError } = await supabase.from('payments').update({
                amount: finalAmount,
                gross_amount: gross,
                payment_method: paymentMethod,
                payment_form: form.payment_form as any,
                apply_vat: form.apply_vat,
                vat_rate: form.apply_vat ? (defaultVatRate || 21) / 100 : 0,
                vat_amount: vatAmount,
                discount_type: form.discount_type || null,
                discount_value: form.discount_value ? parseFloat(form.discount_value) : 0,
              }).eq('id', pp.id);
              if (updateError) {
                console.error('Error updating payment:', updateError);
                toast({ title: 'Erro ao atualizar pagamento', description: updateError.message, variant: 'destructive' });
              }
            }
          }
        }
      }
    } else if (!leadId) {
      console.error('Lead não criado - serviço de interesse não selecionado');
    } else if (!form.amount) {
      console.error('Valor bruto não preenchido');
    }

    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-pending-leads', contactId] });
    queryClient.invalidateQueries({ queryKey: ['confirmed-lead-ids', contactId] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
    queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
    queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-payments', contactId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups', contactId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-contract-leads', contactId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-payments-in-groups', contactId] });
    queryClient.invalidateQueries({ queryKey: ['contact-service-cases', contactId] });
    // Also invalidate titular's queries if beneficiary flow
    if (isBeneficiary && selectedTitularId) {
      queryClient.invalidateQueries({ queryKey: ['contact-payments', selectedTitularId] });
      queryClient.invalidateQueries({ queryKey: ['contact-contracts', selectedTitularId] });
      queryClient.invalidateQueries({ queryKey: ['contract-leads', selectedTitularId] });
      queryClient.invalidateQueries({ queryKey: ['confirmed-lead-ids', selectedTitularId] });
      queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups', selectedTitularId] });
    }

    const titularName = titulares.find(t => t.contact_id === selectedTitularId)?.full_name;
    toast({ 
      title: 'Acordo de pagamento salvo', 
      description: isBeneficiary && titularName ? `Vinculado ao titular: ${titularName}` : undefined 
    });

    const resetForm = () => setForm({
      amount: '', payment_method: 'TRANSFERENCIA', payment_form: 'UNICO',
      custom_payment_method: '', transfer_origin: '', payment_account_id: '',
      discount_type: '', discount_value: '', apply_vat: false, notes: '',
      due_date: '', installment_count: 2, installments: [], fees: [],
    });

    if (keepOpen) {
      resetForm();
      setSelectedServiceTypeId('');
    } else {
      onOpenChange(false);
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Forma de Pagamento — {contactName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 min-w-0">
          {/* Service Type Selection */}
          <div className="min-w-0">
            <Label>Serviço de Interesse</Label>
            <ServiceTypeCombobox
              value={selectedServiceTypeId}
              onValueChange={(val) => {
                setSelectedServiceTypeId(val);
                onServiceTypeChange?.(val);
              }}
              serviceTypes={serviceTypeOptions}
            />
          </div>

          {/* Titular selector for beneficiaries */}
          {isBeneficiary && titulares.length > 0 && (
            <div className="min-w-0">
              <Label>Titular do Contrato *</Label>
              <Select value={selectedTitularId} onValueChange={setSelectedTitularId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o titular..." />
                </SelectTrigger>
                <SelectContent>
                  {titulares.map((t, idx) => (
                    <SelectItem key={t.contact_id || idx} value={t.contact_id || ''}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                O serviço será vinculado ao contrato deste titular
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Valor Bruto (€)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1500.00"
              />
            </div>
            <div>
              <Label>Método de Pagamento</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={form.payment_form} onValueChange={(v) => {
                const newInstallments = v === 'PARCELADO'
                  ? Array.from({ length: form.installment_count }, () => ({ amount: '', due_date: '' }))
                  : [];
                setForm({ ...form, payment_form: v, installments: newInstallments });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                checked={form.apply_vat}
                onCheckedChange={(checked) => setForm({ ...form, apply_vat: checked })}
              />
            </div>
          </div>

          {/* Due date for UNICO */}
          {form.payment_form === 'UNICO' && (
            <div>
              <Label>Data de Vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.due_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.due_date ? format(new Date(form.due_date + 'T00:00:00'), 'dd/MM/yyyy') : 'Selecionar data (opcional)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.due_date ? new Date(form.due_date + 'T00:00:00') : undefined}
                    onSelect={(date) => setForm({ ...form, due_date: date ? format(date, 'yyyy-MM-dd') : '' })}
                    locale={pt}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Installments when PARCELADO */}
          {form.payment_form === 'PARCELADO' && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <Label>Quantidade de Parcelas</Label>
                <Select
                  value={String(form.installment_count)}
                  onValueChange={(v) => {
                    const count = parseInt(v);
                    const newInstallments = Array.from({ length: count }, (_, i) => ({
                      amount: form.installments[i]?.amount || '',
                      due_date: form.installments[i]?.due_date || '',
                    }));
                    setForm({ ...form, installment_count: count, installments: newInstallments });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.installments.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground">
                    <span className="w-8">#</span>
                    <span>Valor (€)</span>
                    <span>Vencimento <span className="text-destructive">*</span></span>
                  </div>
                  {form.installments.map((inst, idx) => (
                    <div key={idx} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                      <span className="w-8 text-sm text-muted-foreground font-medium">{idx + 1}</span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={inst.amount}
                        onChange={(e) => {
                          const updated = [...form.installments];
                          updated[idx] = { ...updated[idx], amount: e.target.value };
                          setForm({ ...form, installments: updated });
                        }}
                      />
                      <Input
                        type="date"
                        value={inst.due_date}
                        onChange={(e) => {
                          const updated = [...form.installments];
                          updated[idx] = { ...updated[idx], due_date: e.target.value };
                          setForm({ ...form, installments: updated });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.payment_method === 'OUTRO' && (
            <div>
              <Label>Detalhe do método de pagamento *</Label>
              <Input
                value={form.custom_payment_method}
                onChange={(e) => setForm({ ...form, custom_payment_method: e.target.value })}
                placeholder="Descreva o método de pagamento"
              />
            </div>
          )}

          {form.payment_method === 'TRANSFERENCIA' && (
            <div className="space-y-4 rounded-lg border p-3">
              <Label className="text-sm font-semibold">Dados da Transferência</Label>
              <div>
                <Label>Origem *</Label>
                <div className="flex items-center gap-6 mt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pa-origin-brasil"
                      checked={form.transfer_origin === 'BRASIL'}
                      onCheckedChange={(checked) => setForm({ ...form, transfer_origin: checked ? 'BRASIL' : '', payment_account_id: '' })}
                    />
                    <Label htmlFor="pa-origin-brasil" className="font-normal cursor-pointer">Brasil</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pa-origin-espanha"
                      checked={form.transfer_origin === 'ESPANHA'}
                      onCheckedChange={(checked) => setForm({ ...form, transfer_origin: checked ? 'ESPANHA' : '', payment_account_id: '' })}
                    />
                    <Label htmlFor="pa-origin-espanha" className="font-normal cursor-pointer">Espanha</Label>
                  </div>
                </div>
              </div>
              {form.transfer_origin && (
                <div>
                  <Label>Conta Bancária *</Label>
                  {filteredAccounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">Nenhuma conta cadastrada para {form.transfer_origin === 'BRASIL' ? 'Brasil' : 'Espanha'}.</p>
                  ) : (
                    <Select value={form.payment_account_id} onValueChange={(v) => setForm({ ...form, payment_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a conta bancária" /></SelectTrigger>
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
              {form.payment_account_id && (() => {
                const selectedAcc = paymentAccounts.find(a => a.id === form.payment_account_id);
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

          {/* Non-transfer origin */}
          {form.payment_method !== 'TRANSFERENCIA' && (
            <div>
              <Label className="mb-3 block">Origem da transferência</Label>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pa-gen-origin-brasil"
                    checked={form.transfer_origin === 'BRASIL'}
                    onCheckedChange={(checked) => setForm({ ...form, transfer_origin: checked ? 'BRASIL' : '' })}
                  />
                  <Label htmlFor="pa-gen-origin-brasil" className="font-normal cursor-pointer">Brasil</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pa-gen-origin-espanha"
                    checked={form.transfer_origin === 'ESPANHA'}
                    onCheckedChange={(checked) => setForm({ ...form, transfer_origin: checked ? 'ESPANHA' : '' })}
                  />
                  <Label htmlFor="pa-gen-origin-espanha" className="font-normal cursor-pointer">Espanha</Label>
                </div>
              </div>
            </div>
          )}

          {/* Discount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Desconto</Label>
              <Select
                value={form.discount_type || '_none'}
                onValueChange={(v) => setForm({ ...form, discount_type: v === '_none' ? '' : v as any })}
              >
                <SelectTrigger><SelectValue placeholder="Sem desconto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem desconto</SelectItem>
                  <SelectItem value="PERCENTUAL">Percentual (%)</SelectItem>
                  <SelectItem value="VALOR">Valor fixo (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.discount_type && (
              <div>
                <Label>{form.discount_type === 'PERCENTUAL' ? 'Desconto (%)' : 'Desconto (€)'}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                  placeholder={form.discount_type === 'PERCENTUAL' ? '10' : '100.00'}
                />
              </div>
            )}
          </div>

          {/* Taxas / Fees */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Outros Custos</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, fees: [...form.fees, { description: '', amount: '' }] })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar custo
              </Button>
            </div>
            {form.fees.map((fee, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Descrição *</Label>
                  <Input
                    value={fee.description}
                    onChange={(e) => {
                      const updated = [...form.fees];
                      updated[idx] = { ...updated[idx], description: e.target.value };
                      setForm({ ...form, fees: updated });
                    }}
                    placeholder="Tradução juramentada, Taxa 790, CCSE, etc."
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor (EUR) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28"
                    value={fee.amount}
                    onChange={(e) => {
                      const updated = [...form.fees];
                      updated[idx] = { ...updated[idx], amount: e.target.value };
                      setForm({ ...form, fees: updated });
                    }}
                    placeholder="150.00"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => {
                    const updated = form.fees.filter((_, i) => i !== idx);
                    setForm({ ...form, fees: updated });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {(form.amount && (form.discount_type || form.apply_vat || totalFees > 0)) && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Bruto</span>
                <span>€ {calculatedAmounts.gross.toFixed(2)}</span>
              </div>
              {form.apply_vat && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA ({defaultVatRate || 21}%)</span>
                  <span>+ € {calculatedAmounts.vatAmount.toFixed(2)}</span>
                </div>
              )}
              {form.fees.filter(f => parseFloat(f.amount) > 0).map((fee, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-muted-foreground">{fee.description || 'Custo'}</span>
                  <span>+ € {parseFloat(fee.amount).toFixed(2)}</span>
                </div>
              ))}
              {(form.apply_vat && calculatedAmounts.discountAmount > 0) && (
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

          {/* Notes */}
          <div>
            <Label>Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observações adicionais sobre o acordo..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSave(true)}
              disabled={!form.amount || isSaving || (form.payment_form === 'PARCELADO' && form.installments.some(i => !i.due_date))}
            >
              {isSaving ? (
                <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Salvar e Adicionar Novo
            </Button>
            <Button
              onClick={() => handleSave(false)}
              disabled={!form.amount || isSaving || (form.payment_form === 'PARCELADO' && form.installments.some(i => !i.due_date))}
            >
              {isSaving ? (
                <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              {isSaving ? 'Salvando...' : 'Salvar Acordo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
