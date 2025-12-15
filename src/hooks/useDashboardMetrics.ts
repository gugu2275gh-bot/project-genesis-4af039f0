import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, subMonths, format, startOfDay, subDays } from 'date-fns';

export interface DashboardMetrics {
  leads: {
    new: number;
    confirmed: number;
    total: number;
    conversionRate: string;
    byChannel: Record<string, number>;
    trend: number;
  };
  opportunities: {
    open: number;
    won: number;
    lost: number;
    revenue: number;
    revenueTrend: number;
  };
  contracts: {
    pending: number;
    signed: number;
    total: number;
  };
  payments: {
    pending: number;
    confirmed: number;
    pendingTotal: number;
    confirmedTotal: number;
  };
  cases: {
    active: number;
    closed: number;
    bySector: Record<string, number>;
    byStatus: Record<string, number>;
  };
  tasks: {
    pending: number;
    overdue: number;
    completedToday: number;
  };
  timeline: {
    leads: { date: string; count: number }[];
    payments: { date: string; amount: number }[];
  };
  recentActivity: {
    id: string;
    type: 'lead' | 'contract' | 'payment' | 'case';
    title: string;
    description: string;
    timestamp: string;
  }[];
  pendingTasks: {
    id: string;
    title: string;
    dueDate: string | null;
    isOverdue: boolean;
  }[];
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async (): Promise<DashboardMetrics> => {
      const today = new Date();
      const thirtyDaysAgo = subDays(today, 30);
      const sixtyDaysAgo = subDays(today, 60);
      const startOfCurrentMonth = startOfMonth(today);
      const startOfLastMonth = startOfMonth(subMonths(today, 1));

      // Leads metrics with channel breakdown
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, created_at, contacts!inner(origin_channel)');

      const allLeads = leads || [];
      const newLeads = allLeads.filter(l => 
        new Date(l.created_at!) >= thirtyDaysAgo
      );
      const previousPeriodLeads = allLeads.filter(l => 
        new Date(l.created_at!) >= sixtyDaysAgo && 
        new Date(l.created_at!) < thirtyDaysAgo
      );

      const confirmedLeads = allLeads.filter(l => 
        l.status === 'INTERESSE_CONFIRMADO'
      ).length;

      const leadsByChannel = allLeads.reduce((acc, l) => {
        const channel = (l.contacts as any)?.origin_channel || 'OUTRO';
        acc[channel] = (acc[channel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const leadsTrend = previousPeriodLeads.length > 0 
        ? ((newLeads.length - previousPeriodLeads.length) / previousPeriodLeads.length * 100)
        : 0;

      // Opportunities metrics
      const { data: opportunities } = await supabase
        .from('opportunities')
        .select('id, status, total_amount, created_at');

      const allOpps = opportunities || [];
      const openOpportunities = allOpps.filter(o => 
        !['FECHADA_GANHA', 'FECHADA_PERDIDA'].includes(o.status || '')
      ).length;

      const wonOpportunities = allOpps.filter(o => 
        o.status === 'FECHADA_GANHA' &&
        new Date(o.created_at!) >= thirtyDaysAgo
      );
      const lostOpportunities = allOpps.filter(o => 
        o.status === 'FECHADA_PERDIDA' &&
        new Date(o.created_at!) >= thirtyDaysAgo
      ).length;

      const currentRevenue = wonOpportunities.reduce((acc, o) => acc + (o.total_amount ?? 0), 0);
      
      const previousWonOpps = allOpps.filter(o => 
        o.status === 'FECHADA_GANHA' &&
        new Date(o.created_at!) >= sixtyDaysAgo &&
        new Date(o.created_at!) < thirtyDaysAgo
      );
      const previousRevenue = previousWonOpps.reduce((acc, o) => acc + (o.total_amount ?? 0), 0);
      const revenueTrend = previousRevenue > 0 
        ? ((currentRevenue - previousRevenue) / previousRevenue * 100)
        : 0;

      // Contracts metrics
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, status, created_at');

      const allContracts = contracts || [];
      const pendingContracts = allContracts.filter(c => 
        ['EM_ELABORACAO', 'EM_REVISAO', 'ENVIADO'].includes(c.status || '')
      ).length;
      const signedContracts = allContracts.filter(c => 
        c.status === 'ASSINADO' &&
        new Date(c.created_at!) >= thirtyDaysAgo
      ).length;

      // Payments metrics
      const { data: payments } = await supabase
        .from('payments')
        .select('id, status, amount, paid_at, created_at');

      const allPayments = payments || [];
      const pendingPayments = allPayments.filter(p => 
        ['PENDENTE', 'EM_ANALISE'].includes(p.status || '')
      );
      const confirmedPayments = allPayments.filter(p => 
        p.status === 'CONFIRMADO' &&
        p.paid_at &&
        new Date(p.paid_at) >= thirtyDaysAgo
      );

      // Service cases metrics
      const { data: cases } = await supabase
        .from('service_cases')
        .select('id, technical_status, sector, created_at');

      const allCases = cases || [];
      const activeCases = allCases.filter(c => 
        !c.technical_status?.startsWith('ENCERRADO')
      ).length;
      const closedCases = allCases.filter(c => 
        c.technical_status?.startsWith('ENCERRADO') &&
        new Date(c.created_at!) >= thirtyDaysAgo
      ).length;

      const casesBySector = allCases.reduce((acc, c) => {
        acc[c.sector] = (acc[c.sector] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const casesByStatus = allCases.reduce((acc, c) => {
        if (c.technical_status) {
          acc[c.technical_status] = (acc[c.technical_status] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      // Tasks metrics
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, updated_at')
        .order('due_date', { ascending: true });

      const allTasks = tasks || [];
      const pendingTasks = allTasks.filter(t => 
        ['PENDENTE', 'EM_ANDAMENTO'].includes(t.status || '')
      );
      const overdueTasks = pendingTasks.filter(t => 
        t.due_date && new Date(t.due_date) < startOfDay(today)
      );
      const completedToday = allTasks.filter(t => 
        t.status === 'CONCLUIDA' &&
        t.updated_at &&
        new Date(t.updated_at) >= startOfDay(today)
      ).length;

      // Timeline data for charts (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(today, 6 - i);
        return format(date, 'yyyy-MM-dd');
      });

      const leadsTimeline = last7Days.map(date => ({
        date: format(new Date(date), 'dd/MM'),
        count: allLeads.filter(l => 
          format(new Date(l.created_at!), 'yyyy-MM-dd') === date
        ).length,
      }));

      const paymentsTimeline = last7Days.map(date => ({
        date: format(new Date(date), 'dd/MM'),
        amount: confirmedPayments
          .filter(p => p.paid_at && format(new Date(p.paid_at), 'yyyy-MM-dd') === date)
          .reduce((sum, p) => sum + (p.amount || 0), 0),
      }));

      // Recent activity (mock - in production, you'd have an activity log table)
      const recentActivity: DashboardMetrics['recentActivity'] = [];

      // Add recent leads
      allLeads
        .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
        .slice(0, 3)
        .forEach(lead => {
          recentActivity.push({
            id: lead.id,
            type: 'lead',
            title: 'Novo lead',
            description: `Lead com interesse confirmado: ${lead.status === 'INTERESSE_CONFIRMADO' ? 'Sim' : 'Não'}`,
            timestamp: lead.created_at!,
          });
        });

      // Pending tasks for display
      const pendingTasksList = pendingTasks.slice(0, 5).map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        isOverdue: t.due_date ? new Date(t.due_date) < startOfDay(today) : false,
      }));

      // Conversion rate
      const totalLeads = allLeads.length;
      const conversionRate = totalLeads > 0 
        ? ((confirmedLeads / totalLeads) * 100).toFixed(1) 
        : '0';

      return {
        leads: {
          new: newLeads.length,
          confirmed: confirmedLeads,
          total: totalLeads,
          conversionRate,
          byChannel: leadsByChannel,
          trend: Math.round(leadsTrend),
        },
        opportunities: {
          open: openOpportunities,
          won: wonOpportunities.length,
          lost: lostOpportunities,
          revenue: currentRevenue,
          revenueTrend: Math.round(revenueTrend),
        },
        contracts: {
          pending: pendingContracts,
          signed: signedContracts,
          total: allContracts.length,
        },
        payments: {
          pending: pendingPayments.length,
          confirmed: confirmedPayments.length,
          pendingTotal: pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
          confirmedTotal: confirmedPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
        },
        cases: {
          active: activeCases,
          closed: closedCases,
          bySector: casesBySector,
          byStatus: casesByStatus,
        },
        tasks: {
          pending: pendingTasks.length,
          overdue: overdueTasks.length,
          completedToday,
        },
        timeline: {
          leads: leadsTimeline,
          payments: paymentsTimeline,
        },
        recentActivity,
        pendingTasks: pendingTasksList,
      };
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
