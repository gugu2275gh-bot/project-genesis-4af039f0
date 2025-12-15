import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type Opportunity = Tables<'opportunities'>;
export type OpportunityUpdate = TablesUpdate<'opportunities'>;

export type OpportunityWithLead = Opportunity & {
  leads: Tables<'leads'> & {
    contacts: Tables<'contacts'> | null;
  };
};

export function useOpportunities() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          *,
          leads (
            *,
            contacts (*)
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as OpportunityWithLead[];
    },
  });

  const updateOpportunity = useMutation({
    mutationFn: async ({ id, ...updates }: OpportunityUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('opportunities')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Oportunidade atualizada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar oportunidade', description: error.message, variant: 'destructive' });
    },
  });

  const markAsLost = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase
        .from('opportunities')
        .update({
          status: 'FECHADA_PERDIDA',
          reason_lost: reason,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Oportunidade marcada como perdida' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar oportunidade', description: error.message, variant: 'destructive' });
    },
  });

  return {
    opportunities: opportunitiesQuery.data ?? [],
    isLoading: opportunitiesQuery.isLoading,
    error: opportunitiesQuery.error,
    updateOpportunity,
    markAsLost,
  };
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: ['opportunities', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          *,
          leads (
            *,
            contacts (*)
          )
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as OpportunityWithLead | null;
    },
    enabled: !!id,
  });
}
