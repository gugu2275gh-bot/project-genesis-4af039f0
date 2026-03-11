import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { PAYMENT_METHOD_LABELS, PAYMENT_FORM_LABELS } from '@/types/database';
import { DollarSign } from 'lucide-react';
import { ServiceTypeCombobox } from '@/components/ui/service-type-combobox';
import { useServiceTypes } from '@/hooks/useServiceTypes';

interface PaymentAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  serviceTypeId?: string | null;
  onServiceTypeChange?: (serviceTypeId: string) => void;
}

export function PaymentAgreementDialog({ open, onOpenChange, contactId, contactName, serviceTypeId, onServiceTypeChange }: PaymentAgreementDialogProps) {
  const { updateContact } = useContacts();
  const { data: serviceTypes } = useServiceTypes();
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState(serviceTypeId || '');

  const serviceTypeOptions = useMemo(() => 
    serviceTypes?.map(st => ({ code: st.id, name: `${st.code} - ${st.name}` })) || [],
    [serviceTypes]
  );
  const { toast } = useToast();

  const [form, setForm] = useState({
    amount: '',
    payment_method: 'PIX' as string,
    payment_form: 'UNICO' as string,
    custom_payment_method: '',
    transfer_origin: '' as '' | 'BRASIL' | 'ESPANHA',
    payment_account_id: '',
    discount_type: '' as '' | 'PERCENTUAL' | 'VALOR',
    discount_value: '',
    apply_vat: false,
    notes: '',
    installment_count: 2,
    installments: [] as { amount: string; due_date: string }[],
  });

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

  const calculatedAmounts = useMemo(() => {
    const gross = parseFloat(form.amount) || 0;
    const vatRate = form.apply_vat ? (defaultVatRate || 21) / 100 : 0;
    const vatAmount = gross * vatRate;
    const totalBeforeDiscount = gross + vatAmount;
    let discountAmount = 0;
    if (form.discount_type === 'PERCENTUAL') {
      discountAmount = totalBeforeDiscount * ((parseFloat(form.discount_value) || 0) / 100);
    } else if (form.discount_type === 'VALOR') {
      discountAmount = parseFloat(form.discount_value) || 0;
    }
    const finalAmount = Math.max(0, totalBeforeDiscount - discountAmount);
    return { gross, discountAmount, totalBeforeDiscount, vatAmount, finalAmount, vatRate };
  }, [form.amount, form.discount_type, form.discount_value, form.apply_vat, defaultVatRate]);

  const handleSave = async () => {
    if (!form.amount) return;

    const { finalAmount, gross, discountAmount, vatAmount } = calculatedAmounts;
    const methodLabel = PAYMENT_METHOD_LABELS[form.payment_method as keyof typeof PAYMENT_METHOD_LABELS] || form.payment_method;
    const formLabel = PAYMENT_FORM_LABELS[form.payment_form as keyof typeof PAYMENT_FORM_LABELS] || form.payment_form;

    let summary = `Acordo de Pagamento — ${new Date().toLocaleDateString('pt-BR')}\n`;
    summary += `Valor Bruto: € ${gross.toFixed(2)}\n`;
    if (form.apply_vat) {
      summary += `IVA (${defaultVatRate || 21}%): + € ${vatAmount.toFixed(2)}\n`;
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

    await updateContact.mutateAsync({
      id: contactId,
      payment_notes: summary,
    });

    toast({ title: 'Acordo de pagamento salvo na ficha do cliente' });
    onOpenChange(false);
    setForm({
      amount: '', payment_method: 'PIX', payment_form: 'UNICO',
      custom_payment_method: '', transfer_origin: '', payment_account_id: '',
      discount_type: '', discount_value: '', apply_vat: false, notes: '',
      installment_count: 2, installments: [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Forma de Pagamento — {contactName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Service Type Selection */}
          <div>
            <Label>Serviço de Interesse</Label>
            <ServiceTypeCombobox
              value={selectedServiceTypeId}
              onChange={(val) => {
                setSelectedServiceTypeId(val);
                onServiceTypeChange?.(val);
              }}
            />
          </div>

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
                    <span>Vencimento</span>
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


          {/* Calculation Summary */}
          {(form.amount && (form.discount_type || form.apply_vat)) && (
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
              onClick={handleSave}
              disabled={!form.amount || updateContact.isPending}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              {updateContact.isPending ? 'Salvando...' : 'Salvar Acordo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
