import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface CaseNote {
  id: string;
  service_case_id: string;
  note: string;
  note_type: string | null;
  created_at: string | null;
  created_by_user_id: string | null;
  created_by_profile?: {
    full_name: string;
  } | null;
}

export function useCaseNotes(serviceCaseId?: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ['case-notes', serviceCaseId],
    queryFn: async () => {
      if (!serviceCaseId) return [];
      
      // Use raw query since types might not be regenerated yet
      const { data, error } = await supabase
        .from('case_notes' as any)
        .select('*')
        .eq('service_case_id', serviceCaseId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Fetch profile names separately
      const notes = (data || []) as any[];
      const userIds = [...new Set(notes.map(n => n.created_by_user_id).filter(Boolean))];
      
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        if (profiles) {
          profileMap = profiles.reduce((acc, p) => {
            acc[p.id] = p.full_name;
            return acc;
          }, {} as Record<string, string>);
        }
      }
      
      return notes.map(note => ({
        ...note,
        created_by_profile: note.created_by_user_id 
          ? { full_name: profileMap[note.created_by_user_id] || 'Usuário' }
          : null,
      })) as CaseNote[];
    },
    enabled: !!serviceCaseId,
  });

  const createNote = useMutation({
    mutationFn: async ({ note, note_type }: { note: string; note_type?: string }) => {
      if (!serviceCaseId) throw new Error('Case ID is required');
      
      const { data, error } = await supabase
        .from('case_notes' as any)
        .insert({
          service_case_id: serviceCaseId,
          note,
          note_type: note_type || 'GENERAL',
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-notes', serviceCaseId] });
      toast({ title: 'Nota adicionada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar nota', description: error.message, variant: 'destructive' });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('case_notes' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-notes', serviceCaseId] });
      toast({ title: 'Nota removida' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover nota', description: error.message, variant: 'destructive' });
    },
  });

  return {
    notes: notesQuery.data ?? [],
    isLoading: notesQuery.isLoading,
    error: notesQuery.error,
    createNote,
    deleteNote,
  };
}
