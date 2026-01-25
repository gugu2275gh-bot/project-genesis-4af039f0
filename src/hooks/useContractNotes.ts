import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ContractNote {
  id: string;
  contract_id: string;
  note: string;
  note_type: 'ACORDO' | 'OBSERVACAO' | 'HISTORICO';
  created_by_user_id: string | null;
  created_at: string | null;
  profiles?: {
    full_name: string;
  } | null;
}

export function useContractNotes(contractId: string | undefined) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ['contract-notes', contractId],
    queryFn: async () => {
      if (!contractId) return [];
      
      const { data, error } = await supabase
        .from('contract_notes')
        .select(`
          *,
          profiles:created_by_user_id (full_name)
        `)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContractNote[];
    },
    enabled: !!contractId,
  });

  const addNote = useMutation({
    mutationFn: async ({ note, noteType }: { note: string; noteType: 'ACORDO' | 'OBSERVACAO' | 'HISTORICO' }) => {
      if (!contractId) throw new Error('Contract ID is required');
      
      const { data, error } = await supabase
        .from('contract_notes')
        .insert({
          contract_id: contractId,
          note,
          note_type: noteType,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-notes', contractId] });
      toast({ title: 'Nota adicionada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar nota', description: error.message, variant: 'destructive' });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase
        .from('contract_notes')
        .delete()
        .eq('id', noteId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-notes', contractId] });
      toast({ title: 'Nota removida com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover nota', description: error.message, variant: 'destructive' });
    },
  });

  return {
    notes: notesQuery.data ?? [],
    isLoading: notesQuery.isLoading,
    addNote,
    deleteNote,
  };
}
