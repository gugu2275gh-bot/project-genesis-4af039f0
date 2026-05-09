import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, Percent, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface AccountForm {
  account_name: string;
  bank_name: string;
  account_details: string;
}

interface AccountRow extends AccountForm {
  id: string;
  country: string;
}

const emptyForm: AccountForm = { account_name: '', bank_name: '', account_details: '' };

export default function PaymentSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editForms, setEditForms] = useState<Record<string, AccountForm>>({});
  const [newForms, setNewForms] = useState<Record<'BRASIL' | 'ESPANHA', AccountForm>>({
    BRASIL: emptyForm,
    ESPANHA: emptyForm,
  });
  const [ivaRate, setIvaRate] = useState<string>('21');
  const [ivaLoaded, setIvaLoaded] = useState(false);
  const [commissionRate, setCommissionRate] = useState<string>('10');
  const [commissionLoaded, setCommissionLoaded] = useState(false);

  // Fetch IVA rate from system_config
  const { data: ivaConfig } = useQuery({
    queryKey: ['system-config', 'default_vat_rate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'default_vat_rate')
        .maybeSingle();
      if (error) throw error;
      return data?.value || '21';
    },
  });

  // Fetch default commission rate from system_config
  const { data: commissionConfig } = useQuery({
    queryKey: ['system-config', 'default_commission_rate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'default_commission_rate')
        .maybeSingle();
      if (error) throw error;
      return data?.value || '10';
    },
  });

  useEffect(() => {
    if (ivaConfig && !ivaLoaded) {
      setIvaRate(ivaConfig);
      setIvaLoaded(true);
    }
  }, [ivaConfig, ivaLoaded]);

  useEffect(() => {
    if (commissionConfig && !commissionLoaded) {
      setCommissionRate(commissionConfig);
      setCommissionLoaded(true);
    }
  }, [commissionConfig, commissionLoaded]);

  const saveIvaMutation = useMutation({
    mutationFn: async (rate: string) => {
      const { error } = await supabase
        .from('system_config')
        .upsert(
          { key: 'default_vat_rate', value: rate, description: 'Taxa padrão de IVA (%)' },
          { onConflict: 'key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config', 'default_vat_rate'] });
      toast.success('Taxa de IVA salva com sucesso');
    },
    onError: () => toast.error('Erro ao salvar taxa de IVA'),
  });

  const saveCommissionMutation = useMutation({
    mutationFn: async (rate: string) => {
      const { error } = await supabase
        .from('system_config')
        .upsert(
          { key: 'default_commission_rate', value: rate, description: 'Porcentagem padrão de comissão (%)' },
          { onConflict: 'key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config', 'default_commission_rate'] });
      toast.success('Porcentagem de comissão salva com sucesso');
    },
    onError: () => toast.error('Erro ao salvar porcentagem de comissão'),
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['payment-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .order('country', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as AccountRow[];
    },
  });

  useEffect(() => {
    setEditForms((prev) => {
      const next: Record<string, AccountForm> = {};
      accounts.forEach((a) => {
        next[a.id] = prev[a.id] || {
          account_name: a.account_name || '',
          bank_name: a.bank_name || '',
          account_details: a.account_details || '',
        };
      });
      return next;
    });
  }, [accounts]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: AccountForm }) => {
      const { error } = await supabase
        .from('payment_accounts')
        .update({
          account_name: form.account_name,
          bank_name: form.bank_name || null,
          account_details: form.account_details || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success('Conta atualizada');
    },
    onError: () => toast.error('Erro ao salvar conta'),
  });

  const insertMutation = useMutation({
    mutationFn: async ({ country, form }: { country: 'BRASIL' | 'ESPANHA'; form: AccountForm }) => {
      const { error } = await supabase
        .from('payment_accounts')
        .insert({
          country,
          account_name: form.account_name,
          bank_name: form.bank_name || null,
          account_details: form.account_details || null,
          created_by_user_id: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      setNewForms((prev) => ({ ...prev, [vars.country]: emptyForm }));
      toast.success('Conta adicionada');
    },
    onError: () => toast.error('Erro ao adicionar conta'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payment_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success('Conta removida');
    },
    onError: () => toast.error('Erro ao remover conta'),
  });

  const handleUpdate = (id: string) => {
    const form = editForms[id];
    if (!form?.account_name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    updateMutation.mutate({ id, form });
  };

  const handleAdd = (country: 'BRASIL' | 'ESPANHA') => {
    const form = newForms[country];
    if (!form.account_name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    insertMutation.mutate({ country, form });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remover esta conta bancária?')) return;
    deleteMutation.mutate(id);
  };

  const renderAccountFields = (
    form: AccountForm,
    setForm: (f: AccountForm) => void,
  ) => (
    <div className="space-y-3">
      <div>
        <Label>Nome da Conta</Label>
        <Input
          value={form.account_name}
          onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          placeholder="Ex: Conta Principal"
        />
      </div>
      <div>
        <Label>Banco</Label>
        <Input
          value={form.bank_name}
          onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          placeholder="Ex: Banco do Brasil / CaixaBank"
        />
      </div>
      <div>
        <Label>Detalhes da Conta</Label>
        <Textarea
          value={form.account_details}
          onChange={(e) => setForm({ ...form, account_details: e.target.value })}
          rows={3}
          placeholder="IBAN, agência, número da conta, etc."
        />
      </div>
    </div>
  );

  const renderCountryCard = (
    title: string,
    flag: string,
    country: 'BRASIL' | 'ESPANHA',
  ) => {
    const countryAccounts = accounts.filter((a) => a.country === country);
    const newForm = newForms[country];
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span>{flag}</span> {title}
          </CardTitle>
          <CardDescription>{countryAccounts.length} conta(s) cadastrada(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {countryAccounts.map((acc) => {
            const form = editForms[acc.id] || emptyForm;
            return (
              <div key={acc.id} className="rounded-md border p-3 space-y-3 bg-muted/30">
                {renderAccountFields(form, (f) =>
                  setEditForms((prev) => ({ ...prev, [acc.id]: f })),
                )}
                <div className="flex justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(acc.id)}
                    disabled={deleteMutation.isPending}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                  <Button
                    onClick={() => handleUpdate(acc.id)}
                    disabled={updateMutation.isPending}
                    size="sm"
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" /> Salvar
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="rounded-md border border-dashed p-3 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Adicionar nova conta</p>
            {renderAccountFields(newForm, (f) =>
              setNewForms((prev) => ({ ...prev, [country]: f })),
            )}
            <div className="flex justify-end">
              <Button
                onClick={() => handleAdd(country)}
                disabled={insertMutation.isPending}
                size="sm"
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Pagamentos</h3>
        <p className="text-sm text-muted-foreground">Configure as contas bancárias e impostos para pagamentos</p>
      </div>

      {/* IVA Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" /> Taxa de IVA Padrão
          </CardTitle>
          <CardDescription>Percentual aplicado automaticamente ao criar novos pagamentos com IVA</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-[200px]">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={ivaRate}
                onChange={(e) => setIvaRate(e.target.value)}
                placeholder="21"
              />
            </div>
            <Button
              onClick={() => saveIvaMutation.mutate(ivaRate)}
              disabled={saveIvaMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saveIvaMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Default Commission Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" /> Porcentagem Padrão de Comissão
          </CardTitle>
          <CardDescription>Percentual sugerido automaticamente ao criar novas comissões</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-[200px]">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                placeholder="10"
              />
            </div>
            <Button
              onClick={() => saveCommissionMutation.mutate(commissionRate)}
              disabled={saveCommissionMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saveCommissionMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {renderCountryCard('Conta Brasil', '🇧🇷', 'BRASIL')}
        {renderCountryCard('Conta Espanha', '🇪🇸', 'ESPANHA')}
      </div>
    </div>
  );
}
