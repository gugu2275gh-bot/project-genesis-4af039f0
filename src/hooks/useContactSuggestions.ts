import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactSuggestion {
  id: string;
  contact_id: string;
  field_name: string;
  suggested_value: string;
  current_value: string | null;
  source: string;
  status: string;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome Completo',
  nationality: 'Nacionalidade',
  country_of_origin: 'País de Origem',
  birth_date: 'Data de Nascimento',
  civil_status: 'Estado Civil',
  profession: 'Profissão',
  email: 'E-mail',
  address: 'Endereço',
  spain_arrival_date: 'Entrada na Espanha',
  document_number: 'Nº Documento',
  education_level: 'Escolaridade',
  birth_city: 'Cidade de Nascimento',
  birth_state: 'Estado de Nascimento',
  is_empadronado: 'Empadronado',
  empadronamiento_city: 'Cidade Empadronamiento',
  empadronamiento_since: 'Empadronado Desde',
  has_job_offer: 'Oferta de Trabalho',
  works_remotely: 'Trabalho Remoto',
  has_eu_family_member: 'Familiar Europeu',
  referral_name: 'Indicado por',
  monthly_income: 'Renda Mensal',
};

export function getFieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] || fieldName;
}

export function useContactSuggestions(contactId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const suggestionsQuery = useQuery({
    queryKey: ['contact-suggestions', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('contact_data_suggestions')
        .select('*')
        .eq('contact_id', contactId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ContactSuggestion[];
    },
    enabled: !!contactId,
  });

  const acceptSuggestion = useMutation({
    mutationFn: async ({ suggestion }: { suggestion: ContactSuggestion }) => {
      // Update contact field
      const updateData: Record<string, any> = {};
      // Handle boolean fields
      if (['is_empadronado', 'has_job_offer', 'works_remotely', 'has_eu_family_member'].includes(suggestion.field_name)) {
        updateData[suggestion.field_name] = suggestion.suggested_value === 'true' || suggestion.suggested_value === 'sim';
      } else if (['monthly_income'].includes(suggestion.field_name)) {
        updateData[suggestion.field_name] = parseFloat(suggestion.suggested_value) || 0;
      } else {
        updateData[suggestion.field_name] = suggestion.suggested_value;
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', suggestion.contact_id);
      if (updateError) throw updateError;

      // Mark suggestion as accepted
      const { error: statusError } = await supabase
        .from('contact_data_suggestions')
        .update({ status: 'accepted', reviewed_at: new Date().toISOString() })
        .eq('id', suggestion.id);
      if (statusError) throw statusError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-suggestions', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts', contactId] });
      toast({ title: 'Dado atualizado com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });

  const rejectSuggestion = useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('contact_data_suggestions')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-suggestions', contactId] });
    },
  });

  return {
    suggestions: suggestionsQuery.data ?? [],
    isLoading: suggestionsQuery.isLoading,
    acceptSuggestion,
    rejectSuggestion,
  };
}
