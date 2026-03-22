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
  media_type: string | null;
  media_url: string | null;
  media_filename: string | null;
  media_mimetype: string | null;
  setor: string | null;
}

// Roles that can see all sectors' messages
const GLOBAL_VIEW_ROLES = ['ADMIN', 'MANAGER', 'SUPERVISOR', 'DIRETORIA'];

export function useLeadMessages(leadId: string | undefined, contactPhone: string | number | null = null, contactId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch current user's profile, roles and sector for message prefix + routing
  const { data: userInfo } = useQuery({
    queryKey: ['user-info-for-chat', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const [{ data: profile }, { data: roles }, { data: userSectors }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase.rpc('get_user_roles', { _user_id: user.id }),
        supabase.from('user_sectors').select('sector_id, service_sectors(name)').eq('user_id', user.id),
      ]);
      const roleName = roles?.length ? ROLE_LABELS[roles[0]] || roles[0] : '';
      
      // Resolve sector: from user_sectors or from role
      let sector = '';
      if (userSectors?.length) {
        const sectorRow = userSectors[0] as unknown as { sector_id: string; service_sectors: { name: string } | null };
        sector = sectorRow.service_sectors?.name || '';
      }
      if (!sector && roles?.length) {
        const roleToSector: Record<string, string> = {
          JURIDICO: 'Jurídico',
          FINANCEIRO: 'Financeiro',
          TECNICO: 'Técnico',
          ATENCAO_CLIENTE: 'Atenção ao Cliente',
          ATENDENTE_WHATSAPP: 'Atenção ao Cliente',
        };
        for (const r of roles) {
          if (roleToSector[r]) {
            sector = roleToSector[r];
            break;
          }
        }
      }
      
      const allSectorNames = (userSectors || []).map((s: any) => {
        const row = s as unknown as { service_sectors: { name: string } | null };
        return row.service_sectors?.name;
      }).filter(Boolean) as string[];
      
      return { name: profile?.full_name || 'Usuário', role: roleName, sector, roles: roles || [], sectorNames: allSectorNames };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all lead IDs for the same contact (for unified chat)
  const { data: contactLeadIds } = useQuery({
    queryKey: ['contact-lead-ids', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_id', contactId);
      if (error) throw error;
      return data.map(l => l.id);
    },
    enabled: !!contactId,
  });

  const effectiveLeadIds = contactId && contactLeadIds?.length ? contactLeadIds : leadId ? [leadId] : [];
  const cacheKey = contactId ? ['lead-messages-contact', contactId] : ['lead-messages', leadId];

  // Check if user has global view (admin/manager/supervisor)
  const hasGlobalView = userInfo?.roles?.some((r: string) => GLOBAL_VIEW_ROLES.includes(r)) ?? false;
  const userSectorName = userInfo?.sector || '';

  const { data: messages = [], isLoading } = useQuery({
    queryKey: [...cacheKey, userSectorName, hasGlobalView],
    queryFn: async () => {
      if (effectiveLeadIds.length === 0) return [];
      
      let query = supabase
        .from('mensagens_cliente')
        .select('*')
        .in('id_lead', effectiveLeadIds)
        .order('created_at', { ascending: true });

      // If user doesn't have global view, filter by their sector
      // Show messages that match their sector OR have no sector (legacy/untagged)
      if (!hasGlobalView && userSectorName) {
        query = query.or(`setor.eq.${userSectorName},setor.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LeadMessage[];
    },
    enabled: effectiveLeadIds.length > 0,
  });

  const sendMessage = useMutation({
    mutationFn: async ({ leadId, message }: { leadId: string; message: string }) => {
      // Build prefixed message for WhatsApp delivery
      const prefix = userInfo ? `*${userInfo.name} - ${userInfo.role}*` : '';
      const prefixedMessage = prefix ? `${prefix}\n${message}` : message;

      // First, call the webhook via Edge Function if we have a phone number
      if (contactPhone) {
        console.log('Sending WhatsApp via Edge Function:', { message: prefixedMessage, phone: contactPhone, sector: userInfo?.sector });
        
        const { data: webhookData, error: webhookError } = await supabase.functions.invoke('send-whatsapp', {
          body: { 
            mensagem: prefixedMessage, 
            numero: String(contactPhone),
            sector: userInfo?.sector || undefined,
            contact_id: contactId || undefined,
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
          setor: userInfo?.sector || null,
        })
        .select()
        .single();

      if (error) throw error;
      return { data, leadId }; // Return leadId for consistent invalidation
    },
    onMutate: async ({ leadId, message }) => {
      await queryClient.cancelQueries({ queryKey: cacheKey });
      
      const previousMessages = queryClient.getQueryData<LeadMessage[]>(cacheKey);
      
      const optimisticMessage: LeadMessage = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        id_lead: leadId,
        mensagem_IA: userInfo ? `*${userInfo.name} - ${userInfo.role}*\n${message}` : message,
        mensagem_cliente: null,
        origem: 'SISTEMA',
        phone_id: null,
        media_type: null,
        media_url: null,
        media_filename: null,
        media_mimetype: null,
        setor: userInfo?.sector || null,
      };
      
      queryClient.setQueryData<LeadMessage[]>(cacheKey, (old = []) => [
        ...old,
        optimisticMessage,
      ]);
      
      return { previousMessages };
    },
    onError: (err: Error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(cacheKey, context.previousMessages);
      }
      console.error('Erro ao enviar mensagem:', err);
      toast.error('Erro ao enviar mensagem: ' + err.message);
    },
    onSuccess: () => {
      toast.success('Mensagem enviada');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: cacheKey });
    },
  });

  const resumeAI = useMutation({
    mutationFn: async (targetLeadId: string) => {
      // Insert a marker message with origem='IA' to signal the AI is resumed
      const { error } = await supabase
        .from('mensagens_cliente')
        .insert({
          id_lead: targetLeadId,
          mensagem_IA: '🤖 Agente IA retomado pelo atendente.',
          origem: 'IA',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Agente IA retomado');
      queryClient.invalidateQueries({ queryKey: cacheKey });
    },
    onError: (err: Error) => {
      toast.error('Erro ao retomar IA: ' + err.message);
    },
  });

  // Realtime subscription for new messages (subscribe to all leads of contact)
  useEffect(() => {
    if (effectiveLeadIds.length === 0) return;

    const channels = effectiveLeadIds.map(lid =>
      supabase
        .channel(`lead-messages-${lid}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mensagens_cliente',
            filter: `id_lead=eq.${lid}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: cacheKey });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [effectiveLeadIds.join(','), queryClient]);

  return {
    messages,
    isLoading,
    sendMessage,
    resumeAI,
    userSectorName,
    hasGlobalView,
  };
}
