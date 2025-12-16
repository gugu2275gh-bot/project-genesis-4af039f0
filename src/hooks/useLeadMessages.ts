import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

export interface LeadMessage {
  id: number;
  created_at: string;
  id_lead: string | null;
  phone_id: number | null;
  origem: string | null;
  mensagem_cliente: string | null;
  mensagem_IA: string | null;
}

export function useLeadMessages(leadId: string | undefined, contactPhone: string | number | null = null) {
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
      // First, call the webhook via Edge Function if we have a phone number
      if (contactPhone) {
        console.log('Sending WhatsApp via Edge Function:', { message, phone: contactPhone });
        
        const { data: webhookData, error: webhookError } = await supabase.functions.invoke('send-whatsapp', {
          body: { 
            mensagem: message, 
            numero: String(contactPhone) 
          }
        });

        if (webhookError) {
          console.error('Webhook error:', webhookError);
          toast.error('Erro ao enviar WhatsApp: ' + webhookError.message);
          // Continue to save the message even if webhook fails
        } else {
          console.log('Webhook response:', webhookData);
        }
      } else {
        console.warn('No contact phone available, skipping WhatsApp webhook');
      }

      // Then save the message to the database
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
      toast.success('Mensagem enviada');
    },
    onError: (error: Error) => {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem: ' + error.message);
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
