import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { generateReceipt, generateReceiptNumber } from '@/lib/generate-receipt';

export interface ReceiptPaymentData {
  id: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  transaction_id: string | null;
  payment_method: string | null;
  installment_number: number | null;
  opportunities: {
    leads: {
      contacts: {
        full_name: string;
        document_number?: string | null;
      } | null;
    };
  };
  contracts?: {
    service_type: string;
    scope_summary?: string | null;
  } | null;
}

export function useReceipts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const generateAndSaveReceipt = useMutation({
    mutationFn: async (payment: ReceiptPaymentData) => {
      const receiptNumber = generateReceiptNumber();
      const clientName = payment.opportunities?.leads?.contacts?.full_name || 'Cliente';
      const clientDocument = payment.opportunities?.leads?.contacts?.document_number || undefined;
      
      // Generate PDF blob
      const receiptBlob = generateReceipt({
        receiptNumber,
        clientName,
        clientDocument,
        amount: payment.amount,
        currency: payment.currency || 'EUR',
        paymentMethod: getPaymentMethodLabel(payment.payment_method),
        paymentDate: payment.paid_at 
          ? new Date(payment.paid_at).toLocaleDateString('pt-BR') 
          : new Date().toLocaleDateString('pt-BR'),
        transactionId: payment.transaction_id || undefined,
        description: payment.installment_number 
          ? `Parcela ${payment.installment_number} - ${payment.contracts?.scope_summary || 'Serviço de Assessoria'}`
          : payment.contracts?.scope_summary || 'Serviço de Assessoria',
      });

      // Upload to storage
      const filePath = `receipts/${payment.id}/${receiptNumber}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(filePath, receiptBlob, { 
          contentType: 'application/pdf',
          upsert: true 
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Erro ao salvar recibo no storage');
      }

      // Update payment with receipt info
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          receipt_number: receiptNumber,
          receipt_url: filePath,
          receipt_generated_at: new Date().toISOString(),
          receipt_available_in_portal: false, // Aguarda aprovação
        })
        .eq('id', payment.id);

      if (updateError) throw updateError;

      return { receiptNumber, filePath };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Recibo gerado com sucesso', description: 'Aguardando aprovação do financeiro.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao gerar recibo', description: error.message, variant: 'destructive' });
    },
  });

  const approveReceipt = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('payments')
        .update({
          receipt_approved_at: new Date().toISOString(),
          receipt_approved_by: user?.id,
          receipt_available_in_portal: true,
        })
        .eq('id', paymentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Recibo aprovado', description: 'Agora está disponível no portal do cliente.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao aprovar recibo', description: error.message, variant: 'destructive' });
    },
  });

  const downloadReceipt = async (receiptUrl: string, receiptNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('client-documents')
        .download(receiptUrl);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${receiptNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({ title: 'Erro ao baixar recibo', description: message, variant: 'destructive' });
    }
  };

  return {
    generateAndSaveReceipt,
    approveReceipt,
    downloadReceipt,
  };
}

function getPaymentMethodLabel(method: string | null): string {
  const labels: Record<string, string> = {
    'TRANSFERENCIA': 'Transferência Bancária',
    'CARTAO_CREDITO': 'Cartão de Crédito',
    'CARTAO_DEBITO': 'Cartão de Débito',
    'PIX': 'PIX',
    'DINHEIRO': 'Dinheiro',
    'BIZUM': 'Bizum',
    'PAYPAL': 'PayPal',
    'STRIPE': 'Stripe',
    'OUTRO': 'Outro',
  };
  return labels[method || 'OUTRO'] || method || 'Outro';
}
