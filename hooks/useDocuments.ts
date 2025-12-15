import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ServiceDocument = Tables<'service_documents'>;
export type ServiceDocumentType = Tables<'service_document_types'>;
export type ServiceDocumentUpdate = TablesUpdate<'service_documents'>;

export type DocumentWithType = ServiceDocument & {
  service_document_types: ServiceDocumentType;
};

export function useDocuments(serviceCaseId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['documents', serviceCaseId],
    queryFn: async () => {
      if (!serviceCaseId) return [];
      const { data, error } = await supabase
        .from('service_documents')
        .select(`
          *,
          service_document_types (*)
        `)
        .eq('service_case_id', serviceCaseId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as DocumentWithType[];
    },
    enabled: !!serviceCaseId,
  });

  const documentTypesQuery = useQuery({
    queryKey: ['document-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_document_types')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as ServiceDocumentType[];
    },
  });

  const updateDocument = useMutation({
    mutationFn: async ({ id, ...updates }: ServiceDocumentUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('service_documents')
        .update({
          ...updates,
          uploaded_by_user_id: user?.id,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Documento atualizado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar documento', description: error.message, variant: 'destructive' });
    },
  });

  const approveDocument = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('service_documents')
        .update({ status: 'APROVADO' })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Documento aprovado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao aprovar documento', description: error.message, variant: 'destructive' });
    },
  });

  const rejectDocument = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase
        .from('service_documents')
        .update({
          status: 'REJEITADO',
          rejection_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({ title: 'Documento rejeitado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao rejeitar documento', description: error.message, variant: 'destructive' });
    },
  });

  return {
    documents: documentsQuery.data ?? [],
    documentTypes: documentTypesQuery.data ?? [],
    isLoading: documentsQuery.isLoading,
    error: documentsQuery.error,
    updateDocument,
    approveDocument,
    rejectDocument,
  };
}
