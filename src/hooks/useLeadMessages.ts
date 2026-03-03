import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Gerente',
  SUPERVISOR: 'Supervisor',
  ATENCAO_CLIENTE: 'Atenção ao Cliente',
  ATENDENTE_WHATSAPP: 'Atendente WhatsApp',
  JURIDICO: 'Jurídico',
  FINANCEIRO: 'Financeiro',
  TECNICO: 'Técnico',
};

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

  const { user } = useAuth();

  // Fetch current user's profile and roles for message prefix
  const { data: userInfo } = useQuery({
    queryKey: ['user-info-for-chat', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase.rpc('get_user_roles', { _user_id: user.id }),
      ]);
      const roleName = roles?.length ? ROLE_LABELS[roles[0]] || roles[0] : '';
      return { name: profile?.full_name || 'Usuário', role: roleName };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ leadId, message }: { leadId: string; message: string }) => {
      // Build prefixed message for WhatsApp delivery
      const prefix = userInfo ? `*${userInfo.name} - ${userInfo.role}*` : '';
      const prefixedMessage = prefix ? `${prefix}\n${message}` : message;

      // First, call the webhook via Edge Function if we have a phone number
      if (contactPhone) {
        console.log('Sending WhatsApp via Edge Function:', { message: prefixedMessage, phone: contactPhone });
        
        const { data: webhookData, error: webhookError } = await supabase.functions.invoke('send-whatsapp', {
          body: { 
            mensagem: prefixedMessage, 
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
          mensagem_IA: prefixedMessage,
          origem: 'SISTEMA',
        })
        .select()
        .single();

      if (error) throw error;
      return { data, leadId }; // Return leadId for consistent invalidation
    },
    onMutate: async ({ leadId, message }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['lead-messages', leadId] });
      
      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<LeadMessage[]>(['lead-messages', leadId]);
      
      // Optimistically add the new message
      const optimisticMessage: LeadMessage = {
        id: Date.now(), // Temporary ID
        created_at: new Date().toISOString(),
        id_lead: leadId,
        mensagem_IA: userInfo ? `*${userInfo.name} - ${userInfo.role}*\n${message}` : message,
        mensagem_cliente: null,
        origem: 'SISTEMA',
        phone_id: null,
      };
      
      queryClient.setQueryData<LeadMessage[]>(['lead-messages', leadId], (old = []) => [
        ...old,
        optimisticMessage,
      ]);
      
      return { previousMessages, leadId };
    },
    onError: (err: Error, variables, context) => {
      // Revert to previous state on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['lead-messages', context.leadId], context.previousMessages);
      }
      console.error('Erro ao enviar mensagem:', err);
      toast.error('Erro ao enviar mensagem: ' + err.message);
    },
    onSuccess: (result) => {
      toast.success('Mensagem enviada');
    },
    onSettled: (data, error, variables) => {
      // Always revalidate after mutation settles
      queryClient.invalidateQueries({ queryKey: ['lead-messages', variables.leadId] });
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
