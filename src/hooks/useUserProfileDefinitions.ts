import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface UserProfileDefinition {
  id: string;
  role_code: string;
  display_name: string;
  detailed_description: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export type UserProfileDefinitionInsert = Omit<UserProfileDefinition, 'id' | 'created_at' | 'updated_at'>;
export type UserProfileDefinitionUpdate = Partial<UserProfileDefinitionInsert>;

export function useUserProfileDefinitions(includeInactive = false) {
  return useQuery({
    queryKey: ['user-profile-definitions', includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('user_profile_definitions')
        .select('*')
        .order('display_order', { ascending: true, nullsFirst: false });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as UserProfileDefinition[];
    },
  });
}

export function useCreateUserProfileDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (profile: UserProfileDefinitionInsert) => {
      const { data, error } = await supabase
        .from('user_profile_definitions')
        .insert(profile)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile-definitions'] });
      toast({ title: 'Perfil criado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar perfil', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateUserProfileDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UserProfileDefinitionUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('user_profile_definitions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile-definitions'] });
      toast({ title: 'Perfil atualizado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar perfil', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteUserProfileDefinition() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_profile_definitions')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile-definitions'] });
      toast({ title: 'Perfil desativado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao desativar perfil', description: error.message, variant: 'destructive' });
    },
  });
}
