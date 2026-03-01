import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, Percent } from 'lucide-react';
import { toast } from 'sonner';

interface AccountForm {
  account_name: string;
  bank_name: string;
  account_details: string;
}

const emptyForm: AccountForm = { account_name: '', bank_name: '', account_details: '' };

export default function PaymentSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [brasilForm, setBrasilForm] = useState<AccountForm>(emptyForm);
  const [espanhaForm, setEspanhaForm] = useState<AccountForm>(emptyForm);
  const [brasilId, setBrasilId] = useState<string | null>(null);
  const [espanhaId, setEspanhaId] = useState<string | null>(null);
  const [ivaRate, setIvaRate] = useState<string>('21');
  const [ivaLoaded, setIvaLoaded] = useState(false);

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

  useEffect(() => {
    if (ivaConfig && !ivaLoaded) {
      setIvaRate(ivaConfig);
      setIvaLoaded(true);
    }
  }, [ivaConfig, ivaLoaded]);

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

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['payment-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .order('country', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const brasil = accounts.find(a => a.country === 'BRASIL');
    const espanha = accounts.find(a => a.country === 'ESPANHA');
    if (brasil) {
      setBrasilId(brasil.id);
      setBrasilForm({
        account_name: brasil.account_name || '',
        bank_name: brasil.bank_name || '',
        account_details: brasil.account_details || '',
      });
    } else {
      setBrasilId(null);
    }
    if (espanha) {
      setEspanhaId(espanha.id);
      setEspanhaForm({
        account_name: espanha.account_name || '',
        bank_name: espanha.bank_name || '',
        account_details: espanha.account_details || '',
      });
    } else {
      setEspanhaId(null);
    }
  }, [accounts]);

  const saveMutation = useMutation({
    mutationFn: async ({ country, form, existingId }: { country: string; form: AccountForm; existingId: string | null }) => {
      if (existingId) {
        const { error } = await supabase
          .from('payment_accounts')
          .update({
            account_name: form.account_name,
            bank_name: form.bank_name || null,
            account_details: form.account_details || null,
          })
          .eq('id', existingId);
        if (error) throw error;
      } else {
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success('Dados salvos com sucesso');
    },
    onError: () => toast.error('Erro ao salvar dados'),
  });

  const handleSave = (country: 'BRASIL' | 'ESPANHA') => {
    const form = country === 'BRASIL' ? brasilForm : espanhaForm;
    const existingId = country === 'BRASIL' ? brasilId : espanhaId;
    if (!form.account_name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    saveMutation.mutate({ country, form, existingId });
  };

  const renderCountryCard = (
    title: string,
    flag: string,
    country: 'BRASIL' | 'ESPANHA',
    form: AccountForm,
    setForm: (f: AccountForm) => void,
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span>{flag}</span> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <div className="flex justify-end">
          <Button
            onClick={() => handleSave(country)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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

      <div className="grid gap-6 md:grid-cols-2">
        {renderCountryCard('Conta Brasil', '🇧🇷', 'BRASIL', brasilForm, setBrasilForm)}
        {renderCountryCard('Conta Espanha', '🇪🇸', 'ESPANHA', espanhaForm, setEspanhaForm)}
      </div>
    </div>
  );
}
