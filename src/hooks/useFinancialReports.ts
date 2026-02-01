import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { startOfMonth, endOfMonth, addMonths, format, differenceInDays } from 'date-fns';

export interface ContractWithBalance {
  id: string;
  contract_number: string | null;
  service_type: string;
  total_fee: number | null;
  payment_status: string | null;
  status: string | null;
  signed_at: string | null;
  is_suspended: boolean | null;
  client_name: string;
  client_phone: number | null;
  paid_amount: number;
  balance: number;
  overdue_count: number;
  next_due_date: string | null;
  opportunity_id: string;
  contact_id: string | null;
}

export interface ContractNotStarted {
  id: string;
  contract_number: string | null;
  service_type: string;
  total_fee: number | null;
  signed_at: string | null;
  first_due_date: string | null;
  days_without_payment: number;
  client_name: string;
  client_phone: number | null;
  opportunity_id: string;
  contact_id: string | null;
}

export interface FuturePayment {
  id: string;
  amount: number;
  due_date: string;
  installment_number: number | null;
  contract_id: string | null;
  contract_number: string | null;
  client_name: string;
  service_type: string | null;
}

export interface MonthlyForecast {
  month: string;
  monthLabel: string;
  total: number;
  count: number;
  payments: FuturePayment[];
}

export function useFinancialReports() {
  // Query 1: Contratos com Saldo Pendente (ASSINADO + INICIADO + saldo > 0)
  const contractsWithBalanceQuery = useQuery({
    queryKey: ['financial-reports', 'contracts-with-balance'],
    queryFn: async () => {
      const { data: contracts, error } = await supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          service_type,
          total_fee,
          payment_status,
          status,
          signed_at,
          is_suspended,
          opportunity_id,
          opportunities (
            leads (
              contacts (
                id,
                full_name,
                phone
              )
            )
          ),
          payments (
            id,
            amount,
            status,
            due_date
          )
        `)
        .eq('status', 'ASSINADO')
        .eq('payment_status', 'INICIADO');

      if (error) throw error;

      const today = new Date();
      
      return (contracts || []).map((contract: any) => {
        const contact = contract.opportunities?.leads?.contacts;
        const payments = contract.payments || [];
        
        const paidAmount = payments
          .filter((p: any) => p.status === 'CONFIRMADO')
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        
        const balance = (contract.total_fee || 0) - paidAmount;
        
        const overduePayments = payments.filter((p: any) => 
          p.status === 'PENDENTE' && p.due_date && new Date(p.due_date) < today
        );
        
        const nextPendingPayment = payments
          .filter((p: any) => p.status === 'PENDENTE')
          .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

        return {
          id: contract.id,
          contract_number: contract.contract_number,
          service_type: contract.service_type,
          total_fee: contract.total_fee,
          payment_status: contract.payment_status,
          status: contract.status,
          signed_at: contract.signed_at,
          is_suspended: contract.is_suspended,
          client_name: contact?.full_name || 'N/A',
          client_phone: contact?.phone,
          paid_amount: paidAmount,
          balance,
          overdue_count: overduePayments.length,
          next_due_date: nextPendingPayment?.due_date || null,
          opportunity_id: contract.opportunity_id,
          contact_id: contact?.id || null,
        } as ContractWithBalance;
      }).filter((c: ContractWithBalance) => c.balance > 0);
    },
  });

  // Query 2: Contratos Não Iniciados (ASSINADO + NAO_INICIADO)
  const contractsNotStartedQuery = useQuery({
    queryKey: ['financial-reports', 'contracts-not-started'],
    queryFn: async () => {
      const { data: contracts, error } = await supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          service_type,
          total_fee,
          signed_at,
          first_due_date,
          opportunity_id,
          opportunities (
            leads (
              contacts (
                id,
                full_name,
                phone
              )
            )
          )
        `)
        .eq('status', 'ASSINADO')
        .eq('payment_status', 'NAO_INICIADO')
        .order('signed_at', { ascending: true });

      if (error) throw error;

      const today = new Date();
      
      return (contracts || []).map((contract: any) => {
        const contact = contract.opportunities?.leads?.contacts;
        const signedAt = contract.signed_at ? new Date(contract.signed_at) : today;
        const daysWithoutPayment = differenceInDays(today, signedAt);

        return {
          id: contract.id,
          contract_number: contract.contract_number,
          service_type: contract.service_type,
          total_fee: contract.total_fee,
          signed_at: contract.signed_at,
          first_due_date: contract.first_due_date,
          days_without_payment: daysWithoutPayment,
          client_name: contact?.full_name || 'N/A',
          client_phone: contact?.phone,
          opportunity_id: contract.opportunity_id,
          contact_id: contact?.id || null,
        } as ContractNotStarted;
      });
    },
  });

  // Query 3: Previsão de Entradas (Pagamentos PENDENTE com due_date futuro)
  const futurePaymentsQuery = useQuery({
    queryKey: ['financial-reports', 'future-payments'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const sixMonthsLater = format(addMonths(new Date(), 6), 'yyyy-MM-dd');

      const { data: payments, error } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          due_date,
          installment_number,
          contract_id,
          contracts (
            contract_number,
            service_type,
            opportunities (
              leads (
                contacts (
                  full_name
                )
              )
            )
          )
        `)
        .eq('status', 'PENDENTE')
        .gte('due_date', today)
        .lte('due_date', sixMonthsLater)
        .order('due_date', { ascending: true });

      if (error) throw error;

      return (payments || []).map((payment: any) => ({
        id: payment.id,
        amount: payment.amount,
        due_date: payment.due_date,
        installment_number: payment.installment_number,
        contract_id: payment.contract_id,
        contract_number: payment.contracts?.contract_number || null,
        client_name: payment.contracts?.opportunities?.leads?.contacts?.full_name || 'N/A',
        service_type: payment.contracts?.service_type || null,
      } as FuturePayment));
    },
  });

  // Computed: Agrupar pagamentos futuros por mês
  const monthlyForecast = useMemo((): MonthlyForecast[] => {
    if (!futurePaymentsQuery.data) return [];

    const grouped = new Map<string, { total: number; count: number; payments: FuturePayment[] }>();

    futurePaymentsQuery.data.forEach((payment) => {
      const monthKey = format(new Date(payment.due_date), 'yyyy-MM');
      const existing = grouped.get(monthKey) || { total: 0, count: 0, payments: [] };
      grouped.set(monthKey, {
        total: existing.total + payment.amount,
        count: existing.count + 1,
        payments: [...existing.payments, payment],
      });
    });

    return Array.from(grouped.entries())
      .map(([month, data]) => ({
        month,
        monthLabel: format(new Date(month + '-01'), 'MMMM yyyy'),
        ...data,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [futurePaymentsQuery.data]);

  // Métricas calculadas
  const metrics = useMemo(() => {
    const contractsWithBalance = contractsWithBalanceQuery.data || [];
    const contractsNotStarted = contractsNotStartedQuery.data || [];
    const futurePayments = futurePaymentsQuery.data || [];

    const totalPendingToCollect = contractsWithBalance.reduce((sum, c) => sum + c.balance, 0);
    const contractsOverdue = contractsWithBalance.filter(c => c.overdue_count > 0);
    const totalOverdue = contractsOverdue.length;

    const today = new Date();
    const next30Days = addMonths(today, 1);
    const next90Days = addMonths(today, 3);

    const forecastNext30 = futurePayments
      .filter(p => new Date(p.due_date) <= next30Days)
      .reduce((sum, p) => sum + p.amount, 0);

    const forecastNext90 = futurePayments
      .filter(p => new Date(p.due_date) <= next90Days)
      .reduce((sum, p) => sum + p.amount, 0);

    const totalFutureRevenue = futurePayments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalPendingToCollect,
      totalOverdue,
      contractsNotStartedCount: contractsNotStarted.length,
      forecastNext30,
      forecastNext90,
      totalFutureRevenue,
    };
  }, [contractsWithBalanceQuery.data, contractsNotStartedQuery.data, futurePaymentsQuery.data]);

  return {
    // Data
    contractsWithBalance: contractsWithBalanceQuery.data || [],
    contractsNotStarted: contractsNotStartedQuery.data || [],
    futurePayments: futurePaymentsQuery.data || [],
    monthlyForecast,
    
    // Loading states
    isLoading: contractsWithBalanceQuery.isLoading || 
               contractsNotStartedQuery.isLoading || 
               futurePaymentsQuery.isLoading,
    
    // Metrics
    metrics,
    
    // Refetch
    refetch: () => {
      contractsWithBalanceQuery.refetch();
      contractsNotStartedQuery.refetch();
      futurePaymentsQuery.refetch();
    },
  };
}
