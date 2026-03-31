// WhatsApp Templates Hook
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppTemplate {
  id: string;
  automation_type: string;
  template_name: string;
  body_text: string;
  variables: string[];
  content_sid: string | null;
  status: string;
  rejection_reason: string | null;
  is_active: boolean;
  template_category: 'sla' | 'operational';
  created_at: string;
  updated_at: string;
}

export function useWhatsAppTemplates() {
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('automation_type');
      if (error) throw error;
      return data as unknown as WhatsAppTemplate[];
    },
  });

  const submitTemplates = useMutation({
    mutationFn: async (automationType?: string) => {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-templates', {
        body: { action: 'submit', automation_type: automationType || 'ALL' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      const results = data?.results || [];
      const submitted = results.filter((r: any) => r.status === 'submitted').length;
      const errors = results.filter((r: any) => r.status === 'error').length;
      toast.success(`${submitted} template(s) submetido(s)${errors ? `, ${errors} erro(s)` : ''}`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao submeter templates: ' + error.message);
    },
  });

  const checkStatus = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-templates', {
        body: { action: 'check_status' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      const results = data?.results || [];
      const approved = results.filter((r: any) => r.status === 'approved').length;
      const rejected = results.filter((r: any) => r.status === 'rejected').length;
      toast.info(`Status atualizado: ${approved} aprovado(s), ${rejected} rejeitado(s), ${results.length - approved - rejected} pendente(s)`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao verificar status: ' + error.message);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; body_text?: string; is_active?: boolean; template_name?: string; template_category?: 'sla' | 'operational' }) => {
      const { error } = await supabase
        .from('whatsapp_templates')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Template atualizado');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (newTemplate: {
      automation_type: string;
      template_name: string;
      body_text: string;
      variables: string[];
      template_category?: 'sla' | 'operational';
    }) => {
      const { error } = await supabase
        .from('whatsapp_templates')
        .insert({
          ...newTemplate,
          status: 'draft',
          is_active: false,
          template_category: newTemplate.template_category || 'sla',
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Template criado com sucesso');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar template: ' + error.message);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Template excluído');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });

  const { data: templateLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['whatsapp-template-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_template_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  return {
    templates,
    isLoading,
    submitTemplates,
    checkStatus,
    updateTemplate,
    createTemplate,
    deleteTemplate,
    templateLogs,
    logsLoading,
  };
}
