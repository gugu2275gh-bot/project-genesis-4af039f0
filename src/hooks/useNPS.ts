import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type NPSSurvey = Tables<'nps_surveys'>;
export type NPSSurveyInsert = TablesInsert<'nps_surveys'>;

export type NPSSurveyWithCase = NPSSurvey & {
  service_cases: Tables<'service_cases'> & {
    opportunities: Tables<'opportunities'> & {
      leads: Tables<'leads'> & {
        contacts: Tables<'contacts'> | null;
      };
    };
  };
};

export function useNPS() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const surveysQuery = useQuery({
    queryKey: ['nps-surveys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select(`
          *,
          service_cases (
            *,
            opportunities (
              *,
              leads (
                *,
                contacts (*)
              )
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as NPSSurveyWithCase[];
    },
  });

  const submitSurvey = useMutation({
    mutationFn: async (data: NPSSurveyInsert) => {
      const { data: result, error } = await supabase
        .from('nps_surveys')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      toast({ title: 'Obrigado pela sua avaliação!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar avaliação', description: error.message, variant: 'destructive' });
    },
  });

  // Calculate NPS metrics
  const calculateMetrics = (surveys: NPSSurvey[]) => {
    if (surveys.length === 0) {
      return {
        averageScore: 0,
        npsScore: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        total: 0,
        promotersPercent: 0,
        passivesPercent: 0,
        detractorsPercent: 0,
      };
    }

    const validSurveys = surveys.filter(s => s.score !== null);
    const total = validSurveys.length;
    
    const promoters = validSurveys.filter(s => (s.score || 0) >= 9).length;
    const passives = validSurveys.filter(s => (s.score || 0) >= 7 && (s.score || 0) <= 8).length;
    const detractors = validSurveys.filter(s => (s.score || 0) <= 6).length;

    const averageScore = validSurveys.reduce((sum, s) => sum + (s.score || 0), 0) / total;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);

    return {
      averageScore: Math.round(averageScore * 10) / 10,
      npsScore,
      promoters,
      passives,
      detractors,
      total,
      promotersPercent: Math.round((promoters / total) * 100),
      passivesPercent: Math.round((passives / total) * 100),
      detractorsPercent: Math.round((detractors / total) * 100),
    };
  };

  return {
    surveys: surveysQuery.data ?? [],
    isLoading: surveysQuery.isLoading,
    error: surveysQuery.error,
    submitSurvey,
    calculateMetrics,
  };
}

export function useNPSCase(caseId: string | undefined) {
  return useQuery({
    queryKey: ['nps-case', caseId],
    queryFn: async () => {
      if (!caseId) return null;

      // First check if survey already exists
      const { data: existingSurvey } = await supabase
        .from('nps_surveys')
        .select('*')
        .eq('service_case_id', caseId)
        .maybeSingle();

      // Get case details
      const { data: caseData, error } = await supabase
        .from('service_cases')
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
        .eq('id', caseId)
        .maybeSingle();

      if (error) throw error;

      return {
        case: caseData,
        existingSurvey,
      };
    },
    enabled: !!caseId,
  });
}
