import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { addDays, format } from 'date-fns';

export type Requirement = Tables<'requirements_from_authority'>;
export type RequirementInsert = TablesInsert<'requirements_from_authority'>;
export type RequirementUpdate = TablesUpdate<'requirements_from_authority'>;

export function useRequirements(serviceCaseId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const requirementsQuery = useQuery({
    queryKey: ['requirements', serviceCaseId],
    queryFn: async () => {
      if (!serviceCaseId) return [];
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .select('*')
        .eq('service_case_id', serviceCaseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Requirement[];
    },
    enabled: !!serviceCaseId,
  });

  const createRequirement = useMutation({
    mutationFn: async (requirement: RequirementInsert) => {
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .insert({
          ...requirement,
          notified_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;

      // Send immediate notifications to assigned technician and managers
      if (serviceCaseId) {
        const { data: caseData } = await supabase
          .from('service_cases')
          .select('assigned_to_user_id, opportunities!inner(leads!inner(contacts!inner(full_name)))')
          .eq('id', serviceCaseId)
          .single();

        const clientName = (caseData?.opportunities as any)?.leads?.contacts?.full_name || 'Cliente';
        const caseShortId = serviceCaseId.slice(0, 8);

        // Notify assigned technician
        if (caseData?.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: caseData.assigned_to_user_id,
            type: 'requirement_new',
            title: '📋 Nova Exigência Registrada',
            message: `Exigência para caso ${caseShortId} de ${clientName}: "${requirement.description?.slice(0, 50)}...". Prazo: ${requirement.official_deadline_date || 'Não definido'}`
          });
        }

        // Notify coordinators
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER');
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'requirement_new_coord',
            title: '📋 Nova Exigência Registrada',
            message: `Caso ${caseShortId} de ${clientName} recebeu exigência. Prazo oficial: ${requirement.official_deadline_date || 'Não definido'}`
          });
        }

        // Record reminder sent
        await supabase.from('requirement_reminders').insert({
          requirement_id: data.id,
          reminder_type: 'IMMEDIATE',
          recipient_type: 'TECH_COORD'
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
      toast({ title: 'Exigência registrada', description: 'Notificações enviadas para técnico e coordenador.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar exigência', description: error.message, variant: 'destructive' });
    },
  });

  const updateRequirement = useMutation({
    mutationFn: async ({ id, ...updates }: RequirementUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('requirements_from_authority')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // If marked as responded, notify coordinator
      if (updates.status === 'RESPONDIDA' && serviceCaseId) {
        const { data: caseData } = await supabase
          .from('service_cases')
          .select('opportunities!inner(leads!inner(contacts!inner(full_name)))')
          .eq('id', serviceCaseId)
          .single();

        const clientName = (caseData?.opportunities as any)?.leads?.contacts?.full_name || 'Cliente';
        const caseShortId = serviceCaseId.slice(0, 8);

        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER');
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'requirement_responded',
            title: '✅ Exigência Respondida',
            message: `Caso ${caseShortId} de ${clientName}: exigência foi respondida/protocolada.`
          });
        }

        // Update coordinator notified timestamp
        await supabase.from('requirements_from_authority').update({
          coordinator_notified_at: new Date().toISOString()
        }).eq('id', id);

        // Record confirmation reminder
        await supabase.from('requirement_reminders').insert({
          requirement_id: id,
          reminder_type: 'RESPONSE_CONFIRMED',
          recipient_type: 'COORD'
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
      toast({ title: 'Exigência atualizada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar exigência', description: error.message, variant: 'destructive' });
    },
  });

  const requestExtension = useMutation({
    mutationFn: async ({ id, newDeadline }: { id: string; newDeadline: string }) => {
      // Get current requirement data
      const { data: current, error: fetchError } = await supabase
        .from('requirements_from_authority')
        .select('*')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;

      const currentExtensionCount = (current as any).extension_count || 0;
      const originalDeadline = (current as any).original_deadline_date || current.official_deadline_date;

      const { data, error } = await supabase
        .from('requirements_from_authority')
        .update({
          official_deadline_date: newDeadline,
          original_deadline_date: originalDeadline,
          extension_count: currentExtensionCount + 1,
          extension_requested_at: new Date().toISOString(),
          status: 'PRORROGADA',
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Notify about extension
      if (serviceCaseId) {
        const { data: caseData } = await supabase
          .from('service_cases')
          .select('assigned_to_user_id, opportunities!inner(leads!inner(contacts!inner(full_name)))')
          .eq('id', serviceCaseId)
          .single();

        const clientName = (caseData?.opportunities as any)?.leads?.contacts?.full_name || 'Cliente';
        const caseShortId = serviceCaseId.slice(0, 8);
        const extensionNum = currentExtensionCount + 1;

        // Notify technician
        if (caseData?.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: caseData.assigned_to_user_id,
            type: 'requirement_extension',
            title: '🔄 Prorrogação Solicitada',
            message: `Caso ${caseShortId}: ${extensionNum}ª prorrogação. Novo prazo: ${newDeadline}`
          });
        }

        // Notify coordinators
        const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'MANAGER');
        for (const mgr of managers || []) {
          await supabase.from('notifications').insert({
            user_id: mgr.user_id,
            type: 'requirement_extension_coord',
            title: '🔄 Prorrogação de Exigência',
            message: `Caso ${caseShortId} de ${clientName}: ${extensionNum}ª prorrogação solicitada. Novo prazo: ${newDeadline}`
          });
        }

        // Record extension reminder
        await supabase.from('requirement_reminders').insert({
          requirement_id: id,
          reminder_type: 'EXTENSION_REQUESTED',
          recipient_type: 'TECH_COORD'
        });

        // Alert admin if max extensions reached
        if (extensionNum >= 3) {
          const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'ADMIN');
          for (const admin of admins || []) {
            await supabase.from('notifications').insert({
              user_id: admin.user_id,
              type: 'requirement_max_extensions',
              title: '⚠️ Limite de Prorrogações Atingido',
              message: `Caso ${caseShortId} de ${clientName}: atingiu ${extensionNum} prorrogações. Risco de arquivamento!`
            });
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements'] });
      toast({ title: 'Prorrogação solicitada', description: 'Novo prazo registrado e notificações enviadas.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao solicitar prorrogação', description: error.message, variant: 'destructive' });
    },
  });

  const sendToLegal = useMutation({
    mutationFn: async (requirementId: string) => {
      // Notify legal team about this requirement
      const { data: juridicos } = await supabase.from('user_roles').select('user_id').eq('role', 'JURIDICO');
      
      const { data: req } = await supabase
        .from('requirements_from_authority')
        .select('description, service_case_id')
        .eq('id', requirementId)
        .single();

      if (req) {
        const caseShortId = req.service_case_id.slice(0, 8);
        for (const jur of juridicos || []) {
          await supabase.from('notifications').insert({
            user_id: jur.user_id,
            type: 'requirement_to_legal',
            title: '📬 Documentação para Protocolar',
            message: `Caso ${caseShortId}: documentação de exigência pronta para protocolar. "${req.description?.slice(0, 50)}..."`
          });
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      toast({ title: 'Enviado ao Jurídico', description: 'Equipe jurídica foi notificada.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar ao jurídico', description: error.message, variant: 'destructive' });
    },
  });

  return {
    requirements: requirementsQuery.data ?? [],
    isLoading: requirementsQuery.isLoading,
    error: requirementsQuery.error,
    createRequirement,
    updateRequirement,
    requestExtension,
    sendToLegal,
  };
}
