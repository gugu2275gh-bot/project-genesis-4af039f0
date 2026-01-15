import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';

export type Contract = Tables<'contracts'>;

export type ContractWithDetails = Contract & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
  };
};

export function useClientContracts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['client-contracts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Get service cases for this client
      const { data: cases, error: casesError } = await supabase
        .from('service_cases')
        .select('opportunity_id')
        .eq('client_user_id', user.id);
      
      if (casesError) throw casesError;
      if (!cases || cases.length === 0) return [];
      
      const opportunityIds = cases.map(c => c.opportunity_id);
      
      // Get contracts for those opportunities
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (*)
            )
          )
        `)
        .in('opportunity_id', opportunityIds)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContractWithDetails[];
    },
    enabled: !!user?.id,
  });
}
