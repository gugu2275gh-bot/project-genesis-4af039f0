import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type Contract = Tables<'contracts'>;
export type ContractInsert = TablesInsert<'contracts'>;
export type ContractUpdate = TablesUpdate<'contracts'>;

export type ContractWithOpportunity = Contract & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
  };
};

export function useContracts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (*)
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContractWithOpportunity[];
    },
  });

  const createContract = useMutation({
    mutationFn: async (contract: ContractInsert) => {
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          ...contract,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const updateContract = useMutation({
    mutationFn: async ({ id, ...updates }: ContractUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          ...updates,
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const sendForSignature = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          status: 'ENVIADO',
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'CONTRATO_ENVIADO' })
        .eq('id', data.opportunity_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Contrato enviado para assinatura' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const markAsSigned = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          status: 'ASSINADO',
          signed_at: new Date().toISOString(),
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'CONTRATO_ASSINADO' })
        .eq('id', data.opportunity_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Contrato marcado como assinado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao marcar contrato como assinado', description: error.message, variant: 'destructive' });
    },
  });

  return {
    contracts: contractsQuery.data ?? [],
    isLoading: contractsQuery.isLoading,
    error: contractsQuery.error,
    createContract,
    updateContract,
    sendForSignature,
    markAsSigned,
  };
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (*)
            )
          )
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as ContractWithOpportunity | null;
    },
    enabled: !!id,
  });
}
