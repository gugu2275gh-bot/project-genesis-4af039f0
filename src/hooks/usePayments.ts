import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

// Contas oficiais que requerem emissão de fatura fiscal
const OFFICIAL_ACCOUNTS = [
  'BRUCKSCHEN_ES',
  'BRUCKSCHEN_ASSOCIADOS_ES',
  'BRUCKSCHEN_ASESORIA_ES',
];

// Função auxiliar para gerar próximo número de fatura
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

export type Payment = Tables<'payments'>;
export type PaymentInsert = TablesInsert<'payments'>;
export type PaymentUpdate = TablesUpdate<'payments'>;

export type PaymentWithOpportunity = Payment & {
  opportunities: Tables<'opportunities'> & {
    leads: Tables<'leads'> & {
      contacts: Tables<'contacts'> | null;
      service_types: { id: string; name: string } | null;
      service_interest: string | null;
    };
  };
  contracts?: Tables<'contracts'> | null;
  // New receipt fields
  receipt_number?: string | null;
  receipt_generated_at?: string | null;
  receipt_approved_at?: string | null;
  receipt_approved_by?: string | null;
};

export function usePayments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          opportunities (
            *,
            leads (
              *,
              contacts (*),
              service_types (id, name)
            )
          ),
          contracts (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      const payments = (data || []) as PaymentWithOpportunity[];
      const orphanOpportunityIds = Array.from(new Set(
        payments
          .filter((payment) => !payment.contracts && payment.opportunity_id)
          .map((payment) => payment.opportunity_id)
      ));

      if (orphanOpportunityIds.length === 0) {
        return payments;
      }

      // 1) Direct match: contracts.opportunity_id = payment.opportunity_id
      const { data: contracts, error: contractsError } = await supabase
        .from('contracts')
        .select('*')
        .in('opportunity_id', orphanOpportunityIds)
        .in('status', ['APROVADO', 'ASSINADO']);

      if (contractsError) throw contractsError;

      const contractByOpportunityId = new Map<string, any>(
        (contracts || []).map((contract) => [contract.opportunity_id, contract])
      );

      // 2) For opps still without contract, resolve via contract_leads (M2M)
      const remainingOppIds = orphanOpportunityIds.filter(
        (oppId) => !contractByOpportunityId.has(oppId)
      );

      if (remainingOppIds.length > 0) {
        const { data: oppRows } = await supabase
          .from('opportunities')
          .select('id, lead_id')
          .in('id', remainingOppIds);

        const leadIds = Array.from(
          new Set((oppRows || []).map((o: any) => o.lead_id).filter(Boolean))
        );

        if (leadIds.length > 0) {
          const { data: clRows } = await supabase
            .from('contract_leads')
            .select('lead_id, contract_id, contracts:contract_id(*)')
            .in('lead_id', leadIds);

          const contractByLeadId = new Map<string, any>();
          (clRows || []).forEach((row: any) => {
            const c = row.contracts;
            if (c && (c.status === 'APROVADO' || c.status === 'ASSINADO')) {
              contractByLeadId.set(row.lead_id, c);
            }
          });

          (oppRows || []).forEach((o: any) => {
            const c = contractByLeadId.get(o.lead_id);
            if (c) contractByOpportunityId.set(o.id, c);
          });
        }
      }

      return payments.map((payment) => ({
        ...payment,
        contracts: payment.contracts || contractByOpportunityId.get(payment.opportunity_id) || null,
      }));
    },
  });

  const createPayment = useMutation({
    mutationFn: async (payment: PaymentInsert) => {
      const { data, error } = await supabase
        .from('payments')
        .insert(payment)
        .select()
        .single();
      
      if (error) throw error;

      // Update opportunity status
      await supabase
        .from('opportunities')
        .update({ status: 'PAGAMENTO_PENDENTE' })
        .eq('id', payment.opportunity_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      toast({ title: 'Pagamento criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const confirmPayment = useMutation({
    mutationFn: async ({ id, transactionId, paidAt }: { id: string; transactionId?: string; paidAt?: string }) => {
      const paidAtDate = paidAt || new Date().toISOString();
      
      // 1. Update payment to CONFIRMADO
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .update({
          status: 'CONFIRMADO',
          paid_at: paidAtDate,
          transaction_id: transactionId,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (paymentError) throw paymentError;

      let isFirstPayment = false;
      let caseCreated = false;
      let contractId = payment.contract_id;
      let clientName = 'Cliente';

      // 2. If payment has no contract_id, try to find contract by opportunity_id
      if (!contractId && payment.opportunity_id) {
        const { data: contractByOpp } = await supabase
          .from('contracts')
          .select('id')
          .eq('opportunity_id', payment.opportunity_id)
          .maybeSingle();
        
        if (contractByOpp) {
          contractId = contractByOpp.id;
          // Update payment with contract_id for future reference
          await supabase
            .from('payments')
            .update({ contract_id: contractId })
            .eq('id', payment.id);
        }
      }

      // 3. Get opportunity with lead/contact info for client name
      const { data: opportunity } = await supabase
        .from('opportunities')
        .select('*, leads (*, contacts (*))')
        .eq('id', payment.opportunity_id)
        .single();

      if (opportunity?.leads?.contacts?.full_name) {
        clientName = opportunity.leads.contacts.full_name;
      }

      // 4. Check if payment has a linked contract
      if (contractId) {
        // 4a. Get contract to check current payment_status
        const { data: contract } = await supabase
          .from('contracts')
          .select('id, payment_status, opportunity_id')
          .eq('id', contractId)
          .single();

        // 4b. If payment_status is NAO_INICIADO, this is the FIRST payment
        if (contract && contract.payment_status === 'NAO_INICIADO') {
          isFirstPayment = true;

          // Update contract payment_status to INICIADO
          await supabase
            .from('contracts')
            .update({ payment_status: 'INICIADO' })
            .eq('id', contract.id);

          // Update opportunity to FECHADA_GANHA
          await supabase
            .from('opportunities')
            .update({ status: 'FECHADA_GANHA' })
            .eq('id', payment.opportunity_id);

          // Create technical case if lead data exists
          if (opportunity?.leads) {
            const serviceType = opportunity.leads.service_interest || 'OUTRO';
            type ServiceSector = 'ESTUDANTE' | 'TRABALHO' | 'REAGRUPAMENTO' | 'RENOVACAO' | 'NACIONALIDADE';
            const sectorMap: Record<string, ServiceSector> = {
              'VISTO_ESTUDANTE': 'ESTUDANTE',
              'VISTO_TRABALHO': 'TRABALHO',
              'REAGRUPAMENTO': 'REAGRUPAMENTO',
              'RENOVACAO_RESIDENCIA': 'RENOVACAO',
              'NACIONALIDADE_RESIDENCIA': 'NACIONALIDADE',
              'NACIONALIDADE_CASAMENTO': 'NACIONALIDADE',
              'OUTRO': 'ESTUDANTE',
            };
            const sector: ServiceSector = sectorMap[serviceType] || 'ESTUDANTE';

            // Create technical case linked to opportunity
            const { data: newCase, error: caseError } = await supabase
              .from('service_cases')
              .insert([{
                opportunity_id: payment.opportunity_id,
                service_type: serviceType,
                sector: sector,
                technical_status: 'CONTATO_INICIAL' as const,
              }])
              .select()
              .single();

            if (!caseError && newCase) {
              caseCreated = true;

              // Create routing task linked to the case
              await supabase
                .from('tasks')
                .insert([{
                  title: 'Encaminhamento Interno',
                  description: 'Caso técnico criado após confirmação do primeiro pagamento do contrato. Atribuir ao setor técnico responsável.',
                  related_opportunity_id: payment.opportunity_id,
                  related_service_case_id: newCase.id,
                  created_by_user_id: user?.id,
                }]);

              // Notify MANAGER/COORD to assign the case to a technician
              const { data: managers } = await supabase
                .from('user_roles')
                .select('user_id')
                .in('role', ['MANAGER', 'ADMIN']);

              if (managers?.length) {
                const notifications = managers.map(u => ({
                  user_id: u.user_id,
                  type: 'case_status_changed',
                  title: 'Novo Caso Técnico - Atribuir Responsável',
                  message: `Caso de ${clientName} criado após pagamento. Atribuir a um técnico responsável.`,
                }));
                await supabase.from('notifications').insert(notifications);
              }
            } else if (caseError) {
              console.error('Error creating service case:', caseError);
            }
          }
        }

        // 5. Check if ALL payments of this contract are confirmed
        const { data: allPayments } = await supabase
          .from('payments')
          .select('status')
          .eq('contract_id', contractId);

        const allConfirmed = allPayments?.every(p => p.status === 'CONFIRMADO');

        if (allConfirmed) {
          // Update contract to CONCLUIDO (fully paid)
          await supabase
            .from('contracts')
            .update({ payment_status: 'CONCLUIDO' })
            .eq('id', contractId);
        }
      } else {
        // Payment without linked contract - legacy behavior
        await supabase
          .from('opportunities')
          .update({ status: 'FECHADA_GANHA' })
          .eq('id', payment.opportunity_id);
      }

      // 6. NOVO: Criar entrada automática no Livro Caixa (Cash Flow)
      // Verificar se já existe entrada para evitar duplicatas
      const { data: existingCashFlowEntry } = await supabase
        .from('cash_flow')
        .select('id')
        .eq('related_payment_id', payment.id)
        .maybeSingle();

      if (!existingCashFlowEntry) {
        // Construir descrição com nome do cliente e número da parcela
        const installmentInfo = payment.installment_number
          ? ` - Parcela ${payment.installment_number}`
          : '';
        const description = `Pagamento ${clientName}${installmentInfo}`;

        // Usar a data do pagamento para reference_date (apenas a data, sem hora)
        const referenceDate = paidAtDate.split('T')[0];

        // Inserir entrada no Cash Flow puxando os dados diretamente do pagamento
        const { data: cashFlowEntry } = await supabase.from('cash_flow').insert({
          type: 'ENTRADA',
          category: 'SERVICOS',
          description,
          amount: payment.amount,
          payment_method: payment.payment_method || null,
          payment_account: (payment as any).payment_account_id || null,
          due_date: payment.due_date || null,
          payment_date: referenceDate,
          payment_confirmed_date: referenceDate,
          related_payment_id: payment.id,
          related_contract_id: contractId || null,
          reference_date: referenceDate,
          created_by_user_id: user?.id,
        }).select().single();

        const cashFlowEntryId = cashFlowEntry?.id;

        // 7. Verificar se a conta de pagamento selecionada emite fatura automática
        let requiresInvoice = false;
        if ((payment as any).payment_account_id) {
          const { data: acc } = await supabase
            .from('payment_accounts')
            .select('issues_invoice')
            .eq('id', (payment as any).payment_account_id)
            .maybeSingle();
          requiresInvoice = !!acc?.issues_invoice;
        }
        let invoiceNumber: string | null = null;

        if (requiresInvoice) {
          // Gerar fatura automática para contas oficiais
          invoiceNumber = await getNextInvoiceNumber();
          
          // Cálculo do IVA (21%): valor do pagamento é a BASE sem IVA
          const amountWithoutVat = payment.amount;
          const vatRate = 0.21;
          const vatAmount = amountWithoutVat * vatRate;
          const totalAmount = amountWithoutVat + vatAmount;

          // Obter tipo de serviço para descrição
          const serviceType = opportunity?.leads?.service_interest || 'assessoria';
          
          const { data: newInvoice } = await supabase.from('invoices').insert({
            invoice_number: invoiceNumber,
            payment_id: payment.id,
            contract_id: contractId || null,
            client_name: clientName,
            client_document: opportunity?.leads?.contacts?.document_number || null,
            client_address: opportunity?.leads?.contacts?.address || null,
            service_description: `Serviços de ${serviceType}${installmentInfo}`,
            amount_without_vat: Math.round(amountWithoutVat * 100) / 100,
            vat_rate: vatRate,
            vat_amount: Math.round(vatAmount * 100) / 100,
            total_amount: Math.round(totalAmount * 100) / 100,
            status: 'EMITIDA',
            created_by_user_id: user?.id,
          }).select().single();

          // Atualizar Cash Flow com referência à fatura
          if (newInvoice && cashFlowEntryId) {
            await supabase.from('cash_flow')
              .update({
                is_invoiced: true,
                invoice_number: newInvoice.invoice_number,
              })
              .eq('id', cashFlowEntryId);
          }
        } else {
          // Marcar como não faturado com referência ao mês/ano
          const refMonthYear = format(new Date(paidAtDate), 'MM/yyyy');

          if (cashFlowEntryId) {
            await supabase.from('cash_flow')
              .update({
                is_invoiced: false,
                invoice_number: `NO-${refMonthYear}`,
              })
              .eq('id', cashFlowEntryId);
          }
        }

        return { payment, isFirstPayment, caseCreated, invoiceNumber };
      }

      return { payment, isFirstPayment, caseCreated, invoiceNumber: null };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      
      if (result.invoiceNumber) {
        if (result.isFirstPayment && result.caseCreated) {
          toast({ title: `Pagamento confirmado! Fatura ${result.invoiceNumber} emitida, caso técnico criado.` });
        } else if (result.isFirstPayment) {
          toast({ title: `Pagamento confirmado! Fatura ${result.invoiceNumber} emitida, contrato iniciado.` });
        } else {
          toast({ title: `Pagamento confirmado! Fatura ${result.invoiceNumber} emitida automaticamente.` });
        }
      } else {
        if (result.isFirstPayment && result.caseCreated) {
          toast({ title: 'Pagamento confirmado e registrado no Caixa (sem fatura fiscal). Caso técnico criado.' });
        } else if (result.isFirstPayment) {
          toast({ title: 'Pagamento confirmado e registrado no Caixa (sem fatura fiscal). Contrato iniciado.' });
        } else {
          toast({ title: 'Pagamento confirmado e registrado no Caixa (sem fatura fiscal).' });
        }
      }
    },
    onError: (error) => {
      toast({ title: 'Erro ao confirmar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, ...updates }: PaymentUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Pagamento atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar pagamento', description: error.message, variant: 'destructive' });
    },
  });

  const sendCollectionMessage = useMutation({
    mutationFn: async (payment: PaymentWithOpportunity) => {
      const phone = payment.opportunities?.leads?.contacts?.phone;
      const leadId = payment.opportunities?.lead_id;
      const clientName = payment.opportunities?.leads?.contacts?.full_name || 'Cliente';
      
      if (!phone) throw new Error('Telefone do contato não encontrado');
      
      const message = `Olá ${clientName}! Identificamos que seu pagamento está em atraso. Favor providenciar o mais rápido possível ou entre em contato com a CB Asesoria.`;
      
      // 1. Enviar WhatsApp via Edge Function
      const { error: webhookError } = await supabase.functions.invoke('send-whatsapp', {
        body: { mensagem: message, numero: String(phone) }
      });
      
      if (webhookError) throw webhookError;
      
      // 2. Registrar no histórico de mensagens (se tiver lead_id)
      if (leadId) {
        await supabase.from('mensagens_cliente').insert({
          id_lead: leadId,
          mensagem_IA: message,
          origem: 'SISTEMA',
        });
      }
      
      return { success: true };
    },
    onSuccess: () => {
      toast({ title: 'Cobrança enviada com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao enviar cobrança', description: error.message, variant: 'destructive' });
    },
  });

  return {
    payments: paymentsQuery.data ?? [],
    isLoading: paymentsQuery.isLoading,
    error: paymentsQuery.error,
    createPayment,
    confirmPayment,
    updatePayment,
    sendCollectionMessage,
  };
}
