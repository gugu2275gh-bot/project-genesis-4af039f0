// WhatsApp Templates Hook
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  title: string;
  url?: string;
  phone?: string;
}

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
  meta_category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  content_type: string;
  header_text: string | null;
  footer_text: string | null;
  media_url: string | null;
  buttons: TemplateButton[];
  created_at: string;
  updated_at: string;
}

export type { WhatsAppTemplate, TemplateButton };

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
    mutationFn: async (force?: boolean) => {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-templates', {
        body: { action: 'check_status', force: force || false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      const results = data?.results || [];
      const approved = results.filter((r: any) => r.current_status === 'approved').length;
      const rejected = results.filter((r: any) => r.current_status === 'rejected').length;
      const changed = results.filter((r: any) => r.changed).length;
      toast.info(`Status verificado: ${results.length} template(s), ${changed} atualizado(s), ${approved} aprovado(s), ${rejected} rejeitado(s)`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao verificar status: ' + error.message);
    },
  });

  const syncFromTwilio = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-templates', {
        body: { action: 'sync_from_twilio' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      const summary = data?.summary || {};
      toast.success(`Sincronizado: ${summary.matched || 0} encontrado(s), ${summary.updated || 0} atualizado(s), ${summary.unmatched || 0} sem correspondência`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao sincronizar: ' + error.message);
    },
  });

  const forceResubmit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('submit-whatsapp-templates', {
        body: { action: 'force_resubmit' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      const summary = data?.summary || {};
      toast.success(`Resubmissão concluída: ${summary.submitted || 0} submetido(s), ${summary.errors || 0} erro(s)`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao resubmeter templates: ' + error.message);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; body_text?: string; is_active?: boolean; template_name?: string; template_category?: 'sla' | 'operational'; meta_category?: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; automation_type?: string; language?: string; variables?: string[]; status?: string; content_type?: string; header_text?: string | null; footer_text?: string | null; media_url?: string | null; buttons?: TemplateButton[] }) => {
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
      meta_category?: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
      language?: string;
    }) => {
      const { error } = await supabase
        .from('whatsapp_templates')
        .insert({
          ...newTemplate,
          status: 'draft',
          is_active: false,
          template_category: newTemplate.template_category || 'sla',
          meta_category: newTemplate.meta_category || 'UTILITY',
          language: newTemplate.language || 'pt_BR',
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

  const operationalTemplates = templates?.filter(
    (t) => t.template_category === 'operational' && t.status === 'approved' && t.is_active
  ) || [];

  return {
    templates,
    isLoading,
    submitTemplates,
    checkStatus,
    syncFromTwilio,
    forceResubmit,
    updateTemplate,
    createTemplate,
    deleteTemplate,
    templateLogs,
    logsLoading,
    operationalTemplates,
  };
}
