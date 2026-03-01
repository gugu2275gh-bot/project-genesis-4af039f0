import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PaymentAccount {
  id: string;
  country: string;
  account_name: string;
  bank_name: string | null;
  account_details: string | null;
  is_active: boolean;
  created_at: string;
}

export default function PaymentSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState({
    country: 'BRASIL',
    account_name: '',
    bank_name: '',
    account_details: '',
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['payment-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .order('country', { ascending: true })
        .order('account_name', { ascending: true });
      if (error) throw error;
      return data as PaymentAccount[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from('payment_accounts')
          .update({
            country: values.country,
            account_name: values.account_name,
            bank_name: values.bank_name || null,
            account_details: values.account_details || null,
          })
          .eq('id', values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payment_accounts')
          .insert({
            country: values.country,
            account_name: values.account_name,
            bank_name: values.bank_name || null,
            account_details: values.account_details || null,
            created_by_user_id: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success(editingAccount ? 'Conta atualizada' : 'Conta cadastrada');
      resetForm();
    },
    onError: () => toast.error('Erro ao salvar conta'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('payment_accounts')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success('Status atualizado');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-accounts'] });
      toast.success('Conta removida');
    },
    onError: () => toast.error('Erro ao remover conta'),
  });

  const resetForm = () => {
    setForm({ country: 'BRASIL', account_name: '', bank_name: '', account_details: '' });
    setEditingAccount(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (account: PaymentAccount) => {
    setEditingAccount(account);
    setForm({
      country: account.country,
      account_name: account.account_name,
      bank_name: account.bank_name || '',
      account_details: account.account_details || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.account_name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    saveMutation.mutate({ ...form, id: editingAccount?.id });
  };

  const brasilAccounts = accounts.filter(a => a.country === 'BRASIL');
  const espanhaAccounts = accounts.filter(a => a.country === 'ESPANHA');

  const renderTable = (title: string, items: PaymentAccount[], flag: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <span>{flag}</span> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma conta cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome da Conta</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.account_name}</TableCell>
                  <TableCell>{account.bank_name || '-'}</TableCell>
                  <TableCell className="max-w-xs truncate">{account.account_details || '-'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={account.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: account.id, is_active: checked })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(account.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Contas de Pagamento</h3>
          <p className="text-sm text-muted-foreground">Cadastre as contas bancárias do Brasil e da Espanha</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingAccount ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>País</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRASIL">🇧🇷 Brasil</SelectItem>
                    <SelectItem value="ESPANHA">🇪🇸 Espanha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome da Conta</Label>
                <Input
                  value={form.account_name}
                  onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Banco</Label>
                <Input
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Detalhes da Conta</Label>
                <Textarea
                  value={form.account_details}
                  onChange={(e) => setForm({ ...form, account_details: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {renderTable('Contas do Brasil', brasilAccounts, '🇧🇷')}
      {renderTable('Contas da Espanha', espanhaAccounts, '🇪🇸')}
    </div>
  );
}
