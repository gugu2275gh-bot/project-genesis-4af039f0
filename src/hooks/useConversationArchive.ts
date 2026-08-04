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
}

export interface ConversationFilters {
  session?: number | 'all';
  search?: string;
  from?: string;
  to?: string;
}

const PAGE = 1000;
const MAX_ROWS = 100000;

/** Busca todas as linhas em páginas de 1000 (o Supabase limita cada request). */
async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await build().range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function applyFilters(query: any, filters: ConversationFilters) {
  if (filters.session && filters.session !== 'all') query = query.eq('session_seq', filters.session);
  if (filters.from) query = query.gte('created_at', new Date(filters.from).toISOString());
  if (filters.to) {
    const end = new Date(filters.to);
    end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }
  return query;
}

/**
 * Cabeçalhos de todas as conversas arquivadas (rodada + telefone), sem teto fixo:
 * lê apenas colunas leves e pagina até esgotar o arquivo.
 */
export function useConversationList(filters: ConversationFilters) {
  return useQuery({
    queryKey: ['conversation-archive-list', filters],
    queryFn: async (): Promise<{ conversations: ArchivedConversation[]; totalMessages: number }> => {
      const rows = await fetchAll(() =>
        applyFilters(
          (supabase as any)
            .from('whatsapp_conversation_archive')
            .select('session_seq, phone, contact_name, created_at, body')
            .order('created_at', { ascending: true }),
          filters,
        ),
      );

      const term = (filters.search || '').trim().toLowerCase();
      const map = new Map<string, ArchivedConversation>();
      const matched = new Set<string>();

      for (const row of rows as any[]) {
        const phone = row.phone || 'sem-telefone';
        const key = `${row.session_seq}::${phone}`;
        const existing = map.get(key);
        if (existing) {
          existing.message_count += 1;
          existing.ended_at = row.created_at;
          if (!existing.contact_name && row.contact_name) existing.contact_name = row.contact_name;
        } else {
          map.set(key, {
            key,
            session_seq: Number(row.session_seq),
            phone,
            contact_name: row.contact_name,
            started_at: row.created_at,
            ended_at: row.created_at,
            message_count: 1,
          });
        }
        if (
          term &&
          (phone.toLowerCase().includes(term) ||
            (row.contact_name || '').toLowerCase().includes(term) ||
            (row.body || '').toLowerCase().includes(term))
        ) {
          matched.add(key);
        }
      }

      let list = Array.from(map.values());
      if (term) list = list.filter((c) => matched.has(c.key));

      return {
        conversations: list.sort((a, b) => (a.ended_at < b.ended_at ? 1 : -1)),
        totalMessages: rows.length,
      };
    },
  });
}

/** Transcrição completa de uma conversa (carregada sob demanda). */
export function useConversationMessages(sessionSeq?: number, phone?: string) {
  return useQuery({
    queryKey: ['conversation-archive-messages', sessionSeq, phone],
    enabled: !!phone && sessionSeq !== undefined,
    queryFn: async (): Promise<ArchivedMessage[]> => {
      const rows = await fetchAll(() => {
        let q = (supabase as any)
          .from('whatsapp_conversation_archive')
          .select('*')
          .eq('session_seq', sessionSeq)
          .order('created_at', { ascending: true });
        q = phone === 'sem-telefone' ? q.is('phone', null) : q.eq('phone', phone);
        return q;
      });
      return rows as ArchivedMessage[];
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
      const rows = await fetchAll(() =>
        (supabase as any)
          .from('whatsapp_conversation_archive')
          .select('session_seq')
          .order('session_seq', { ascending: false }),
      );
      const set = new Set<number>(rows.map((r: any) => Number(r.session_seq)));
      return Array.from(set).sort((a, b) => b - a);
    },
  });
}
