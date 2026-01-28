import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate, Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ServiceDocument = Tables<'service_documents'>;
export type ServiceDocumentType = Tables<'service_document_types'>;
export type ServiceDocumentUpdate = TablesUpdate<'service_documents'>;
type ServiceInterest = Database['public']['Enums']['service_interest'];

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

  // Filter document types by service type
  const documentTypesForService = (serviceType: ServiceInterest) => {
    return (documentTypesQuery.data ?? []).filter(
      (dt) => dt.service_type === serviceType
    );
  };

  const provisionDocuments = useMutation({
    mutationFn: async ({ serviceCaseId, serviceType }: { serviceCaseId: string; serviceType: ServiceInterest }) => {
      // 1. Get document types for this service
      const docTypes = documentTypesForService(serviceType);
      
      if (docTypes.length === 0) {
        throw new Error('Nenhum tipo de documento encontrado para este serviço');
      }

      // 2. Create a service_document for each type
      const documents = docTypes.map((dt) => ({
        service_case_id: serviceCaseId,
        document_type_id: dt.id,
        status: 'NAO_ENVIADO' as const,
      }));

      const { error } = await supabase
        .from('service_documents')
        .insert(documents);

      if (error) throw error;
      return documents;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', serviceCaseId] });
      toast({ title: 'Documentos liberados para o cliente' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao liberar documentos', 
        description: error.message, 
        variant: 'destructive' 
      });
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
    documentTypesForService,
    isLoading: documentsQuery.isLoading,
    isLoadingDocumentTypes: documentTypesQuery.isLoading,
    error: documentsQuery.error,
    provisionDocuments,
    updateDocument,
    approveDocument,
    rejectDocument,
  };
}
