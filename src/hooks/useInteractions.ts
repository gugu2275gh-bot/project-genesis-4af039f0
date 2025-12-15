import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type Interaction = Tables<'interactions'>;
export type InteractionInsert = TablesInsert<'interactions'>;

export function useInteractions(contactId?: string, leadId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const interactionsQuery = useQuery({
    queryKey: ['interactions', contactId, leadId],
    queryFn: async () => {
      let query = supabase
        .from('interactions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      if (leadId) {
        query = query.eq('lead_id', leadId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Interaction[];
    },
    enabled: !!(contactId || leadId),
  });

  const createInteraction = useMutation({
    mutationFn: async (interaction: InteractionInsert) => {
      const { data, error } = await supabase
        .from('interactions')
        .insert({
          ...interaction,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactions'] });
      toast({ title: 'Interação registrada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar interação', description: error.message, variant: 'destructive' });
    },
  });

  return {
    interactions: interactionsQuery.data ?? [],
    isLoading: interactionsQuery.isLoading,
    error: interactionsQuery.error,
    createInteraction,
  };
}
