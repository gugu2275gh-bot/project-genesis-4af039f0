import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ServiceSector {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export type ServiceSectorInsert = Omit<ServiceSector, 'id' | 'created_at' | 'updated_at'>;
export type ServiceSectorUpdate = Partial<ServiceSectorInsert>;

export function useServiceSectors(includeInactive = false) {
  return useQuery({
    queryKey: ['service-sectors', includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('service_sectors')
        .select('*')
        .order('display_order', { ascending: true, nullsFirst: false });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ServiceSector[];
    },
  });
}

export function useCreateServiceSector() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sector: ServiceSectorInsert) => {
      const { data, error } = await supabase
        .from('service_sectors')
        .insert(sector)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-sectors'] });
      toast({ title: 'Setor criado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar setor', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateServiceSector() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ServiceSectorUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('service_sectors')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-sectors'] });
      toast({ title: 'Setor atualizado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar setor', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteServiceSector() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_sectors')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-sectors'] });
      toast({ title: 'Setor desativado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao desativar setor', description: error.message, variant: 'destructive' });
    },
  });
}
