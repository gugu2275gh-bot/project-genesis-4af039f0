import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ArchivedMessage {
  id: string;
  session_seq: number;
  phone: string | null;
  lead_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  origem: string | null;
  setor: string | null;
  created_at: string;
}

export interface ArchivedField {
  id: string;
  session_seq: number;
  phone: string | null;
  field_key: string;
  field_label: string | null;
  value_text: string | null;
  crm_target: string | null;
  step_code: string | null;
  captured_at: string;
}

export interface ArchivedConversation {
  key: string;
  session_seq: number;
  phone: string;
  contact_name: string | null;
  started_at: string;
  ended_at: string;
  message_count: number;
  messages: ArchivedMessage[];
}

export interface ConversationFilters {
  session?: number | 'all';
  search?: string;
  from?: string;
  to?: string;
}

/** Mensagens arquivadas, já agrupadas por rodada de testes + telefone. */
export function useConversationArchive(filters: ConversationFilters) {
  return useQuery({
    queryKey: ['conversation-archive', filters],
    queryFn: async (): Promise<ArchivedConversation[]> => {
      let query = (supabase as any)
        .from('whatsapp_conversation_archive')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(5000);

      if (filters.session && filters.session !== 'all') query = query.eq('session_seq', filters.session);
      if (filters.from) query = query.gte('created_at', new Date(filters.from).toISOString());
      if (filters.to) {
        const end = new Date(filters.to);
        end.setHours(23, 59, 59, 999);
        query = query.lte('created_at', end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as ArchivedMessage[];
      const term = (filters.search || '').trim().toLowerCase();

      const map = new Map<string, ArchivedConversation>();
      for (const row of rows) {
        const phone = row.phone || 'sem-telefone';
        const key = `${row.session_seq}::${phone}`;
        const existing = map.get(key);
        if (existing) {
          existing.messages.push(row);
          existing.message_count += 1;
          existing.ended_at = row.created_at;
          if (!existing.contact_name && row.contact_name) existing.contact_name = row.contact_name;
        } else {
          map.set(key, {
            key,
            session_seq: row.session_seq,
            phone,
            contact_name: row.contact_name,
            started_at: row.created_at,
            ended_at: row.created_at,
            message_count: 1,
            messages: [row],
          });
        }
      }

      let list = Array.from(map.values());
      if (term) {
        list = list.filter(
          (c) =>
            c.phone.toLowerCase().includes(term) ||
            (c.contact_name || '').toLowerCase().includes(term) ||
            c.messages.some((m) => (m.body || '').toLowerCase().includes(term)),
        );
      }

      return list.sort((a, b) => (a.ended_at < b.ended_at ? 1 : -1));
    },
  });
}

/** Campos identificados pelo agente em uma conversa (rodada + telefone). */
export function useConversationFields(sessionSeq?: number, phone?: string) {
  return useQuery({
    queryKey: ['conversation-fields', sessionSeq, phone],
    enabled: !!phone && sessionSeq !== undefined,
    queryFn: async (): Promise<ArchivedField[]> => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_conversation_fields')
        .select('*')
        .eq('session_seq', sessionSeq)
        .eq('phone', phone)
        .order('captured_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ArchivedField[];
    },
  });
}

/** Rodadas de testes existentes no arquivo. */
export function useConversationSessions() {
  return useQuery({
    queryKey: ['conversation-archive-sessions'],
    queryFn: async (): Promise<number[]> => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_conversation_archive')
        .select('session_seq')
        .order('session_seq', { ascending: false })
        .limit(5000);
      if (error) throw error;
      const set = new Set<number>((data || []).map((r: any) => Number(r.session_seq)));
      return Array.from(set).sort((a, b) => b - a);
    },
  });
}
