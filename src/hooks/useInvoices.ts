import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface Invoice {
  id: string;
  invoice_number: string;
  contract_id: string | null;
  payment_id: string | null;
  client_name: string;
  client_document: string | null;
  client_address: string | null;
  service_description: string;
  amount_without_vat: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  additional_costs: Record<string, number> | null;
  status: 'EMITIDA' | 'ENVIADA' | 'CANCELADA';
  issued_at: string;
  sent_at: string | null;
  file_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceInsert {
  contract_id?: string;
  payment_id?: string;
  client_name: string;
  client_document?: string;
  client_address?: string;
  service_description: string;
  amount_without_vat: number;
  vat_rate?: number;
  additional_costs?: Record<string, number>;
}

async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .ilike('invoice_number', `${year}-%`)
    .order('invoice_number', { ascending: false })
    .limit(1);
  
  if (error) throw error;
  
  let nextNumber = 1;
  if (data && data.length > 0) {
    const lastNumber = parseInt(data[0].invoice_number.split('-')[1]) || 0;
    nextNumber = lastNumber + 1;
  }
  
  return `${year}-${String(nextNumber).padStart(5, '0')}`;
}

export function useInvoices() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invoicesQuery = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('issued_at', { ascending: false });
      
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const createInvoice = useMutation({
    mutationFn: async (invoice: InvoiceInsert) => {
      const invoiceNumber = await getNextInvoiceNumber();
      
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          ...invoice,
          invoice_number: invoiceNumber,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Fatura emitida com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao emitir fatura', description: error.message, variant: 'destructive' });
    },
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Invoice> & { id: string }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Fatura atualizada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar fatura', description: error.message, variant: 'destructive' });
    },
  });

  const markAsSent = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({
          status: 'ENVIADA',
          sent_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Fatura marcada como enviada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao marcar fatura como enviada', description: error.message, variant: 'destructive' });
    },
  });

  const cancelInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'CANCELADA' })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({ title: 'Fatura cancelada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao cancelar fatura', description: error.message, variant: 'destructive' });
    },
  });

  // Estatísticas
  const issuedInvoices = invoicesQuery.data?.filter(i => i.status === 'EMITIDA') ?? [];
  const sentInvoices = invoicesQuery.data?.filter(i => i.status === 'ENVIADA') ?? [];
  
  const totalIssued = issuedInvoices.reduce((sum, i) => sum + i.total_amount, 0);
  const totalSent = sentInvoices.reduce((sum, i) => sum + i.total_amount, 0);

  return {
    invoices: invoicesQuery.data ?? [],
    isLoading: invoicesQuery.isLoading,
    error: invoicesQuery.error,
    createInvoice,
    updateInvoice,
    markAsSent,
    cancelInvoice,
    issuedInvoices,
    sentInvoices,
    totalIssued,
    totalSent,
  };
}
