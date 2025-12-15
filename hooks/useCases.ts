import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ServiceCase = Tables<'service_cases'>;
export type ServiceCaseUpdate = TablesUpdate<'service_cases'>;

export type ServiceCaseWithDetails = ServiceCase & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
  };
  assigned_profile?: Tables<'profiles'> | null;
};

export function useCases() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const casesQuery = useQuery({
    queryKey: ['service-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
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
      return data as ServiceCaseWithDetails[];
    },
  });

  const myCasesQuery = useQuery({
    queryKey: ['my-cases', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('service_cases')
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
        .eq('assigned_to_user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ServiceCaseWithDetails[];
    },
    enabled: !!user?.id,
  });

  const updateCase = useMutation({
    mutationFn: async ({ id, ...updates }: ServiceCaseUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Caso atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar caso', description: error.message, variant: 'destructive' });
    },
  });

  const assignCase = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({ assigned_to_user_id: userId })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Caso atribuído com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atribuir caso', description: error.message, variant: 'destructive' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({ technical_status: status as any })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Status atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
    },
  });

  const submitCase = useMutation({
    mutationFn: async ({ id, protocolNumber }: { id: string; protocolNumber: string }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: 'SUBMETIDO',
          protocol_number: protocolNumber,
          submission_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Caso submetido com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao submeter caso', description: error.message, variant: 'destructive' });
    },
  });

  const closeCase = useMutation({
    mutationFn: async ({ id, result }: { id: string; result: 'APROVADO' | 'NEGADO' }) => {
      const status = result === 'APROVADO' ? 'ENCERRADO_APROVADO' : 'ENCERRADO_NEGADO';
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: status,
          decision_result: result,
          decision_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Caso encerrado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao encerrar caso', description: error.message, variant: 'destructive' });
    },
  });

  return {
    cases: casesQuery.data ?? [],
    myCases: myCasesQuery.data ?? [],
    isLoading: casesQuery.isLoading,
    error: casesQuery.error,
    updateCase,
    assignCase,
    updateStatus,
    submitCase,
    closeCase,
  };
}

export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: ['service-cases', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('service_cases')
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
      return data as ServiceCaseWithDetails | null;
    },
    enabled: !!id,
  });
}
