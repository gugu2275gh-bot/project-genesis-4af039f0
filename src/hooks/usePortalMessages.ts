import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface PortalMessage {
  id: string;
  service_case_id: string | null;
  sender_user_id: string;
  sender_type: 'client' | 'staff';
  content: string;
  is_read: boolean;
  created_at: string;
  profiles?: {
    full_name: string;
  };
}

export function usePortalMessages(serviceCaseId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const messagesQuery = useQuery({
    queryKey: ['portal-messages', serviceCaseId],
    queryFn: async () => {
      if (!serviceCaseId) return [];
      
      const { data, error } = await supabase
        .from('portal_messages')
        .select('*')
        .eq('service_case_id', serviceCaseId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      // Fetch profiles for staff messages
      const staffUserIds = [...new Set(data.filter(m => m.sender_type === 'staff').map(m => m.sender_user_id))];
      
      let profilesMap: Record<string, string> = {};
      if (staffUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', staffUserIds);
        
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
        }
      }
      
      return data.map(m => ({
        ...m,
        sender_type: m.sender_type as 'client' | 'staff',
        profiles: m.sender_type === 'staff' ? { full_name: profilesMap[m.sender_user_id] || 'Equipe' } : undefined,
      })) as PortalMessage[];
    },
    enabled: !!serviceCaseId,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ content, senderType }: { content: string; senderType: 'client' | 'staff' }) => {
      if (!serviceCaseId || !user?.id) throw new Error('Missing case or user');
      
      const { data, error } = await supabase
        .from('portal_messages')
        .insert({
          service_case_id: serviceCaseId,
          sender_user_id: user.id,
          sender_type: senderType,
          content,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-messages', serviceCaseId] });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao enviar mensagem', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('portal_messages')
        .update({ is_read: true })
        .eq('id', messageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-messages', serviceCaseId] });
    },
  });

  return {
    messages: messagesQuery.data ?? [],
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    sendMessage,
    markAsRead,
  };
}
