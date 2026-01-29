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
    mutationFn: async ({ id, status, fromStatus }: { id: string; status: string; fromStatus?: string }) => {
      // If transitioning from CONTATO_INICIAL to another status, record first contact time
      const updates: Record<string, any> = { technical_status: status as any };
      
      if (fromStatus === 'CONTATO_INICIAL' && status !== 'CONTATO_INICIAL') {
        updates.first_contact_at = new Date().toISOString();
      }
      
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
        .select(`
          *,
          client_user_id
        `)
        .single();
      
      if (error) throw error;

      // If approved, create a notification for NPS survey
      if (result === 'APROVADO' && data.client_user_id) {
        const npsLink = `${window.location.origin}/nps/${id}`;
        
        await supabase
          .from('notifications')
          .insert({
            user_id: data.client_user_id,
            type: 'nps_survey',
            title: 'Avalie nosso atendimento!',
            message: `Seu processo foi concluído. Clique aqui para nos contar como foi sua experiência.`,
          });
      }

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

  const approveDocumentation = useMutation({
    mutationFn: async ({ id, partial = false }: { id: string; partial?: boolean }) => {
      const status = partial ? 'DOCUMENTACAO_PARCIAL_APROVADA' : 'EM_ORGANIZACAO';
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: status,
          technical_approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: variables.partial ? 'Documentação parcial aprovada' : 'Documentação aprovada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao aprovar documentação', description: error.message, variant: 'destructive' });
    },
  });

  const sendToLegal = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: 'ENVIADO_JURIDICO',
          sent_to_legal_at: new Date().toISOString(),
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
      queryClient.invalidateQueries({ queryKey: ['legal-cases'] });
      toast({ title: 'Caso enviado ao Jurídico' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar ao jurídico', description: error.message, variant: 'destructive' });
    },
  });

  const registerApproval = useMutation({
    mutationFn: async ({ 
      id, 
      approvalDate, 
      residenciaValidityDate 
    }: { 
      id: string; 
      approvalDate: string;
      residenciaValidityDate?: string;
    }) => {
      // Update the case status to APROVADO_INTERNAMENTE
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: 'APROVADO_INTERNAMENTE',
          approval_date: approvalDate,
          residencia_validity_date: residenciaValidityDate || null,
          decision_result: 'APROVADO',
        } as any)
        .eq('id', id)
        .select(`
          *,
          assigned_to_user_id,
          opportunities (leads (contacts (full_name)))
        `)
        .single();
      
      if (error) throw error;
      
      // Notify the team about the approval
      const clientName = (data as any).opportunities?.leads?.contacts?.full_name || 'Cliente';
      
      // Notify assigned technician
      if (data.assigned_to_user_id) {
        await supabase.from('notifications').insert({
          user_id: data.assigned_to_user_id,
          type: 'case_approved',
          title: '🎉 Processo Aprovado!',
          message: `O processo de ${clientName} foi aprovado! Entre em contato para dar a boa notícia.`
        });
      }
      
      // Notify managers
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'MANAGER');
      
      for (const mgr of managers || []) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          type: 'case_approved',
          title: '🎉 Aprovação Registrada',
          message: `Processo de ${clientName} aprovado!`
        });
      }
      
      // Notify admins
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'ADMIN');
      
      for (const admin of admins || []) {
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          type: 'case_approved',
          title: '🎉 Aprovação Registrada',
          message: `Processo de ${clientName} aprovado!`
        });
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Aprovação registrada com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar aprovação', description: error.message, variant: 'destructive' });
    },
  });

  const confirmClientContact = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: 'AGENDAR_HUELLAS',
          approval_notified_client: true,
          approval_whatsapp_sent_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .select(`
          *,
          opportunities (leads (contacts (phone, full_name)))
        `)
        .single();
      
      if (error) throw error;
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Status atualizado para Agendar Huellas' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao confirmar contato', description: error.message, variant: 'destructive' });
    },
  });

  // Huellas Scheduling Mutations
  const requestHuellasSchedule = useMutation({
    mutationFn: async ({ 
      id, 
      preferredDate 
    }: { 
      id: string; 
      preferredDate?: string;
    }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          technical_status: 'AGUARDANDO_CITA_HUELLAS',
          huellas_requested_at: new Date().toISOString(),
          huellas_scheduler_notified: false,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Notify scheduler/manager users
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['MANAGER', 'ADMIN']);
      
      for (const mgr of managers || []) {
        await supabase.from('notifications').insert({
          user_id: mgr.user_id,
          title: '📅 Solicitação de Cita de Huellas',
          message: `Novo agendamento de huellas solicitado${preferredDate ? ` para ${preferredDate}` : ''}. Caso ${id.slice(0, 8)}.`,
          type: 'huellas_schedule_request',
        });
      }
      
      // Mark scheduler as notified
      await supabase
        .from('service_cases')
        .update({ huellas_scheduler_notified: true })
        .eq('id', id);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Agendamento solicitado! O agendador será notificado.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao solicitar agendamento', description: error.message, variant: 'destructive' });
    },
  });

  const confirmHuellasAppointment = useMutation({
    mutationFn: async ({ 
      id, 
      date, 
      time, 
      location,
      confirmationUrl 
    }: { 
      id: string; 
      date: string;
      time: string;
      location: string;
      confirmationUrl?: string;
    }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          huellas_date: date,
          huellas_time: time,
          huellas_location: location,
          huellas_appointment_confirmation_url: confirmationUrl,
          huellas_client_notified_at: new Date().toISOString(),
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
      toast({ title: 'Cita de huellas confirmada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao confirmar cita', description: error.message, variant: 'destructive' });
    },
  });

  const updateEmpadronamiento = useMutation({
    mutationFn: async ({ 
      id, 
      valid, 
      expectedDate,
      notes 
    }: { 
      id: string; 
      valid: boolean;
      expectedDate?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          empadronamiento_valid: valid,
          empadronamiento_expected_date: valid ? null : expectedDate,
          empadronamiento_notes: notes,
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
      toast({ title: 'Empadronamento atualizado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar empadronamento', description: error.message, variant: 'destructive' });
    },
  });

  const markHuellasCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('service_cases')
        .update({
          huellas_completed: true,
          technical_status: 'HUELLAS_REALIZADO',
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
      toast({ title: 'Huellas marcado como realizado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });

  const sendHuellasInstructions = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_cases')
        .update({
          huellas_instructions_sent: true,
        })
        .eq('id', id);
      
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['my-cases'] });
      toast({ title: 'Instruções enviadas ao cliente!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar instruções', description: error.message, variant: 'destructive' });
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
    approveDocumentation,
    sendToLegal,
    registerApproval,
    confirmClientContact,
    requestHuellasSchedule,
    confirmHuellasAppointment,
    updateEmpadronamiento,
    markHuellasCompleted,
    sendHuellasInstructions,
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
