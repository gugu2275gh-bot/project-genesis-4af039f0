import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  user_id: string | null;
  created_at: string;
  user_full_name?: string | null;
}

interface UseAuditLogsParams {
  /** Filter by a specific record (table_name + record_id). */
  tableName?: string;
  recordId?: string;
  /** Filter by multiple record_ids in the same table (e.g. all contracts of a contact). */
  recordIds?: string[];
  enabled?: boolean;
  limit?: number;
}

export function useAuditLogs({
  tableName,
  recordId,
  recordIds,
  enabled = true,
  limit = 200,
}: UseAuditLogsParams) {
  return useQuery({
    queryKey: ['audit_logs', tableName, recordId, recordIds],
    enabled: enabled && Boolean(tableName) && (Boolean(recordId) || (recordIds && recordIds.length > 0)),
    queryFn: async (): Promise<AuditLogEntry[]> => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', tableName!)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (recordId) {
        query = query.eq('record_id', recordId);
      } else if (recordIds && recordIds.length > 0) {
        query = query.in('record_id', recordIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map(d => d.user_id).filter(Boolean))) as string[];
      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        profileMap = new Map((profiles || []).map(p => [p.id, p.full_name || '']));
      }

      return (data || []).map(d => ({
        ...d,
        user_full_name: d.user_id ? profileMap.get(d.user_id) ?? null : null,
      })) as AuditLogEntry[];
    },
  });
}
