import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, subDays } from 'date-fns';

export interface ReportFilters {
  dateRange: { start: Date; end: Date };
  serviceType?: string;
  status?: string;
  sector?: string;
  assignedTo?: string;
}

export function useReportsData(filters: ReportFilters) {
  const { dateRange, serviceType, status, sector, assignedTo } = filters;

  // Calculate previous period dates (same duration, shifted back)
  const periodDuration = differenceInDays(dateRange.end, dateRange.start) + 1;
  const previousPeriod = {
    start: subDays(dateRange.start, periodDuration),
    end: subDays(dateRange.start, 1),
  };

  // Leads report
  const leadsQuery = useQuery({
    queryKey: ['reports-leads', dateRange, serviceType, status],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          contacts (full_name, email, phone, origin_channel)
        `)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (serviceType && serviceType !== 'all') {
        query = query.eq('service_interest', serviceType as 'VISTO_ESTUDANTE' | 'VISTO_TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO_RESIDENCIA' | 'NACIONALIDADE_RESIDENCIA' | 'NACIONALIDADE_CASAMENTO' | 'OUTRO');
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as 'NOVO' | 'DADOS_INCOMPLETOS' | 'INTERESSE_PENDENTE' | 'INTERESSE_CONFIRMADO' | 'ARQUIVADO_SEM_RETORNO');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Leads previous period
  const leadsPrevQuery = useQuery({
    queryKey: ['reports-leads-prev', previousPeriod, serviceType, status],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, status')
        .gte('created_at', previousPeriod.start.toISOString())
        .lte('created_at', previousPeriod.end.toISOString());

      if (serviceType && serviceType !== 'all') {
        query = query.eq('service_interest', serviceType as 'VISTO_ESTUDANTE' | 'VISTO_TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO_RESIDENCIA' | 'NACIONALIDADE_RESIDENCIA' | 'NACIONALIDADE_CASAMENTO' | 'OUTRO');
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as 'NOVO' | 'DADOS_INCOMPLETOS' | 'INTERESSE_PENDENTE' | 'INTERESSE_CONFIRMADO' | 'ARQUIVADO_SEM_RETORNO');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Opportunities report
  const opportunitiesQuery = useQuery({
    queryKey: ['reports-opportunities', dateRange, status],
    queryFn: async () => {
      let query = supabase
        .from('opportunities')
        .select(`
          *,
          leads!inner (
            service_interest,
            contacts (full_name, email)
          )
        `)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status as 'ABERTA' | 'CONTRATO_EM_ELABORACAO' | 'CONTRATO_ENVIADO' | 'CONTRATO_ASSINADO' | 'PAGAMENTO_PENDENTE' | 'FECHADA_GANHA' | 'FECHADA_PERDIDA' | 'CONGELADA');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Opportunities previous period
  const opportunitiesPrevQuery = useQuery({
    queryKey: ['reports-opportunities-prev', previousPeriod, status],
    queryFn: async () => {
      let query = supabase
        .from('opportunities')
        .select('id, status, total_amount')
        .gte('created_at', previousPeriod.start.toISOString())
        .lte('created_at', previousPeriod.end.toISOString());

      if (status && status !== 'all') {
        query = query.eq('status', status as 'ABERTA' | 'CONTRATO_EM_ELABORACAO' | 'CONTRATO_ENVIADO' | 'CONTRATO_ASSINADO' | 'PAGAMENTO_PENDENTE' | 'FECHADA_GANHA' | 'FECHADA_PERDIDA' | 'CONGELADA');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Contracts report
  const contractsQuery = useQuery({
    queryKey: ['reports-contracts', dateRange, status],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status as 'EM_ELABORACAO' | 'EM_REVISAO' | 'ENVIADO' | 'ASSINADO' | 'CANCELADO');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Payments report
  const paymentsQuery = useQuery({
    queryKey: ['reports-payments', dateRange, status],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*')
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status as 'PENDENTE' | 'EM_ANALISE' | 'CONFIRMADO' | 'PARCIAL' | 'ESTORNADO');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Payments previous period
  const paymentsPrevQuery = useQuery({
    queryKey: ['reports-payments-prev', previousPeriod, status],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('id, status, amount')
        .gte('created_at', previousPeriod.start.toISOString())
        .lte('created_at', previousPeriod.end.toISOString());

      if (status && status !== 'all') {
        query = query.eq('status', status as 'PENDENTE' | 'EM_ANALISE' | 'CONFIRMADO' | 'PARCIAL' | 'ESTORNADO');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Cases report
  const casesQuery = useQuery({
    queryKey: ['reports-cases', dateRange, sector, status, assignedTo],
    queryFn: async () => {
      let query = supabase
        .from('service_cases')
        .select(`
          *,
          assigned_to:profiles!service_cases_assigned_to_user_id_fkey (full_name)
        `)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (sector && sector !== 'all') {
        query = query.eq('sector', sector as 'ESTUDANTE' | 'TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO' | 'NACIONALIDADE');
      }
      if (status && status !== 'all') {
        query = query.eq('technical_status', status as 'CONTATO_INICIAL' | 'AGUARDANDO_DOCUMENTOS' | 'DOCUMENTOS_EM_CONFERENCIA' | 'PRONTO_PARA_SUBMISSAO' | 'SUBMETIDO' | 'EM_ACOMPANHAMENTO' | 'EXIGENCIA_ORGAO' | 'AGUARDANDO_RECURSO' | 'ENCERRADO_APROVADO' | 'ENCERRADO_NEGADO');
      }
      if (assignedTo && assignedTo !== 'all') {
        query = query.eq('assigned_to_user_id', assignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Cases previous period
  const casesPrevQuery = useQuery({
    queryKey: ['reports-cases-prev', previousPeriod, sector, status, assignedTo],
    queryFn: async () => {
      let query = supabase
        .from('service_cases')
        .select('id, technical_status')
        .gte('created_at', previousPeriod.start.toISOString())
        .lte('created_at', previousPeriod.end.toISOString());

      if (sector && sector !== 'all') {
        query = query.eq('sector', sector as 'ESTUDANTE' | 'TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO' | 'NACIONALIDADE');
      }
      if (status && status !== 'all') {
        query = query.eq('technical_status', status as 'CONTATO_INICIAL' | 'AGUARDANDO_DOCUMENTOS' | 'DOCUMENTOS_EM_CONFERENCIA' | 'PRONTO_PARA_SUBMISSAO' | 'SUBMETIDO' | 'EM_ACOMPANHAMENTO' | 'EXIGENCIA_ORGAO' | 'AGUARDANDO_RECURSO' | 'ENCERRADO_APROVADO' | 'ENCERRADO_NEGADO');
      }
      if (assignedTo && assignedTo !== 'all') {
        query = query.eq('assigned_to_user_id', assignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Tasks report
  const tasksQuery = useQuery({
    queryKey: ['reports-tasks', dateRange, status, assignedTo],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          assigned_to:profiles!tasks_assigned_to_user_id_fkey (full_name),
          created_by:profiles!tasks_created_by_user_id_fkey (full_name)
        `)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString())
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status as 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA');
      }
      if (assignedTo && assignedTo !== 'all') {
        query = query.eq('assigned_to_user_id', assignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Staff list for filters
  const staffQuery = useQuery({
    queryKey: ['reports-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data;
    },
  });

  // Calculate previous period metrics
  const previousMetrics = {
    leads: {
      total: leadsPrevQuery.data?.length || 0,
      confirmed: leadsPrevQuery.data?.filter((l) => l.status === 'INTERESSE_CONFIRMADO').length || 0,
    },
    opportunities: {
      revenue: opportunitiesPrevQuery.data?.filter((o) => o.status === 'FECHADA_GANHA').reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) || 0,
    },
    cases: {
      active: casesPrevQuery.data?.filter((c) => !c.technical_status?.startsWith('ENCERRADO')).length || 0,
    },
    payments: {
      confirmedTotal: paymentsPrevQuery.data?.filter((p) => p.status === 'CONFIRMADO').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0,
    },
  };

  return {
    leads: leadsQuery.data || [],
    opportunities: opportunitiesQuery.data || [],
    contracts: contractsQuery.data || [],
    payments: paymentsQuery.data || [],
    cases: casesQuery.data || [],
    tasks: tasksQuery.data || [],
    staff: staffQuery.data || [],
    previousMetrics,
    previousPeriod,
    isLoading:
      leadsQuery.isLoading ||
      opportunitiesQuery.isLoading ||
      contractsQuery.isLoading ||
      paymentsQuery.isLoading ||
      casesQuery.isLoading ||
      tasksQuery.isLoading,
  };
}
