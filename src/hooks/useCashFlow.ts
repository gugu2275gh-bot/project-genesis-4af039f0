import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface CashFlowEntry {
  id: string;
  type: 'ENTRADA' | 'SAIDA';
  category: string;
  subcategory: string | null;
  description: string | null;
  amount: number;
  payment_account: string | null;
  related_contract_id: string | null;
  related_payment_id: string | null;
  related_commission_id: string | null;
  is_invoiced: boolean;
  invoice_number: string | null;
  reference_date: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashFlowInsert {
  type: 'ENTRADA' | 'SAIDA';
  category: string;
  subcategory?: string;
  description?: string;
  amount: number;
  payment_account?: string;
  related_contract_id?: string;
  related_payment_id?: string;
  reference_date?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: 'FIXA' | 'VARIAVEL';
  description: string | null;
  is_active: boolean;
}

export function useCashFlow(startDate?: string, endDate?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const cashFlowQuery = useQuery({
    queryKey: ['cash-flow', startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('cash_flow')
        .select('*')
        .order('reference_date', { ascending: false });
      
      if (startDate) {
        query = query.gte('reference_date', startDate);
      }
      if (endDate) {
        query = query.lte('reference_date', endDate);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as CashFlowEntry[];
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });

  const createEntry = useMutation({
    mutationFn: async (entry: CashFlowInsert) => {
      const { data, error } = await supabase
        .from('cash_flow')
        .insert({
          ...entry,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      toast({ title: 'Lançamento registrado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar lançamento', description: error.message, variant: 'destructive' });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CashFlowEntry> & { id: string }) => {
      const { data, error } = await supabase
        .from('cash_flow')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      toast({ title: 'Lançamento atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar lançamento', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cash_flow')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      toast({ title: 'Lançamento removido com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover lançamento', description: error.message, variant: 'destructive' });
    },
  });

  // Cálculos
  const entries = cashFlowQuery.data ?? [];
  const totalEntradas = entries
    .filter(e => e.type === 'ENTRADA')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalSaidas = entries
    .filter(e => e.type === 'SAIDA')
    .reduce((sum, e) => sum + e.amount, 0);
  const saldo = totalEntradas - totalSaidas;

  // Agrupamento por categoria
  const byCategory = entries.reduce((acc, entry) => {
    const key = `${entry.type}-${entry.category}`;
    if (!acc[key]) {
      acc[key] = { type: entry.type, category: entry.category, total: 0, count: 0 };
    }
    acc[key].total += entry.amount;
    acc[key].count += 1;
    return acc;
  }, {} as Record<string, { type: string; category: string; total: number; count: number }>);

  return {
    entries,
    categories: categoriesQuery.data ?? [],
    isLoading: cashFlowQuery.isLoading,
    error: cashFlowQuery.error,
    createEntry,
    updateEntry,
    deleteEntry,
    totalEntradas,
    totalSaidas,
    saldo,
    byCategory: Object.values(byCategory),
  };
}
