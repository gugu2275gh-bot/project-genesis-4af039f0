import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SLABreachItem {
  id: string;
  type: 'lead' | 'contract' | 'payment' | 'requirement' | 'document' | 'onboarding' | 'tie';
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  hoursOverdue: number;
  relatedId?: string;
}

interface SLAMetrics {
  leadsAwaitingResponse: number;
  leadsIncomplete: number;
  contractsPendingSignature: number;
  paymentsPending: number;
  paymentsPreDue: number;
  requirementsUrgent: number;
  documentsPendingReview: number;
  onboardingIncomplete: number;
  tiePendingPickup: number;
  breaches: SLABreachItem[];
  healthScore: number;
}

export function useSLAMonitoring() {
  return useQuery({
    queryKey: ['sla-monitoring'],
    queryFn: async (): Promise<SLAMetrics> => {
      const now = new Date();
      const breaches: SLABreachItem[] = [];

      // Fetch SLA configurations
      const { data: slaConfigs } = await supabase
        .from('system_config')
        .select('key, value')
        .like('key', 'sla_%');

      const slaMap: Record<string, number> = {
        sla_first_response_hours: 2,
        sla_incomplete_data_reengagement_days: 1,
        sla_contract_signature_reminder_1_days: 2,
        sla_payment_reminder_1_days: 1,
        sla_authority_requirement_response_hours: 48,
        sla_document_review_hours: 24,
      };

      slaConfigs?.forEach((config) => {
        if (config.value) {
          slaMap[config.key] = parseInt(config.value);
        }
      });

      // 1. Leads awaiting first response
      const firstResponseDeadline = new Date(
        now.getTime() - slaMap.sla_first_response_hours * 60 * 60 * 1000
      );
      const { data: newLeads, count: leadsAwaitingResponse } = await supabase
        .from('leads')
        .select('id, created_at, contacts!inner(full_name)', { count: 'exact' })
        .eq('status', 'NOVO')
        .lt('created_at', firstResponseDeadline.toISOString());

      newLeads?.forEach((lead) => {
        const hoursOverdue = Math.round(
          (now.getTime() - new Date(lead.created_at).getTime()) / (60 * 60 * 1000) -
            slaMap.sla_first_response_hours
        );
        breaches.push({
          id: `lead-response-${lead.id}`,
          type: 'lead',
          title: 'Primeira resposta pendente',
          description: `Lead ${(lead.contacts as { full_name: string })?.full_name || 'sem nome'} sem resposta`,
          severity: hoursOverdue > 4 ? 'critical' : 'warning',
          hoursOverdue,
          relatedId: lead.id,
        });
      });

      // 2. Leads with incomplete data
      const reengagementDeadline = new Date(
        now.getTime() - slaMap.sla_incomplete_data_reengagement_days * 24 * 60 * 60 * 1000
      );
      const { count: leadsIncomplete } = await supabase
        .from('leads')
        .select('id', { count: 'exact' })
        .eq('status', 'DADOS_INCOMPLETOS')
        .lt('updated_at', reengagementDeadline.toISOString());

      // 3. Contracts pending signature
      const contractDeadline = new Date(
        now.getTime() - slaMap.sla_contract_signature_reminder_1_days * 24 * 60 * 60 * 1000
      );
      const { data: pendingContracts, count: contractsPendingSignature } = await supabase
        .from('contracts')
        .select('id, created_at, opportunity_id', { count: 'exact' })
        .eq('status', 'ENVIADO')
        .lt('created_at', contractDeadline.toISOString());

      pendingContracts?.forEach((contract) => {
        const daysOverdue = Math.round(
          (now.getTime() - new Date(contract.created_at).getTime()) / (24 * 60 * 60 * 1000) -
            slaMap.sla_contract_signature_reminder_1_days
        );
        if (daysOverdue > 0) {
          breaches.push({
            id: `contract-${contract.id}`,
            type: 'contract',
            title: 'Contrato pendente assinatura',
            description: `Contrato enviado há ${daysOverdue + slaMap.sla_contract_signature_reminder_1_days} dias`,
            relatedId: contract.id,
            severity: daysOverdue > 3 ? 'critical' : 'warning',
            hoursOverdue: daysOverdue * 24,
          });
        }
      });

      // 4. Pending payments - now based on due_date instead of created_at
      const { data: pendingPayments, count: paymentsPending } = await supabase
        .from('payments')
        .select('id, due_date, amount, currency, opportunity_id, installment_number', { count: 'exact' })
        .eq('status', 'PENDENTE')
        .not('due_date', 'is', null);

      pendingPayments?.forEach((payment) => {
        if (!payment.due_date) return;
        const dueDate = new Date(payment.due_date);
        const daysOverdue = Math.floor(
          (now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        
        if (daysOverdue > 0) {
          const installmentLabel = payment.installment_number 
            ? ` (Parcela ${payment.installment_number})` 
            : '';
          breaches.push({
            id: `payment-${payment.id}`,
            type: 'payment',
            title: `Pagamento vencido${installmentLabel}`,
            description: `${payment.amount} ${payment.currency} vencido há ${daysOverdue} dia(s)`,
            severity: daysOverdue >= 7 ? 'critical' : 'warning',
            hoursOverdue: daysOverdue * 24,
            relatedId: payment.opportunity_id,
          });
        }
      });

      // 5. Urgent requirements
      const { data: urgentRequirements, count: requirementsUrgent } = await supabase
        .from('requirements_from_authority')
        .select('id, description, internal_deadline_date, created_at, service_case_id', { count: 'exact' })
        .eq('status', 'ABERTA');

      urgentRequirements?.forEach((req) => {
        const deadline = req.internal_deadline_date
          ? new Date(req.internal_deadline_date)
          : new Date(
              new Date(req.created_at).getTime() +
                slaMap.sla_authority_requirement_response_hours * 60 * 60 * 1000
            );
        const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);

        if (hoursUntilDeadline < 0) {
          breaches.push({
            id: `requirement-${req.id}`,
            type: 'requirement',
            title: 'Exigência vencida',
            description: req.description.substring(0, 50) + '...',
            severity: 'critical',
            hoursOverdue: Math.abs(Math.round(hoursUntilDeadline)),
            relatedId: req.service_case_id,
          });
        } else if (hoursUntilDeadline <= 24) {
          breaches.push({
            id: `requirement-${req.id}`,
            type: 'requirement',
            title: 'Exigência urgente',
            description: `Vence em ${Math.round(hoursUntilDeadline)}h`,
            severity: 'warning',
            hoursOverdue: 0,
            relatedId: req.service_case_id,
          });
        }
      });

      // 6. Documents pending review
      const docReviewDeadline = new Date(
        now.getTime() - slaMap.sla_document_review_hours * 60 * 60 * 1000
      );
      const { count: documentsPendingReview } = await supabase
        .from('service_documents')
        .select('id', { count: 'exact' })
        .eq('status', 'ENVIADO')
        .lt('uploaded_at', docReviewDeadline.toISOString());

      // Calculate health score (0-100)
      const totalBreaches = breaches.length;
      const criticalBreaches = breaches.filter((b) => b.severity === 'critical').length;
      let healthScore = 100;
      healthScore -= criticalBreaches * 15;
      healthScore -= (totalBreaches - criticalBreaches) * 5;
      healthScore = Math.max(0, Math.min(100, healthScore));

      // Sort breaches by severity and overdue time
      breaches.sort((a, b) => {
        if (a.severity === 'critical' && b.severity !== 'critical') return -1;
        if (b.severity === 'critical' && a.severity !== 'critical') return 1;
        return b.hoursOverdue - a.hoursOverdue;
      });

      return {
        leadsAwaitingResponse: leadsAwaitingResponse || 0,
        leadsIncomplete: leadsIncomplete || 0,
        contractsPendingSignature: contractsPendingSignature || 0,
        paymentsPending: paymentsPending || 0,
        paymentsPreDue: 0, // TODO: implement pre-due counting
        requirementsUrgent: requirementsUrgent || 0,
        documentsPendingReview: documentsPendingReview || 0,
        onboardingIncomplete: 0, // TODO: implement onboarding counting
        tiePendingPickup: 0, // TODO: implement TIE pickup counting
        breaches: breaches.slice(0, 10),
        healthScore,
      };
    },
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,
  });
}
