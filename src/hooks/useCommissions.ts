import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface Commission {
  id: string;
  contract_id: string;
  collaborator_name: string;
  collaborator_type: 'CAPTADOR' | 'FORNECEDOR';
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  has_invoice: boolean;
  status: 'PENDENTE' | 'PAGA' | 'CANCELADA';
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionWithContract extends Commission {
  contracts: {
    id: string;
    total_fee: number;
    opportunities: {
      leads: {
        contacts: {
          full_name: string;
          referral_name: string | null;
        } | null;
      } | null;
    } | null;
  } | null;
}

export interface CommissionInsert {
  contract_id: string;
  collaborator_name: string;
  collaborator_type: 'CAPTADOR' | 'FORNECEDOR';
  base_amount: number;
  has_invoice?: boolean;
  notes?: string;
}

export function useCommissions() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const commissionsQuery = useQuery({
    queryKey: ['commissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          contracts (
            id,
            total_fee,
            opportunities (
              leads (
                contacts (
                  full_name,
                  referral_name
                )
              )
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CommissionWithContract[];
    },
  });

  const createCommission = useMutation({
    mutationFn: async (commission: CommissionInsert) => {
      const { data, error } = await supabase
        .from('commissions')
        .insert({
          ...commission,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão registrada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const updateCommission = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Commission> & { id: string }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão atualizada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async ({ id, paymentMethod }: { id: string; paymentMethod: string }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'PAGA',
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão marcada como paga' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao marcar comissão como paga', description: error.message, variant: 'destructive' });
    },
  });

  // Estatísticas
  const pendingToPay = commissionsQuery.data?.filter(
    c => c.collaborator_type === 'CAPTADOR' && c.status === 'PENDENTE'
  ) ?? [];

  const pendingToReceive = commissionsQuery.data?.filter(
    c => c.collaborator_type === 'FORNECEDOR' && c.status === 'PENDENTE'
  ) ?? [];

  const totalPendingToPay = pendingToPay.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
  const totalPendingToReceive = pendingToReceive.reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  return {
    commissions: commissionsQuery.data ?? [],
    isLoading: commissionsQuery.isLoading,
    error: commissionsQuery.error,
    createCommission,
    updateCommission,
    markAsPaid,
    pendingToPay,
    pendingToReceive,
    totalPendingToPay,
    totalPendingToReceive,
  };
}
