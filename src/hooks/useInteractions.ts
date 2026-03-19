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
        .neq('channel', 'WHATSAPP')
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

  const updateInteraction = useMutation({
    mutationFn: async ({ id, content, channel }: { id: string; content: string; channel?: string }) => {
      const updates: Record<string, string> = { content };
      if (channel) updates.channel = channel;
      const { data, error } = await supabase
        .from('interactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactions'] });
      toast({ title: 'Interação atualizada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar interação', description: error.message, variant: 'destructive' });
    },
  });

  const deleteInteraction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('interactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactions'] });
      toast({ title: 'Interação excluída' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir interação', description: error.message, variant: 'destructive' });
    },
  });

  const isEditable = (createdAt: string | null) => {
    if (!createdAt) return false;
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return diffMs <= 30 * 60 * 1000; // 30 minutes
  };

  return {
    interactions: interactionsQuery.data ?? [],
    isLoading: interactionsQuery.isLoading,
    error: interactionsQuery.error,
    createInteraction,
    updateInteraction,
    deleteInteraction,
    isEditable,
  };
}
