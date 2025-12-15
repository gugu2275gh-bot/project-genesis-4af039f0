import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, format, startOfDay, eachDayOfInterval, subMonths, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';

interface SLAPerformanceMetric {
  date: string;
  label: string;
  totalChecked: number;
  withinSLA: number;
  breached: number;
  complianceRate: number;
}

interface SLABreakdown {
  type: string;
  label: string;
  total: number;
  withinSLA: number;
  breached: number;
  complianceRate: number;
  avgResponseTime: number;
}

interface SLAPerformanceData {
  daily: SLAPerformanceMetric[];
  monthly: SLAPerformanceMetric[];
  breakdown: SLABreakdown[];
  overall: {
    totalChecked: number;
    withinSLA: number;
    breached: number;
    complianceRate: number;
  };
  trends: {
    currentMonth: number;
    previousMonth: number;
    change: number;
    isImproving: boolean;
  };
}

export function useSLAPerformance(period: 'week' | 'month' | '3months' = 'month') {
  return useQuery({
    queryKey: ['sla-performance', period],
    queryFn: async (): Promise<SLAPerformanceData> => {
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'week':
          startDate = subDays(now, 7);
          break;
        case '3months':
          startDate = subMonths(now, 3);
          break;
        default:
          startDate = subMonths(now, 1);
      }

      // Fetch SLA configs
      const { data: slaConfigs } = await supabase
        .from('system_config')
        .select('key, value')
        .like('key', 'sla_%');

      const slaMap: Record<string, number> = {
        sla_first_response_hours: 2,
        sla_incomplete_data_reengagement_days: 1,
        sla_contract_signature_reminder_1_days: 2,
        sla_payment_reminder_1_days: 1,
        sla_document_review_hours: 24,
      };

      slaConfigs?.forEach((config) => {
        if (config.value) slaMap[config.key] = parseInt(config.value);
      });

      // Fetch completed tasks (SLA-related)
      const { data: completedTasks } = await supabase
        .from('tasks')
        .select('id, title, created_at, updated_at, status, due_date')
        .gte('created_at', startDate.toISOString())
        .in('status', ['CONCLUIDA', 'CANCELADA']);

      // Fetch leads for first response analysis
      const { data: leads } = await supabase
        .from('leads')
        .select('id, created_at, updated_at, status')
        .gte('created_at', startDate.toISOString());

      // Fetch contracts for signature time analysis
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, created_at, signed_at, status')
        .gte('created_at', startDate.toISOString());

      // Fetch payments for payment time analysis
      const { data: payments } = await supabase
        .from('payments')
        .select('id, created_at, paid_at, status')
        .gte('created_at', startDate.toISOString());

      // Fetch documents for review time analysis
      const { data: documents } = await supabase
        .from('service_documents')
        .select('id, uploaded_at, updated_at, status')
        .gte('uploaded_at', startDate.toISOString())
        .in('status', ['APROVADO', 'REJEITADO', 'ENVIADO', 'EM_CONFERENCIA']);

      // Calculate SLA compliance for each category
      const breakdown: SLABreakdown[] = [];

      // 1. Lead First Response SLA
      const firstResponseHoursLimit = slaMap.sla_first_response_hours;
      const leadsResponded = leads?.filter(l => l.status !== 'NOVO') || [];
      const leadsWithinSLA = leadsResponded.filter(l => {
        if (!l.updated_at) return true;
        const responseTime = (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / (60 * 60 * 1000);
        return responseTime <= firstResponseHoursLimit;
      });
      
      const avgLeadResponseTime = leadsResponded.length > 0
        ? leadsResponded.reduce((sum, l) => {
            if (!l.updated_at) return sum;
            return sum + (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / (60 * 60 * 1000);
          }, 0) / leadsResponded.length
        : 0;

      breakdown.push({
        type: 'first_response',
        label: 'Primeira Resposta',
        total: leadsResponded.length,
        withinSLA: leadsWithinSLA.length,
        breached: leadsResponded.length - leadsWithinSLA.length,
        complianceRate: leadsResponded.length > 0 ? Math.round((leadsWithinSLA.length / leadsResponded.length) * 100) : 100,
        avgResponseTime: Math.round(avgLeadResponseTime * 10) / 10,
      });

      // 2. Contract Signature SLA
      const signatureDaysLimit = slaMap.sla_contract_signature_reminder_1_days;
      const signedContracts = contracts?.filter(c => c.status === 'ASSINADO' && c.signed_at) || [];
      const contractsWithinSLA = signedContracts.filter(c => {
        const signatureTime = (new Date(c.signed_at!).getTime() - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000);
        return signatureTime <= signatureDaysLimit * 2; // Give 2x the reminder time
      });
      
      const avgContractTime = signedContracts.length > 0
        ? signedContracts.reduce((sum, c) => {
            return sum + (new Date(c.signed_at!).getTime() - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000);
          }, 0) / signedContracts.length
        : 0;

      breakdown.push({
        type: 'contract_signature',
        label: 'Assinatura de Contrato',
        total: signedContracts.length,
        withinSLA: contractsWithinSLA.length,
        breached: signedContracts.length - contractsWithinSLA.length,
        complianceRate: signedContracts.length > 0 ? Math.round((contractsWithinSLA.length / signedContracts.length) * 100) : 100,
        avgResponseTime: Math.round(avgContractTime * 10) / 10,
      });

      // 3. Payment SLA
      const paymentDaysLimit = slaMap.sla_payment_reminder_1_days;
      const confirmedPayments = payments?.filter(p => p.status === 'CONFIRMADO' && p.paid_at) || [];
      const paymentsWithinSLA = confirmedPayments.filter(p => {
        const paymentTime = (new Date(p.paid_at!).getTime() - new Date(p.created_at).getTime()) / (24 * 60 * 60 * 1000);
        return paymentTime <= paymentDaysLimit * 3; // Give 3x the reminder time
      });
      
      const avgPaymentTime = confirmedPayments.length > 0
        ? confirmedPayments.reduce((sum, p) => {
            return sum + (new Date(p.paid_at!).getTime() - new Date(p.created_at).getTime()) / (24 * 60 * 60 * 1000);
          }, 0) / confirmedPayments.length
        : 0;

      breakdown.push({
        type: 'payment',
        label: 'Confirmação de Pagamento',
        total: confirmedPayments.length,
        withinSLA: paymentsWithinSLA.length,
        breached: confirmedPayments.length - paymentsWithinSLA.length,
        complianceRate: confirmedPayments.length > 0 ? Math.round((paymentsWithinSLA.length / confirmedPayments.length) * 100) : 100,
        avgResponseTime: Math.round(avgPaymentTime * 10) / 10,
      });

      // 4. Document Review SLA
      const docReviewHoursLimit = slaMap.sla_document_review_hours;
      const reviewedDocs = documents?.filter(d => d.status === 'APROVADO' || d.status === 'REJEITADO') || [];
      const docsWithinSLA = reviewedDocs.filter(d => {
        if (!d.uploaded_at || !d.updated_at) return true;
        const reviewTime = (new Date(d.updated_at).getTime() - new Date(d.uploaded_at).getTime()) / (60 * 60 * 1000);
        return reviewTime <= docReviewHoursLimit;
      });
      
      const avgDocReviewTime = reviewedDocs.length > 0
        ? reviewedDocs.reduce((sum, d) => {
            if (!d.uploaded_at || !d.updated_at) return sum;
            return sum + (new Date(d.updated_at).getTime() - new Date(d.uploaded_at).getTime()) / (60 * 60 * 1000);
          }, 0) / reviewedDocs.length
        : 0;

      breakdown.push({
        type: 'document_review',
        label: 'Conferência de Documentos',
        total: reviewedDocs.length,
        withinSLA: docsWithinSLA.length,
        breached: reviewedDocs.length - docsWithinSLA.length,
        complianceRate: reviewedDocs.length > 0 ? Math.round((docsWithinSLA.length / reviewedDocs.length) * 100) : 100,
        avgResponseTime: Math.round(avgDocReviewTime * 10) / 10,
      });

      // 5. Tasks SLA (completed on time)
      const tasksCompleted = completedTasks?.filter(t => t.status === 'CONCLUIDA' && t.due_date) || [];
      const tasksOnTime = tasksCompleted.filter(t => {
        return new Date(t.updated_at) <= new Date(t.due_date!);
      });

      breakdown.push({
        type: 'tasks',
        label: 'Tarefas no Prazo',
        total: tasksCompleted.length,
        withinSLA: tasksOnTime.length,
        breached: tasksCompleted.length - tasksOnTime.length,
        complianceRate: tasksCompleted.length > 0 ? Math.round((tasksOnTime.length / tasksCompleted.length) * 100) : 100,
        avgResponseTime: 0,
      });

      // Calculate overall
      const totalChecked = breakdown.reduce((sum, b) => sum + b.total, 0);
      const totalWithinSLA = breakdown.reduce((sum, b) => sum + b.withinSLA, 0);
      const totalBreached = breakdown.reduce((sum, b) => sum + b.breached, 0);

      // Generate daily data
      const days = eachDayOfInterval({ start: startDate, end: now });
      const daily: SLAPerformanceMetric[] = days.slice(-14).map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayLabel = format(day, 'dd/MM');
        
        // Count tasks that were due/completed on this day
        const dayTasks = tasksCompleted.filter(t => 
          t.due_date && format(new Date(t.due_date), 'yyyy-MM-dd') === dayStr
        );
        const dayTasksOnTime = dayTasks.filter(t => 
          new Date(t.updated_at) <= new Date(t.due_date!)
        );

        return {
          date: dayStr,
          label: dayLabel,
          totalChecked: dayTasks.length,
          withinSLA: dayTasksOnTime.length,
          breached: dayTasks.length - dayTasksOnTime.length,
          complianceRate: dayTasks.length > 0 ? Math.round((dayTasksOnTime.length / dayTasks.length) * 100) : 100,
        };
      });

      // Generate monthly data
      const monthStart = startOfMonth(subMonths(now, 5));
      const months = eachMonthOfInterval({ start: monthStart, end: now });
      const monthly: SLAPerformanceMetric[] = months.map(month => {
        const monthStr = format(month, 'yyyy-MM');
        const monthLabel = format(month, 'MMM/yy');
        const monthEnd = endOfMonth(month);
        
        // Count all items for this month
        const monthLeads = leadsResponded.filter(l => {
          const date = new Date(l.created_at);
          return date >= month && date <= monthEnd;
        });
        const monthLeadsWithinSLA = monthLeads.filter(l => {
          if (!l.updated_at) return true;
          const responseTime = (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / (60 * 60 * 1000);
          return responseTime <= firstResponseHoursLimit;
        });

        const monthContracts = signedContracts.filter(c => {
          const date = new Date(c.created_at);
          return date >= month && date <= monthEnd;
        });
        const monthContractsWithinSLA = monthContracts.filter(c => {
          const signatureTime = (new Date(c.signed_at!).getTime() - new Date(c.created_at).getTime()) / (24 * 60 * 60 * 1000);
          return signatureTime <= signatureDaysLimit * 2;
        });

        const total = monthLeads.length + monthContracts.length;
        const withinSLA = monthLeadsWithinSLA.length + monthContractsWithinSLA.length;

        return {
          date: monthStr,
          label: monthLabel,
          totalChecked: total,
          withinSLA,
          breached: total - withinSLA,
          complianceRate: total > 0 ? Math.round((withinSLA / total) * 100) : 100,
        };
      });

      // Calculate trends
      const currentMonthData = monthly[monthly.length - 1];
      const previousMonthData = monthly[monthly.length - 2];
      const currentMonthRate = currentMonthData?.complianceRate || 100;
      const previousMonthRate = previousMonthData?.complianceRate || 100;

      return {
        daily,
        monthly,
        breakdown,
        overall: {
          totalChecked,
          withinSLA: totalWithinSLA,
          breached: totalBreached,
          complianceRate: totalChecked > 0 ? Math.round((totalWithinSLA / totalChecked) * 100) : 100,
        },
        trends: {
          currentMonth: currentMonthRate,
          previousMonth: previousMonthRate,
          change: currentMonthRate - previousMonthRate,
          isImproving: currentMonthRate >= previousMonthRate,
        },
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
