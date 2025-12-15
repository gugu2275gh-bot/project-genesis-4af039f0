import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type Requirement = Tables<'requirements_from_authority'>;
export type RequirementInsert = TablesInsert<'requirements_from_authority'>;
export type RequirementUpdate = TablesUpdate<'requirements_from_authority'>;

export function useRequirements(serviceCaseId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const requirementsQuery = useQuery({
    queryKey: ['requirements', serviceCaseId],
    queryFn: async () => {
      if (!serviceCaseId) return [];
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .select('*')
        .eq('service_case_id', serviceCaseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Requirement[];
    },
    enabled: !!serviceCaseId,
  });

  const createRequirement = useMutation({
    mutationFn: async (requirement: RequirementInsert) => {
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .insert(requirement)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
      toast({ title: 'Exigência registrada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar exigência', description: error.message, variant: 'destructive' });
    },
  });

  const updateRequirement = useMutation({
    mutationFn: async ({ id, ...updates }: RequirementUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
      toast({ title: 'Exigência atualizada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar exigência', description: error.message, variant: 'destructive' });
    },
  });

  return {
    requirements: requirementsQuery.data ?? [],
    isLoading: requirementsQuery.isLoading,
    error: requirementsQuery.error,
    createRequirement,
    updateRequirement,
  };
}
