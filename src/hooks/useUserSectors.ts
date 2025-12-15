// User Sectors Hook v1.0
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserSector {
  id: string;
  user_id: string;
  sector_id: string;
  created_at: string;
  sector?: {
    id: string;
    code: string;
    name: string;
  };
}

export function useUserSectors(userId?: string) {
  return useQuery({
    queryKey: ['user-sectors', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_sectors')
        .select(`
          id,
          user_id,
          sector_id,
          created_at,
          service_sectors (
            id,
            code,
            name
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;
      
      return data.map(item => ({
        ...item,
        sector: item.service_sectors as { id: string; code: string; name: string } | undefined,
      })) as UserSector[];
    },
    enabled: !!userId,
  });
}

export function useAllUsersSectors() {
  return useQuery({
    queryKey: ['all-users-sectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_sectors')
        .select(`
          id,
          user_id,
          sector_id,
          created_at,
          service_sectors (
            id,
            code,
            name
          )
        `);

      if (error) throw error;
      
      // Group by user_id
      const grouped: Record<string, { id: string; code: string; name: string }[]> = {};
      
      data.forEach(item => {
        if (!grouped[item.user_id]) {
          grouped[item.user_id] = [];
        }
        if (item.service_sectors) {
          grouped[item.user_id].push(item.service_sectors as { id: string; code: string; name: string });
        }
      });
      
      return grouped;
    },
  });
}

export function useUpdateUserSectors() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, sectorIds }: { userId: string; sectorIds: string[] }) => {
      // Delete existing sectors for user
      const { error: deleteError } = await supabase
        .from('user_sectors')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new sectors if any
      if (sectorIds.length > 0) {
        const { error: insertError } = await supabase
          .from('user_sectors')
          .insert(sectorIds.map(sector_id => ({ user_id: userId, sector_id })));

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Setores atualizados com sucesso' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar setores',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
