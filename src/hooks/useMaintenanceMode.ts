import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const MAINTENANCE_OWNER_EMAIL = 'rvbarros@gmail.com';
const MAINTENANCE_KEY = 'maintenance_mode';

export function useMaintenanceMode() {
  const queryClient = useQueryClient();

  const { data: isEnabled = false, isLoading } = useQuery({
    queryKey: ['maintenance-mode'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', MAINTENANCE_KEY)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao ler modo manutenção:', error.message);
        return false;
      }
      return String(data?.value ?? 'false') === 'true';
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    const channel = supabase
      .channel('maintenance-mode-config')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_config', filter: `key=eq.${MAINTENANCE_KEY}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['maintenance-mode'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const setMaintenance = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('system_config')
        .update({ value: enabled ? 'true' : 'false' })
        .eq('key', MAINTENANCE_KEY);

      if (error) throw error;
      return enabled;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-mode'] });
      queryClient.invalidateQueries({ queryKey: ['system-config-all'] });
    },
  });

  return { isEnabled, isLoading, setMaintenance };
}
