import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type Payment = Tables<'payments'>;
export type PaymentInsert = TablesInsert<'payments'>;
export type PaymentUpdate = TablesUpdate<'payments'>;

export type PaymentWithOpportunity = Payment & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
  };
};

export function usePayments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
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
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PaymentWithOpportunity[];
    },
  });

  const createPayment = useMutation({
    mutationFn: async (payment: PaymentInsert) => {
      const { data, error } = await supabase
        .from('payments')
        .insert(payment)
        .select()
        .single();
      
      if (error) throw error;

      // Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'PAGAMENTO_PENDENTE' })
        .eq('id', payment.opportunity_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Pagamento criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const confirmPayment = useMutation({
    mutationFn: async ({ id, transactionId }: { id: string; transactionId?: string }) => {
      // 1. Update payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .update({
          status: 'CONFIRMADO',
          paid_at: new Date().toISOString(),
          transaction_id: transactionId,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (paymentError) throw paymentError;

      // 2. Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'FECHADA_GANHA' })
        .eq('id', payment.opportunity_id);

      // 3. Get opportunity to find service type from lead
      const { data: opportunity } = await supabase
        .from('opportunities')
        .select(`
          *,
          leads (*)
        `)
        .eq('id', payment.opportunity_id)
        .single();

      if (opportunity?.leads) {
        // 4. Create service case
        const serviceType = opportunity.leads.service_interest || 'OUTRO';
        type ServiceSector = 'ESTUDANTE' | 'TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO' | 'NACIONALIDADE';
        const sectorMap: Record<string, ServiceSector> = {
          'VISTO_ESTUDANTE': 'ESTUDANTE',
          'VISTO_TRABALHO': 'TRABALHO',
          'REAGRUPAMENTO': 'REAGRUPAMENTO',
          'RENOVACAO_RESIDENCIA': 'RENOVACAO',
          'NACIONALIDADE_RESIDENCIA': 'NACIONALIDADE',
          'NACIONALIDADE_CASAMENTO': 'NACIONALIDADE',
          'OUTRO': 'ESTUDANTE',
        };

        const sector: ServiceSector = sectorMap[serviceType] || 'ESTUDANTE';

        const { error: caseError } = await supabase
          .from('service_cases')
          .insert([{
            opportunity_id: payment.opportunity_id,
            service_type: serviceType,
            sector: sector,
            technical_status: 'CONTATO_INICIAL' as const,
          }]);
        
        if (caseError) console.error('Error creating service case:', caseError);

        // 5. Create task for internal routing
        await supabase
          .from('tasks')
          .insert([{
            title: 'Encaminhamento Interno',
            description: 'Atribuir caso ao setor técnico responsável',
            related_opportunity_id: payment.opportunity_id,
            created_by_user_id: user?.id,
          }]);
      }

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Pagamento confirmado! Caso técnico criado.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao confirmar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, ...updates }: PaymentUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Pagamento atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  return {
    payments: paymentsQuery.data ?? [],
    isLoading: paymentsQuery.isLoading,
    error: paymentsQuery.error,
    createPayment,
    confirmPayment,
    updatePayment,
  };
}
