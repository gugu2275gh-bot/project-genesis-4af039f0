// Leads hook - merge, create, update, delete
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type Lead = Tables<'leads'>;
export type LeadInsert = TablesInsert<'leads'>;
export type LeadUpdate = TablesUpdate<'leads'>;

export type LeadWithContact = Lead & {
  contacts: Tables<'contacts'> | null;
};

export function useLeads() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          contacts (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as LeadWithContact[];
    },
  });

  const createLead = useMutation({
    mutationFn: async (lead: LeadInsert) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          created_by_user_id: user?.id,
          assigned_to_user_id: lead.assigned_to_user_id || user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar lead', description: error.message, variant: 'destructive' });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...updates,
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads', variables.id] });
      toast({ title: 'Lead atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar lead', description: error.message, variant: 'destructive' });
    },
  });

  const confirmInterest = useMutation({
    mutationFn: async (leadId: string) => {
      // Fetch lead to check if it's a special case
      const { data: leadData, error: fetchError } = await supabase
        .from('leads')
        .select('is_special_case, service_interest, contact_id')
        .eq('id', leadId)
        .single();
      
      if (fetchError) throw fetchError;

      const isSpecialCase = leadData?.is_special_case || false;

      // 1. Update lead status
      const { error: leadError } = await supabase
        .from('leads')
        .update({
          status: 'INTERESSE_CONFIRMADO',
          interest_confirmed: true,
          updated_by_user_id: user?.id,
        })
        .eq('id', leadId);
      
      if (leadError) throw leadError;

      // 2. Create opportunity
      const { data: opportunity, error: oppError } = await supabase
        .from('opportunities')
        .insert({
          lead_id: leadId,
          status: isSpecialCase ? 'FECHADA_GANHA' : 'ABERTA',
        })
        .select()
        .single();
      
      if (oppError) throw oppError;

      if (isSpecialCase) {
        // Special case: skip contract/payments, create service case directly
        const sectorMap: Record<string, string> = {
          'VISTO_ESTUDANTE': 'ESTUDANTE',
          'VISTO_TRABALHO': 'TRABALHO',
          'REAGRUPAMENTO': 'REAGRUPAMENTO',
          'RENOVACAO_RESIDENCIA': 'RENOVACAO',
          'NACIONALIDADE_RESIDENCIA': 'NACIONALIDADE',
          'NACIONALIDADE_CASAMENTO': 'NACIONALIDADE',
        };

        const serviceInterest = leadData.service_interest || 'OUTRO';

        const { error: caseError } = await supabase
          .from('service_cases')
          .insert([{
            opportunity_id: opportunity.id,
            service_type: serviceInterest as any,
            sector: (sectorMap[serviceInterest] || 'ESTUDANTE') as any,
            technical_status: 'CONTATO_INICIAL' as any,
          }]);

        if (caseError) throw caseError;

        // Create task for technician
        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: 'Caso Especial - Contato Inicial',
            description: 'Caso especial encaminhado diretamente para trâmite técnico sem contrato/pagamento.',
            related_lead_id: leadId,
            related_opportunity_id: opportunity.id,
            created_by_user_id: user?.id,
          });

        if (taskError) throw taskError;
      } else {
        // Normal flow: create tasks for contract and payment
        const tasks = [
          {
            title: 'Gerar Contrato',
            description: 'Elaborar contrato para o cliente',
            related_lead_id: leadId,
            related_opportunity_id: opportunity.id,
            created_by_user_id: user?.id,
          },
          {
            title: 'Configurar Pagamento',
            description: 'Preparar opções de pagamento para o cliente',
            related_lead_id: leadId,
            related_opportunity_id: opportunity.id,
            created_by_user_id: user?.id,
          },
        ];

        const { error: tasksError } = await supabase
          .from('tasks')
          .insert(tasks);
        
        if (tasksError) throw tasksError;
      }

      return { opportunity, isSpecialCase };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      if (result.isSpecialCase) {
        toast({ title: 'Caso especial! Encaminhado diretamente para trâmite técnico.' });
      } else {
        toast({ title: 'Interesse confirmado! Oportunidade e tarefas criadas.' });
      }
    },
    onError: (error) => {
      toast({ title: 'Erro ao confirmar interesse', description: error.message, variant: 'destructive' });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (leadId: string) => {
      // Verificar se tem oportunidades vinculadas
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('id')
        .eq('lead_id', leadId)
        .limit(1);
      
      if (opportunities && opportunities.length > 0) {
        throw new Error('Este lead possui oportunidades vinculadas e não pode ser excluído.');
      }
      
      // Excluir registros relacionados em cascata
      await supabase.from('interactions').delete().eq('lead_id', leadId);
      await supabase.from('tasks').delete().eq('related_lead_id', leadId);
      await supabase.from('mensagens_cliente').delete().eq('id_lead', leadId);
      
      // Excluir lead
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead excluído com sucesso' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao excluir lead', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const createLeadForContact = useMutation({
    mutationFn: async ({ contact_id, service_interest, service_type_id, notes }: { contact_id: string; service_interest: string; service_type_id?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          contact_id,
          service_interest: service_interest as any,
          service_type_id: service_type_id || null,
          notes: notes || null,
          status: 'NOVO' as any,
          created_by_user_id: user?.id,
          assigned_to_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Novo lead criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar lead', description: error.message, variant: 'destructive' });
    },
  });

  const mergeLeads = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (leadIds.length < 2) throw new Error('Selecione pelo menos 2 leads para mesclar.');

      // Fetch all leads to find the most recent
      const { data: leadsToMerge, error: fetchError } = await supabase
        .from('leads')
        .select('*, contacts(*)')
        .in('id', leadIds)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      if (!leadsToMerge || leadsToMerge.length < 2) throw new Error('Leads não encontrados.');

      // Verify all leads belong to the same contact
      const contactIds = new Set(leadsToMerge.map(l => l.contact_id));
      if (contactIds.size > 1) throw new Error('Todos os leads devem pertencer ao mesmo cliente.');

      const primaryLead = leadsToMerge[0]; // most recent
      const secondaryIds = leadsToMerge.slice(1).map(l => l.id);

      // Move interactions to primary lead
      await supabase
        .from('interactions')
        .update({ lead_id: primaryLead.id })
        .in('lead_id', secondaryIds);

      // Move tasks to primary lead
      await supabase
        .from('tasks')
        .update({ related_lead_id: primaryLead.id })
        .in('related_lead_id', secondaryIds);

      // Move mensagens_cliente to primary lead
      await supabase
        .from('mensagens_cliente')
        .update({ id_lead: primaryLead.id })
        .in('id_lead', secondaryIds);

      // Consolidate notes from secondary leads
      const secondaryNotes = leadsToMerge.slice(1)
        .filter(l => l.notes)
        .map(l => `[Mesclado de lead ${l.id?.slice(0, 8)}]: ${l.notes}`)
        .join('\n');

      const mergedNotes = [primaryLead.notes, secondaryNotes].filter(Boolean).join('\n');

      // Update primary lead with consolidated notes
      await supabase
        .from('leads')
        .update({
          notes: mergedNotes || null,
          updated_by_user_id: user?.id,
        })
        .eq('id', primaryLead.id);

      // Archive secondary leads
      for (const id of secondaryIds) {
        await supabase
          .from('leads')
          .update({
            status: 'MESCLADO' as any,
            notes: `Mesclado ao lead ${primaryLead.id.slice(0, 8)}`,
            updated_by_user_id: user?.id,
          })
          .eq('id', id);
      }

      return primaryLead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['interactions'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Leads mesclados com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao mesclar leads', description: error.message, variant: 'destructive' });
    },
  });

  return {
    leads: leadsQuery.data ?? [],
    isLoading: leadsQuery.isLoading,
    error: leadsQuery.error,
    createLead,
    updateLead,
    confirmInterest,
    deleteLead,
    createLeadForContact,
    mergeLeads,
  };
}

export function useContactLeads(contactId: string | undefined) {
  return useQuery({
    queryKey: ['leads', 'contact', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*, contacts(*)')
        .eq('contact_id', contactId)
        .neq('status', 'MESCLADO')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as LeadWithContact[];
    },
    enabled: !!contactId,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['leads', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          contacts (*)
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as LeadWithContact | null;
    },
    enabled: !!id,
  });
}
