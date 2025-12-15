import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export interface LeadMessage {
  id: number;
  created_at: string;
  id_lead: string | null;
  phone_id: number | null;
  origem: string | null;
  mensagem_cliente: string | null;
  mensagem_IA: string | null;
}

export function useLeadMessages(leadId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['lead-messages', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('mensagens_cliente')
        .select('*')
        .eq('id_lead', leadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as LeadMessage[];
    },
    enabled: !!leadId,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ leadId, message }: { leadId: string; message: string }) => {
      const { data, error } = await supabase
        .from('mensagens_cliente')
        .insert({
          id_lead: leadId,
          mensagem_IA: message,
          origem: 'SISTEMA',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-messages', leadId] });
    },
  });

  // Realtime subscription for new messages
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`lead-messages-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_cliente',
          filter: `id_lead=eq.${leadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['lead-messages', leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  return {
    messages,
    isLoading,
    sendMessage,
  };
}
