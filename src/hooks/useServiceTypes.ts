import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sector_id: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceTypeWithSector extends ServiceType {
  service_sectors: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export type ServiceTypeInsert = Omit<ServiceType, 'id' | 'created_at' | 'updated_at'>;
export type ServiceTypeUpdate = Partial<ServiceTypeInsert>;

export function useServiceTypes(includeInactive = false) {
  return useQuery({
    queryKey: ['service-types', includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('service_types')
        .select(`
          *,
          service_sectors (id, name, code)
        `)
        .order('display_order', { ascending: true, nullsFirst: false });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ServiceTypeWithSector[];
    },
  });
}

export function useCreateServiceType() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (serviceType: ServiceTypeInsert) => {
      const { data, error } = await supabase
        .from('service_types')
        .insert(serviceType)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço criado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar tipo de serviço', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateServiceType() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ServiceTypeUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('service_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço atualizado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar tipo de serviço', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteServiceType() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_types')
        .update({ is_active: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço desativado com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao desativar tipo de serviço', description: error.message, variant: 'destructive' });
    },
  });
}
