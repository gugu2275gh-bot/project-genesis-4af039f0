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
    mutationFn: async ({ id, transactionId, paidAt }: { id: string; transactionId?: string; paidAt?: string }) => {
      // 1. Update payment to CONFIRMADO
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .update({
          status: 'CONFIRMADO',
          paid_at: paidAt || new Date().toISOString(),
          transaction_id: transactionId,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (paymentError) throw paymentError;

      let isFirstPayment = false;
      let caseCreated = false;

      // 2. Check if payment has a linked contract
      if (payment.contract_id) {
        // 3. Get contract to check current payment_status
        const { data: contract } = await supabase
          .from('contracts')
          .select('id, payment_status, opportunity_id')
          .eq('id', payment.contract_id)
          .single();

        // 4. If payment_status is NAO_INICIADO, this is the FIRST payment
        if (contract && contract.payment_status === 'NAO_INICIADO') {
          isFirstPayment = true;

          // 4a. Update contract payment_status to INICIADO
          await supabase
            .from('contracts')
            .update({ payment_status: 'INICIADO' })
            .eq('id', contract.id);

          // 4b. Update opportunity to FECHADA_GANHA
          await supabase
            .from('opportunities')
            .update({ status: 'FECHADA_GANHA' })
            .eq('id', payment.opportunity_id);

          // 4c. Get lead data for service type
          const { data: opportunity } = await supabase
            .from('opportunities')
            .select('*, leads (*)')
            .eq('id', payment.opportunity_id)
            .single();

          if (opportunity?.leads) {
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

            // 4d. Create technical case linked to opportunity
            const { data: newCase, error: caseError } = await supabase
              .from('service_cases')
              .insert([{
                opportunity_id: payment.opportunity_id,
                service_type: serviceType,
                sector: sector,
                technical_status: 'CONTATO_INICIAL' as const,
              }])
              .select()
              .single();

            if (!caseError && newCase) {
              caseCreated = true;

              // 4e. Create routing task linked to the case
              await supabase
                .from('tasks')
                .insert([{
                  title: 'Encaminhamento Interno',
                  description: 'Caso técnico criado após confirmação do primeiro pagamento do contrato. Atribuir ao setor técnico responsável.',
                  related_opportunity_id: payment.opportunity_id,
                  related_service_case_id: newCase.id,
                  created_by_user_id: user?.id,
                }]);

              // 4f. Create notifications for TECNICO users
              const { data: techUsers } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('role', 'TECNICO');

              if (techUsers?.length) {
                const notifications = techUsers.map(u => ({
                  user_id: u.user_id,
                  type: 'case_status_changed',
                  title: 'Novo Caso Técnico',
                  message: 'Um novo caso foi criado após confirmação de pagamento e está aguardando atribuição.',
                }));

                await supabase.from('notifications').insert(notifications);
              }
            } else if (caseError) {
              console.error('Error creating service case:', caseError);
            }
          }
        }

        // 5. Check if ALL payments of this contract are confirmed
        const { data: allPayments } = await supabase
          .from('payments')
          .select('status')
          .eq('contract_id', payment.contract_id);

        const allConfirmed = allPayments?.every(p => p.status === 'CONFIRMADO');

        if (allConfirmed) {
          // Update contract to QUITADO (fully paid)
          await supabase
            .from('contracts')
            .update({ payment_status: 'QUITADO' })
            .eq('id', payment.contract_id);
        }
      } else {
        // Payment without linked contract - legacy behavior
        // Just update opportunity status
        await supabase
          .from('opportunities')
          .update({ status: 'FECHADA_GANHA' })
          .eq('id', payment.opportunity_id);
      }

      return { payment, isFirstPayment, caseCreated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      
      if (result.isFirstPayment && result.caseCreated) {
        toast({ title: 'Pagamento confirmado! Contrato iniciado e caso técnico criado.' });
      } else if (result.isFirstPayment) {
        toast({ title: 'Pagamento confirmado! Contrato iniciado.' });
      } else {
        toast({ title: 'Pagamento confirmado!' });
      }
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
