import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReactivationLog {
  id: string;
  contact_id: string;
  incoming_message_text: string | null;
  session_expired: boolean;
  open_pending_count: number;
  llm_input_snapshot: Record<string, unknown> | null;
  llm_output_snapshot: Record<string, unknown> | null;
  selected_sector: string | null;
  selected_pending_id: string | null;
  confidence_score: number | null;
  action_taken: string | null;
  user_confirmation_status: string;
  confirmation_attempt_count: number;
  ranked_candidates_json: unknown[] | null;
  created_at: string;
}

export function useReactivationLog(contactId?: string) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['reactivation-log', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('reactivation_resolutions' as any)
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ReactivationLog[];
    },
    enabled: !!contactId,
  });

  return { logs, isLoading };
}
