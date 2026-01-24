import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContractCost {
  id: string;
  contract_id: string;
  description: string;
  amount: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useContractCosts(contractId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ['contract-costs', contractId],
    queryFn: async () => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from('contract_costs')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ContractCost[];
    },
    enabled: !!contractId,
  });

  const addCost = useMutation({
    mutationFn: async (cost: { description: string; amount: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('contract_costs')
        .insert({
          contract_id: contractId,
          description: cost.description,
          amount: cost.amount,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-costs', contractId] });
      toast({ title: 'Custo adicionado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao adicionar custo', description: error.message, variant: 'destructive' });
    },
  });

  const deleteCost = useMutation({
    mutationFn: async (costId: string) => {
      const { error } = await supabase
        .from('contract_costs')
        .delete()
        .eq('id', costId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-costs', contractId] });
      toast({ title: 'Custo removido' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao remover custo', description: error.message, variant: 'destructive' });
    },
  });

  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount), 0);

  return { costs, isLoading, addCost, deleteCost, totalCosts };
}
