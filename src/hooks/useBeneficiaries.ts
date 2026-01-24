import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Beneficiary {
  id: string;
  contract_id: string;
  full_name: string;
  document_type: string | null;
  document_number: string | null;
  relationship: string | null;
  nationality: string | null;
  birth_date: string | null;
  is_primary: boolean;
  service_case_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BeneficiaryInsert {
  contract_id: string;
  full_name: string;
  document_type?: string;
  document_number?: string;
  relationship?: string;
  nationality?: string;
  birth_date?: string;
  is_primary?: boolean;
}

export function useBeneficiaries(contractId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const beneficiariesQuery = useQuery({
    queryKey: ['beneficiaries', contractId],
    queryFn: async () => {
      if (!contractId) return [];
      
      const { data, error } = await supabase
        .from('contract_beneficiaries')
        .select('*')
        .eq('contract_id', contractId)
        .order('is_primary', { ascending: false })
        .order('created_at');
      
      if (error) throw error;
      return data as Beneficiary[];
    },
    enabled: !!contractId,
  });

  const createBeneficiary = useMutation({
    mutationFn: async (beneficiary: BeneficiaryInsert) => {
      const { data, error } = await supabase
        .from('contract_beneficiaries')
        .insert(beneficiary)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaries', contractId] });
      toast({ title: 'Beneficiário adicionado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar beneficiário', description: error.message, variant: 'destructive' });
    },
  });

  const updateBeneficiary = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Beneficiary> & { id: string }) => {
      const { data, error } = await supabase
        .from('contract_beneficiaries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaries', contractId] });
      toast({ title: 'Beneficiário atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar beneficiário', description: error.message, variant: 'destructive' });
    },
  });

  const deleteBeneficiary = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contract_beneficiaries')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiaries', contractId] });
      toast({ title: 'Beneficiário removido com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover beneficiário', description: error.message, variant: 'destructive' });
    },
  });

  const primaryBeneficiary = beneficiariesQuery.data?.find(b => b.is_primary);
  const dependents = beneficiariesQuery.data?.filter(b => !b.is_primary) ?? [];

  return {
    beneficiaries: beneficiariesQuery.data ?? [],
    isLoading: beneficiariesQuery.isLoading,
    error: beneficiariesQuery.error,
    createBeneficiary,
    updateBeneficiary,
    deleteBeneficiary,
    primaryBeneficiary,
    dependents,
  };
}
