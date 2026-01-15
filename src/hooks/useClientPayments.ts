import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';

export type Payment = Tables<'payments'>;

export type PaymentWithDetails = Payment & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
    service_cases: Array<Tables<'service_cases'>>;
  };
};

export function useClientPayments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['client-payments', user?.id],
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
      
      // Get payments for those opportunities
      const { data, error } = await supabase
        .from('payments')
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
      return data as PaymentWithDetails[];
    },
    enabled: !!user?.id,
  });
}
