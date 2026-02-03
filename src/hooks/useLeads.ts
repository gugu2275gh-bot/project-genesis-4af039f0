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
          status: 'ABERTA',
        })
        .select()
        .single();
      
      if (oppError) throw oppError;

      // 3. Create tasks for Juridico and Financeiro
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

      return opportunity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Interesse confirmado! Oportunidade e tarefas criadas.' });
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

  return {
    leads: leadsQuery.data ?? [],
    isLoading: leadsQuery.isLoading,
    error: leadsQuery.error,
    createLead,
    updateLead,
    confirmInterest,
    deleteLead,
  };
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
