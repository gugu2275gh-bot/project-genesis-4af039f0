import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type CommissionStatus = 'PENDENTE_APROVACAO' | 'APROVADA' | 'PAGA' | 'REJEITADA' | 'CANCELADA';

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  PENDENTE_APROVACAO: 'Pendente Aprovação',
  APROVADA: 'Aprovada',
  PAGA: 'Paga',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};

export interface Commission {
  id: string;
  contract_id: string;
  opportunity_id: string | null;
  collaborator_name: string;
  collaborator_type: 'CAPTADOR' | 'FORNECEDOR';
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  has_invoice: boolean;
  vat_enabled: boolean;
  status: CommissionStatus;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  reference_period: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionWithContract extends Commission {
  contracts: {
    id: string;
    total_fee: number;
    opportunities: {
      leads: {
        contacts: {
          full_name: string;
          referral_name: string | null;
        } | null;
      } | null;
    } | null;
  } | null;
  opportunity?: {
    id: string;
    total_amount: number | null;
    leads: {
      id: string;
      contacts: { full_name: string; referral_name: string | null } | null;
      service_types: { name: string } | null;
      service_interest: string | null;
    } | null;
  } | null;
  approved_by_profile?: {
    full_name: string;
  } | null;
}

export interface CommissionInsert {
  contract_id: string;
  opportunity_id?: string | null;
  collaborator_name: string;
  collaborator_type: 'CAPTADOR' | 'FORNECEDOR';
  base_amount: number;
  commission_rate?: number;
  commission_amount?: number;
  has_invoice?: boolean;
  vat_enabled?: boolean;
  notes?: string;
  reference_period?: string;
  paid_at?: string | null;
}


export function useCommissions() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const commissionsQuery = useQuery({
    queryKey: ['commissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          contracts (
            id,
            total_fee,
            payment_status,
            opportunities (
              leads (
                contacts (
                  full_name,
                  referral_name
                )
              )
            ),
            payments (
              id,
              status,
              opportunity_id
            )
          ),
          opportunity:opportunities!commissions_opportunity_id_fkey (
            id,
            total_amount,
            leads (
              id,
              service_interest,
              service_types ( name ),
              contacts ( full_name, referral_name )
            )
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      // Mostrar apenas comissões cujo serviço (oportunidade) já teve ao menos um pagamento confirmado,
      // ou cujo contrato (quando não houver oportunidade vinculada) teve algum pagamento confirmado.
      const filtered = (data || []).filter((c: any) => {
        const payments = c.contracts?.payments || [];
        if (c.opportunity_id) {
          return payments.some((p: any) => p.status === 'CONFIRMADO' && p.opportunity_id === c.opportunity_id);
        }
        return payments.some((p: any) => p.status === 'CONFIRMADO');
      });


      // Fetch approver names separately
      const approverIds = [...new Set(filtered.filter((c: any) => c.approved_by_user_id).map((c: any) => c.approved_by_user_id) || [])];
      let approverMap: Record<string, string> = {};
      if (approverIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', approverIds);
        if (profiles) {
          approverMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]));
        }
      }

      return filtered.map((c: any) => ({
        ...c,
        approved_by_profile: c.approved_by_user_id ? { full_name: approverMap[c.approved_by_user_id] || '' } : null,
      })) as CommissionWithContract[];
    },
  });

  const createCommission = useMutation({
    mutationFn: async (commission: CommissionInsert) => {
      const { data, error } = await supabase
        .from('commissions')
        .insert({
          ...commission,
          status: 'PENDENTE_APROVACAO',
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão registrada - aguardando aprovação' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const approveCommission = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'APROVADA',
          approved_by_user_id: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão aprovada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao aprovar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const rejectCommission = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'REJEITADA',
          approved_by_user_id: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão rejeitada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao rejeitar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const updateCommission = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Commission> & { id: string }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão atualizada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar comissão', description: error.message, variant: 'destructive' });
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async ({ id, paymentMethod }: { id: string; paymentMethod: string }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'PAGA',
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      toast({ title: 'Comissão marcada como paga' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao marcar comissão como paga', description: error.message, variant: 'destructive' });
    },
  });

  // Estatísticas
  const pendingApproval = commissionsQuery.data?.filter(c => c.status === 'PENDENTE_APROVACAO') ?? [];
  const approved = commissionsQuery.data?.filter(c => c.status === 'APROVADA') ?? [];

  const pendingToPay = commissionsQuery.data?.filter(
    c => c.collaborator_type === 'CAPTADOR' && c.status === 'APROVADA'
  ) ?? [];

  const pendingToReceive = commissionsQuery.data?.filter(
    c => c.collaborator_type === 'FORNECEDOR' && c.status === 'APROVADA'
  ) ?? [];

  const totalPendingToPay = pendingToPay.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
  const totalPendingToReceive = pendingToReceive.reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  return {
    commissions: commissionsQuery.data ?? [],
    isLoading: commissionsQuery.isLoading,
    error: commissionsQuery.error,
    createCommission,
    updateCommission,
    approveCommission,
    rejectCommission,
    markAsPaid,
    pendingApproval,
    approved,
    pendingToPay,
    pendingToReceive,
    totalPendingToPay,
    totalPendingToReceive,
  };
}
