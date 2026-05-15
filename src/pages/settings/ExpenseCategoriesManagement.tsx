import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
  type: 'FIXA' | 'VARIAVEL';
  flow: 'ENTRADA' | 'SAIDA';
  description: string | null;
  is_active: boolean;
}

export default function ExpenseCategoriesManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState({ name: '', type: 'FIXA' as 'FIXA' | 'VARIAVEL', flow: 'SAIDA' as 'ENTRADA' | 'SAIDA', description: '', is_active: true });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['expense-categories-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('type')
        .order('name');
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Nome é obrigatório');
      if (editing) {
        const { error } = await supabase
          .from('expense_categories')
          .update({ name: form.name.trim(), type: form.type, flow: form.flow, description: form.description || null, is_active: form.is_active })
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('expense_categories')
          .insert({ name: form.name.trim(), type: form.type, flow: form.flow, description: form.description || null, is_active: form.is_active });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories-all'] });
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast({ title: editing ? 'Despesa atualizada' : 'Despesa cadastrada' });
      reset();
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expense_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories-all'] });
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast({ title: 'Despesa removida' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const reset = () => {
    setIsOpen(false);
    setEditing(null);
    setForm({ name: '', type: 'FIXA', description: '', is_active: true });
  };

  const openEdit = (c: ExpenseCategory) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type, description: c.description || '', is_active: c.is_active });
    setIsOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Cadastro de Despesas</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Categorias usadas em Fluxo de Caixa para classificar despesas fixas e variáveis.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={(o) => (o ? setIsOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setForm({ name: '', type: 'FIXA', description: '', is_active: true }); }}>
              <Plus className="h-4 w-4 mr-2" /> Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Aluguel, Internet, Material..." />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={(v: 'FIXA' | 'VARIAVEL') => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXA">Despesa Fixa</SelectItem>
                    <SelectItem value="VARIAVEL">Despesa Variável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Ativa</Label>
                <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset}>Cancelar</Button>
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                  {upsert.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma despesa cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Badge variant={c.type === 'FIXA' ? 'default' : 'secondary'}>
                    {c.type === 'FIXA' ? 'Fixa' : 'Variável'}
                  </Badge>
                  <div>
                    <div className="font-medium">{c.name} {!c.is_active && <span className="text-xs text-muted-foreground">(inativa)</span>}</div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remover "${c.name}"?`)) remove.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
