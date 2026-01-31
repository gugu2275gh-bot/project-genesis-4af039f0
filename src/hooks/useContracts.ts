import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { addMonths } from 'date-fns';

export type Contract = Tables<'contracts'>;
export type ContractInsert = TablesInsert<'contracts'>;
export type ContractUpdate = TablesUpdate<'contracts'>;

export type ContractWithOpportunity = Contract & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
    };
  };
  payments?: Array<{
    id: string;
    amount: number;
    status: string;
    paid_at: string | null;
    installment_number: number | null;
    due_date: string | null;
  }>;
};

export function useContracts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (
                id, full_name, email, phone, address, document_type, document_number
              )
            )
          ),
          payments (
            id, amount, status, paid_at, installment_number, due_date
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContractWithOpportunity[];
    },
  });

  const createContract = useMutation({
    mutationFn: async (contract: ContractInsert) => {
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          ...contract,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const updateContract = useMutation({
    mutationFn: async ({ id, ...updates }: ContractUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          ...updates,
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const sendForSignature = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({
          status: 'ENVIADO',
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'CONTRATO_ENVIADO' })
        .eq('id', data.opportunity_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Contrato enviado para assinatura' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const markAsSigned = useMutation({
    mutationFn: async (id: string) => {
      // 1. Update contract status
      const { data: contract, error } = await supabase
        .from('contracts')
        .update({
          status: 'ASSINADO',
          signed_at: new Date().toISOString(),
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // 2. Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'CONTRATO_ASSINADO' })
        .eq('id', contract.opportunity_id);

      // 3. Generate installment payments if configured
      if (contract.installment_count && contract.installment_count > 0 && contract.first_due_date) {
        const installmentAmount = contract.installment_amount || (contract.total_fee ? contract.total_fee / contract.installment_count : 0);
        const firstDueDate = new Date(contract.first_due_date);

        const payments = [];
        for (let i = 0; i < contract.installment_count; i++) {
          const dueDate = addMonths(firstDueDate, i);
          payments.push({
            contract_id: contract.id,
            opportunity_id: contract.opportunity_id,
            amount: installmentAmount,
            installment_number: i + 1,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'PENDENTE' as const,
            currency: contract.currency || 'EUR',
          });
        }

        const { error: paymentsError } = await supabase
          .from('payments')
          .insert(payments);

        if (paymentsError) {
          console.error('Error creating installment payments:', paymentsError);
        }
      }

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Contrato assinado! Pagamentos gerados.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao marcar contrato como assinado', description: error.message, variant: 'destructive' });
    },
  });

  const cancelContract = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // 1. Update contract status to CANCELADO
      const { data: contract, error } = await supabase
        .from('contracts')
        .update({
          status: 'CANCELADO',
          cancellation_reason: reason,
          updated_by_user_id: user?.id,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // 2. Update opportunity status to FECHADA_PERDIDA
      await supabase
        .from('opportunities')
        .update({ 
          status: 'FECHADA_PERDIDA',
          reason_lost: `Contrato cancelado: ${reason}`,
        })
        .eq('id', contract.opportunity_id);

      // 3. Delete all pending payments for this contract (they won't be collected)
      await supabase
        .from('payments')
        .delete()
        .eq('contract_id', contract.id)
        .eq('status', 'PENDENTE');

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Contrato cancelado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao cancelar contrato', description: error.message, variant: 'destructive' });
    },
  });

  const suspendContract = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // 1. Suspender contrato
      const { data: contract, error } = await supabase
        .from('contracts')
        .update({
          is_suspended: true,
          suspended_at: new Date().toISOString(),
          suspended_by: user?.id,
          suspension_reason: reason,
          updated_by_user_id: user?.id,
        } as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // 2. Buscar e suspender caso técnico vinculado
      const { data: serviceCase } = await supabase
        .from('service_cases')
        .select('id, assigned_to_user_id')
        .eq('opportunity_id', contract.opportunity_id)
        .maybeSingle();

      if (serviceCase) {
        await supabase.from('service_cases')
          .update({
            is_suspended: true,
            suspended_at: new Date().toISOString(),
            suspended_by: user?.id,
            suspension_reason: reason,
          } as any)
          .eq('id', serviceCase.id);

        // 3. Notificar técnico responsável
        if (serviceCase.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: serviceCase.assigned_to_user_id,
            title: 'Caso Suspenso por Inadimplência',
            message: `O caso foi suspenso pelo Financeiro: ${reason}`,
            type: 'case_suspended',
          });
        }
      }

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      toast({ title: 'Contrato suspenso por inadimplência' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao suspender contrato', description: error.message, variant: 'destructive' });
    },
  });

  const reactivateContract = useMutation({
    mutationFn: async (id: string) => {
      // 1. Reativar contrato
      const { data: contract, error } = await supabase
        .from('contracts')
        .update({
          is_suspended: false,
          suspended_at: null,
          suspended_by: null,
          suspension_reason: null,
          updated_by_user_id: user?.id,
        } as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;

      // 2. Reativar caso técnico
      const { data: serviceCase } = await supabase
        .from('service_cases')
        .select('id, assigned_to_user_id')
        .eq('opportunity_id', contract.opportunity_id)
        .maybeSingle();

      if (serviceCase) {
        await supabase.from('service_cases')
          .update({
            is_suspended: false,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
          } as any)
          .eq('id', serviceCase.id);

        // 3. Notificar técnico
        if (serviceCase.assigned_to_user_id) {
          await supabase.from('notifications').insert({
            user_id: serviceCase.assigned_to_user_id,
            title: 'Caso Reativado',
            message: 'O caso foi reativado pelo Financeiro. Você pode continuar o processo.',
            type: 'case_reactivated',
          });
        }
      }

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      toast({ title: 'Contrato reativado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao reativar contrato', description: error.message, variant: 'destructive' });
    },
  });

  return {
    contracts: contractsQuery.data ?? [],
    isLoading: contractsQuery.isLoading,
    error: contractsQuery.error,
    createContract,
    updateContract,
    sendForSignature,
    markAsSigned,
    cancelContract,
    suspendContract,
    reactivateContract,
  };
}

export function useContract(id: string | undefined) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (
                id, full_name, email, phone, address, document_type, document_number
              )
            )
          )
        `)
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as ContractWithOpportunity | null;
    },
    enabled: !!id,
  });
}
