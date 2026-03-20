import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PendingItem {
  id: string;
  contact_id: string;
  service_case_id: string | null;
  lead_id: string | null;
  sector: string;
  status: string;
  pending_subject_title: string | null;
  pending_reason: string | null;
  pending_context_summary: string | null;
  last_question_to_customer: string | null;
  awaiting_customer_reply: boolean;
  priority: number;
  last_company_message_at: string | null;
  last_customer_message_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_by_user_id: string | null;
  metadata_json: Record<string, unknown>;
}

export interface CreatePendingItem {
  contact_id: string;
  sector: string;
  pending_subject_title?: string;
  pending_reason?: string;
  pending_context_summary?: string;
  last_question_to_customer?: string;
  service_case_id?: string;
  lead_id?: string;
  awaiting_customer_reply?: boolean;
  priority?: number;
}

export function usePendingItems(contactId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingItems = [], isLoading } = useQuery({
    queryKey: ['pending-items', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('customer_sector_pending_items' as any)
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PendingItem[];
    },
    enabled: !!contactId,
  });

  const createPendingItem = useMutation({
    mutationFn: async (item: CreatePendingItem) => {
      const { data, error } = await supabase
        .from('customer_sector_pending_items' as any)
        .insert(item as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-items', contactId] });
      toast({ title: 'Pendência criada com sucesso' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar pendência', description: error.message, variant: 'destructive' });
    },
  });

  const updatePendingItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PendingItem>) => {
      const { error } = await supabase
        .from('customer_sector_pending_items' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-items', contactId] });
      toast({ title: 'Pendência atualizada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });

  const resolvePendingItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customer_sector_pending_items' as any)
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-items', contactId] });
      toast({ title: 'Pendência resolvida' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao resolver', description: error.message, variant: 'destructive' });
    },
  });

  const cancelPendingItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customer_sector_pending_items' as any)
        .update({
          status: 'cancelled',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-items', contactId] });
      toast({ title: 'Pendência cancelada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' });
    },
  });

  const openItems = pendingItems.filter(p => ['open', 'waiting_customer', 'in_progress'].includes(p.status));
  const closedItems = pendingItems.filter(p => ['resolved', 'cancelled'].includes(p.status));

  return {
    pendingItems,
    openItems,
    closedItems,
    isLoading,
    createPendingItem,
    updatePendingItem,
    resolvePendingItem,
    cancelPendingItem,
  };
}
