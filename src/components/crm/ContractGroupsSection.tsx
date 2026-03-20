import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useToast } from '@/hooks/use-toast';
import { PaymentAgreementDialog, PaymentAgreementInitialData } from '@/components/crm/PaymentAgreementDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Briefcase, CreditCard, DollarSign, Loader2, Plus, Pencil, Trash2, CheckCircle2, FileText, Package, ChevronRight, ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  SERVICE_INTEREST_LABELS,
  LEAD_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
} from '@/types/database';

export interface BeneficiaryContact {
  id: string;
  full_name: string;
}

interface ContractGroupsSectionProps {
  contactId: string;
  contactName: string;
  contactLeads: any[];
  paymentNotes: string | null;
  confirmedLeadIds: string[];
  navigate: (path: string) => void;
  beneficiaryContacts?: BeneficiaryContact[];
}

export function ContractGroupsSection({
  contactId,
  contactName,
  contactLeads,
  paymentNotes,
  confirmedLeadIds,
  navigate,
  beneficiaryContacts = [],
}: ContractGroupsSectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: serviceTypes } = useServiceTypes();
  
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isCreatingContract, setIsCreatingContract] = useState(false);
  const [showPaymentAgreement, setShowPaymentAgreement] = useState(false);
  const [editPaymentData, setEditPaymentData] = useState<PaymentAgreementInitialData | null>(null);
  const [deleteServiceLead, setDeleteServiceLead] = useState<any>(null);
  const [isDeletingService, setIsDeletingService] = useState(false);
  const [addingToContractId, setAddingToContractId] = useState<string | null>(null);
  const [addServiceToContractId, setAddServiceToContractId] = useState<string | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [showPersonSelector, setShowPersonSelector] = useState(false);
  const [pendingAddServiceContractId, setPendingAddServiceContractId] = useState<string | null | undefined>(undefined);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string | null>(null);
  const [selectedBeneficiaryName, setSelectedBeneficiaryName] = useState<string>('');

  // Fetch contract_leads for this contact's leads
  const leadIds = contactLeads.map(l => l.id);
  
  const { data: contractLeadLinks = [] } = useQuery({
    queryKey: ['contract-leads', contactId],
    queryFn: async () => {
      if (!leadIds.length) return [];
      const { data, error } = await supabase
        .from('contract_leads')
        .select('*, contracts(id, contract_number, status, total_fee, service_type, created_at, opportunity_id)')
        .in('lead_id', leadIds);
      if (error) throw error;
      return data || [];
    },
    enabled: leadIds.length > 0,
  });

  // Fetch payments for this contact
  const { data: contactPayments = [] } = useQuery({
    queryKey: ['contact-payments', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      if (!cLeads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id').in('lead_id', cLeads.map(l => l.id));
      if (!opps?.length) return [];
      const { data: payments } = await supabase
        .from('payments')
        .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest))')
        .in('opportunity_id', opps.map(o => o.id))
        .order('due_date', { ascending: true });
      return payments || [];
    },
    enabled: !!contactId,
  });

  // Fetch contracts for contact
  const { data: contactContracts = [] } = useQuery({
    queryKey: ['contact-contracts', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      if (!cLeads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id, lead_id').in('lead_id', cLeads.map(l => l.id));
      if (!opps?.length) return [];
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id, contract_number, service_type, status, total_fee, created_at, signed_at, opportunity_id')
        .in('opportunity_id', opps.map(o => o.id))
        .order('created_at', { ascending: false });
      return (contracts || []).map(c => {
        const opp = opps.find(o => o.id === c.opportunity_id);
        return { ...c, lead_id: opp?.lead_id };
      });
    },
    enabled: !!contactId,
  });

  // Fetch service cases for completed status
  const { data: contactServiceCases = [] } = useQuery({
    queryKey: ['contact-service-cases', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      if (!cLeads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id, lead_id').in('lead_id', cLeads.map(l => l.id));
      if (!opps?.length) return [];
      const { data: cases } = await supabase
        .from('service_cases')
        .select('id, opportunity_id, technical_status')
        .in('opportunity_id', opps.map(o => o.id));
      if (!cases) return [];
      return cases.map(c => {
        const opp = opps.find(o => o.id === c.opportunity_id);
        return { ...c, lead_id: opp?.lead_id };
      });
    },
    enabled: !!contactId,
  });

  // Fetch beneficiary leads (leads belonging to beneficiary contacts)
  const beneficiaryContactIds = beneficiaryContacts.map(b => b.id);
  const { data: beneficiaryLeads = [] } = useQuery({
    queryKey: ['beneficiary-leads-in-groups', contactId, beneficiaryContactIds],
    queryFn: async () => {
      if (!beneficiaryContactIds.length) return [];
      const { data } = await supabase
        .from('leads')
        .select('*, contacts:contact_id(id, full_name)')
        .in('contact_id', beneficiaryContactIds)
        .neq('status', 'ARQUIVADO_SEM_RETORNO')
        .order('created_at', { ascending: false });
      return (data || []).map((l: any) => ({
        ...l,
        _beneficiaryName: l.contacts?.full_name || '',
        _isBeneficiary: true,
      }));
    },
    enabled: beneficiaryContactIds.length > 0,
  });

  // Fetch contract_leads for beneficiary leads too
  const beneficiaryLeadIds = beneficiaryLeads.map((l: any) => l.id);
  const { data: beneficiaryContractLeadLinks = [] } = useQuery({
    queryKey: ['beneficiary-contract-leads', contactId, beneficiaryLeadIds],
    queryFn: async () => {
      if (!beneficiaryLeadIds.length) return [];
      const { data, error } = await supabase
        .from('contract_leads')
        .select('*, contracts(id, contract_number, status, total_fee, service_type, created_at, opportunity_id)')
        .in('lead_id', beneficiaryLeadIds);
      if (error) throw error;
      return data || [];
    },
    enabled: beneficiaryLeadIds.length > 0,
  });

  // Fetch payments for beneficiary leads
  const { data: beneficiaryPayments = [] } = useQuery({
    queryKey: ['beneficiary-payments-in-groups', contactId, beneficiaryContactIds],
    queryFn: async () => {
      if (!beneficiaryContactIds.length) return [];
      const { data: bLeads } = await supabase.from('leads').select('id').in('contact_id', beneficiaryContactIds);
      if (!bLeads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id').in('lead_id', bLeads.map(l => l.id));
      if (!opps?.length) return [];
      const { data: payments } = await supabase
        .from('payments')
        .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest))')
        .in('opportunity_id', opps.map(o => o.id))
        .order('due_date', { ascending: true });
      return payments || [];
    },
    enabled: beneficiaryContactIds.length > 0,
  });

  // Combine all leads (titular + beneficiary)
  const allLeads = [...contactLeads, ...beneficiaryLeads];
  const allContractLeadLinks = [...contractLeadLinks, ...beneficiaryContractLeadLinks];
  const allPayments = [...contactPayments, ...beneficiaryPayments];
  // Deduplicate payments
  const seenPaymentIds = new Set<string>();
  const deduplicatedPayments = allPayments.filter(p => {
    if (seenPaymentIds.has(p.id)) return false;
    seenPaymentIds.add(p.id);
    return true;
  });

  // Build contract groups
  const contractGroups = useMemo(() => {
    const groups: Record<string, { contract: any; leads: any[]; payments: any[] }> = {};
    
    // Group by contract via contract_leads
    allContractLeadLinks.forEach((cl: any) => {
      const contractId = cl.contract_id;
      if (!groups[contractId]) {
        groups[contractId] = {
          contract: cl.contracts,
          leads: [],
          payments: [],
        };
      }
      const lead = allLeads.find(l => l.id === cl.lead_id);
      if (lead) groups[contractId].leads.push(lead);
    });

    // Also check contracts linked via opportunity (legacy)
    contactContracts.forEach((contract: any) => {
      if (!groups[contract.id]) {
        const hasLinks = allContractLeadLinks.some((cl: any) => cl.contract_id === contract.id);
        if (!hasLinks && contract.lead_id) {
          const lead = allLeads.find(l => l.id === contract.lead_id);
          groups[contract.id] = {
            contract,
            leads: lead ? [lead] : [],
            payments: [],
          };
        }
      }
    });

    // Attach payments to groups
    deduplicatedPayments.forEach((p: any) => {
      const leadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
      for (const gId of Object.keys(groups)) {
        if (groups[gId].leads.some(l => l.id === leadId)) {
          groups[gId].payments.push(p);
          return;
        }
      }
    });

    return Object.values(groups);
  }, [allContractLeadLinks, contactContracts, allLeads, deduplicatedPayments]);

  // Ungrouped leads (not linked to any contract)
  const groupedLeadIds = new Set(contractGroups.flatMap(g => g.leads.map(l => l.id)));
  const ungroupedLeads = allLeads.filter(l => !groupedLeadIds.has(l.id));

  // Ungrouped payments
  const groupedPaymentIds = new Set(contractGroups.flatMap(g => g.payments.map(p => p.id)));
  const ungroupedPayments = deduplicatedPayments.filter(p => !groupedPaymentIds.has(p.id));

  const getLeadDisplayName = (lead: any) => {
    const serviceTypeName = lead.service_type_id
      ? serviceTypes?.find(st => st.id === lead.service_type_id)?.name
      : null;
    return serviceTypeName || SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO'];
  };

  const extractLastNotes = (): string => {
    const notes = paymentNotes || '';
    if (!notes) return '';
    const blocks = notes.split('---');
    const lastBlock = blocks[blocks.length - 1] || '';
    const match = lastBlock.match(/Observações:\s*(.+?)(?:\n|$)/);
    return match ? match[1].trim() : '';
  };

  // Create a new draft contract and link selected leads
  const handleCreateContractGroup = async () => {
    if (selectedLeadIds.size === 0) {
      toast({ title: 'Selecione ao menos um serviço', variant: 'destructive' });
      return;
    }

    setIsCreatingContract(true);
    try {
      // Get the first selected lead's opportunity
      const firstLeadId = Array.from(selectedLeadIds)[0];
      const { data: opps } = await supabase
        .from('opportunities')
        .select('id')
        .eq('lead_id', firstLeadId)
        .limit(1);
      
      if (!opps?.length) {
        toast({ title: 'Nenhuma oportunidade encontrada para este lead', variant: 'destructive' });
        return;
      }

      const firstLead = contactLeads.find(l => l.id === firstLeadId);
      
      // Create draft contract
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          opportunity_id: opps[0].id,
          service_type: firstLead?.service_interest || 'OUTRO',
          status: 'EM_ELABORACAO',
          created_by_user_id: user?.id,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Link all selected leads to this contract
      const links = Array.from(selectedLeadIds).map(leadId => ({
        contract_id: contract.id,
        lead_id: leadId,
      }));

      const { error: linkError } = await supabase
        .from('contract_leads')
        .insert(links);

      if (linkError) throw linkError;

      setSelectedLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato criado com os serviços selecionados' });
    } catch (error: any) {
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreatingContract(false);
    }
  };

  // Add ungrouped leads to an existing draft contract
  const handleAddToContract = async (contractId: string) => {
    if (selectedLeadIds.size === 0) return;
    
    setAddingToContractId(contractId);
    try {
      const links = Array.from(selectedLeadIds).map(leadId => ({
        contract_id: contractId,
        lead_id: leadId,
      }));

      const { error } = await supabase
        .from('contract_leads')
        .upsert(links, { onConflict: 'contract_id,lead_id' });

      if (error) throw error;

      setSelectedLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
      toast({ title: 'Serviços adicionados ao contrato' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setAddingToContractId(null);
    }
  };

  // Remove a lead from a contract group
  const handleRemoveFromContract = async (contractId: string, leadId: string) => {
    try {
      const { error } = await supabase
        .from('contract_leads')
        .delete()
        .eq('contract_id', contractId)
        .eq('lead_id', leadId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
      toast({ title: 'Serviço removido do contrato' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  // "Concluir" - mark contract as APROVADO so it appears in Contracts list
  const [isFinalizingContract, setIsFinalizingContract] = useState(false);
  const handleFinalizeContract = async (contractId: string) => {
    setIsFinalizingContract(true);
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ status: 'APROVADO', updated_by_user_id: user?.id })
        .eq('id', contractId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Contrato concluído e disponível em Contratos' });
    } catch (error: any) {
      toast({ title: 'Erro ao concluir contrato', description: error.message, variant: 'destructive' });
    } finally {
      setIsFinalizingContract(false);
    }
  };

  // Delete/archive service
  const hasProtectedContract = (leadId: string) => {
    return contactContracts.some((c: any) => 
      c.lead_id === leadId && ['APROVADO', 'ASSINADO', 'CANCELADO'].includes(c.status)
    );
  };

  const handleDeleteService = async (lead: any) => {
    if (!lead) return;
    setIsDeletingService(true);
    try {
      const isProtected = hasProtectedContract(lead.id);
      if (isProtected) {
        await supabase.from('leads').update({ status: 'ARQUIVADO_SEM_RETORNO' }).eq('id', lead.id);
        toast({ title: 'Serviço arquivado' });
      } else {
        // Remove from contract_leads first
        await supabase.from('contract_leads').delete().eq('lead_id', lead.id);
        // Delete payments, contracts, opportunities, then lead
        const { data: opps } = await supabase.from('opportunities').select('id').eq('lead_id', lead.id);
        if (opps && opps.length > 0) {
          const oppIds = opps.map(o => o.id);
          await supabase.from('payments').delete().in('opportunity_id', oppIds);
          await supabase.from('contracts').delete().in('opportunity_id', oppIds);
          await supabase.from('opportunities').delete().in('id', oppIds);
        }
        await supabase.from('leads').delete().eq('id', lead.id);
        toast({ title: 'Serviço excluído com sucesso' });
      }
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
      queryClient.invalidateQueries({ queryKey: ['confirmed-lead-ids', contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-service-cases', contactId] });
    } catch (error: any) {
      toast({ title: 'Erro ao excluir serviço', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingService(false);
      setDeleteServiceLead(null);
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  // Draft contracts that can receive more services
  const draftContracts = contractGroups.filter(g => g.contract?.status === 'EM_ELABORACAO');

  const renderPaymentRow = (payment: any, servicePayments: any[], editable: boolean = true) => (
    <div key={payment.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">
            € {Number(payment.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          {payment.installment_number && (
            <Badge variant="outline" className="text-xs">
              Parcela {payment.installment_number}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {payment.due_date && (
            <span>Venc: {format(new Date(payment.due_date), "dd/MM/yyyy")}</span>
          )}
          {payment.contracts?.contract_number && (
            <span>{payment.contracts.contract_number}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          status={payment.status || 'PENDENTE'}
          label={PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status}
        />
        {editable && payment.status === 'PENDENTE' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              const leadData = payment.opportunities?.leads;
              const serviceTypeId = leadData?.service_type_id || '';
              const groupPayments = servicePayments.filter((p: any) => p.payment_form === 'PARCELADO');
              const installments = groupPayments.length > 1
                ? groupPayments.map((p: any) => ({ amount: p.amount?.toString() || '', due_date: p.due_date || '' }))
                : [];
              setEditPaymentData({
                amount: payment.amount,
                payment_method: payment.payment_method,
                payment_form: payment.payment_form,
                apply_vat: payment.apply_vat,
                vat_rate: payment.vat_rate,
                discount_type: payment.discount_type,
                discount_value: payment.discount_value,
                gross_amount: payment.gross_amount,
                serviceTypeId,
                installments,
                notes: extractLastNotes(),
              });
              setShowPaymentAgreement(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );

  const renderLeadItem = (lead: any, options?: { showCheckbox?: boolean; showDelete?: boolean; contractId?: string; editable?: boolean }) => {
    const displayName = getLeadDisplayName(lead);
    const isConfirmed = confirmedLeadIds.includes(lead.id);
    const serviceCase = contactServiceCases.find((sc: any) => sc.lead_id === lead.id);
    const isServiceCompleted = serviceCase && (serviceCase.technical_status === 'ENCERRADO_APROVADO' || serviceCase.technical_status === 'ENCERRADO_NEGADO');
    const editable = options?.editable !== false; // default true

    // Find payments for this lead
    const leadPayments = contactPayments.filter((p: any) => {
      const pLeadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
      return pLeadId === lead.id;
    });
    const allPaymentsPaid = leadPayments.length > 0 && leadPayments.every((p: any) => p.status === 'CONFIRMADO');

    return (
      <div key={lead.id} className={`rounded-lg border overflow-hidden ${isServiceCompleted ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {options?.showCheckbox && (
              <Checkbox
                checked={selectedLeadIds.has(lead.id)}
                onCheckedChange={() => toggleLeadSelection(lead.id)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div 
              className="cursor-pointer flex-1"
              onClick={() => navigate(`/crm/leads/${lead.id}`)}
            >
              <p className={`font-medium ${isServiceCompleted ? 'text-muted-foreground' : ''}`}>{displayName}</p>
              <p className="text-sm text-muted-foreground">
                Criado em {format(new Date(lead.created_at!), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isServiceCompleted && <StatusBadge variant="success" label="Concluído" />}
            {allPaymentsPaid && leadPayments.length > 0 && <StatusBadge variant="success" label="Quitado" />}
            {!isServiceCompleted && (
              isConfirmed ? (
                <StatusBadge status={lead.status || 'NOVO'} label={LEAD_STATUS_LABELS[lead.status || 'NOVO']} />
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  Aguardando Pagamento
                </Badge>
              )
            )}
            {editable && options?.contractId && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteServiceLead({ ...lead, _contractId: options.contractId });
                }}
                title="Excluir serviço do contrato"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {editable && options?.showDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteServiceLead(lead);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Payments for this lead */}
        {leadPayments.length > 0 && (
          <div className="border-t bg-muted/10 px-3 py-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {leadPayments.length} pagamento{leadPayments.length > 1 ? 's' : ''}
            </p>
            {leadPayments.map((p: any) => renderPaymentRow(p, leadPayments, editable))}
          </div>
        )}
      </div>
    );
  };

  const totalServices = contactLeads.length;

  // Show last payment note
  const lastNote = (() => {
    const notes = paymentNotes || '';
    const parts = notes.split('\n---\n').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1].trim() : '';
  })();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Serviços & Pagamentos ({totalServices})
            </CardTitle>
            <CardDescription>Serviços agrupados por contrato</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditPaymentData(null); setShowPaymentAgreement(true); }}>
              <DollarSign className="h-4 w-4 mr-1" />
              Forma de Pagamento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Last payment agreement note */}
          {lastNote ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-line">
              {lastNote}
            </div>
          ) : null}

          {totalServices === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum serviço ou pagamento registrado.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Ungrouped Services first */}
              {ungroupedLeads.length > 0 && (
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold text-muted-foreground">
                          Serviços sem contrato
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {ungroupedLeads.length} serviço{ungroupedLeads.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAddServiceToContractId(null);
                          setEditPaymentData(null);
                          setShowPaymentAgreement(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Serviço
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isCreatingContract || ungroupedLeads.length === 0}
                        onClick={async () => {
                          const allIds = new Set(ungroupedLeads.map(l => l.id));
                          setSelectedLeadIds(allIds);
                          setIsCreatingContract(true);
                          try {
                            const firstLead = ungroupedLeads[0];
                            const { data: opps } = await supabase
                              .from('opportunities')
                              .select('id')
                              .eq('lead_id', firstLead.id)
                              .limit(1);
                            if (!opps?.length) {
                              toast({ title: 'Nenhuma oportunidade encontrada', variant: 'destructive' });
                              return;
                            }
                            const { data: contract, error: contractError } = await supabase
                              .from('contracts')
                              .insert({
                                opportunity_id: opps[0].id,
                                service_type: firstLead?.service_interest || 'OUTRO',
                                status: 'EM_ELABORACAO',
                                created_by_user_id: user?.id,
                              })
                              .select()
                              .single();
                            if (contractError) throw contractError;
                            const links = ungroupedLeads.map(l => ({
                              contract_id: contract.id,
                              lead_id: l.id,
                            }));
                            const { error: linkError } = await supabase
                              .from('contract_leads')
                              .insert(links);
                            if (linkError) throw linkError;
                            setSelectedLeadIds(new Set());
                            queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
                            queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
                            queryClient.invalidateQueries({ queryKey: ['contracts'] });
                            toast({ title: 'Contrato criado com os serviços selecionados' });
                          } catch (error: any) {
                            toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
                          } finally {
                            setIsCreatingContract(false);
                          }
                        }}
                      >
                        {isCreatingContract ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Concluir
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 space-y-3">
                    {ungroupedLeads.map(lead => renderLeadItem(lead, { 
                      showDelete: true,
                      editable: true,
                    }))}
                  </div>
                </div>
              )}

              {/* Contract Groups */}
              {contractGroups.map((group, idx) => {
                const contract = group.contract;
                if (!contract) return null;
                const statusLabel = CONTRACT_STATUS_LABELS[contract.status as keyof typeof CONTRACT_STATUS_LABELS] || contract.status;
                const isDraft = contract.status === 'EM_ELABORACAO';
                const isCollapsible = !isDraft;
                const isExpanded = isDraft || expandedContracts.has(contract.id);

                const toggleExpand = () => {
                  if (!isCollapsible) return;
                  setExpandedContracts(prev => {
                    const next = new Set(prev);
                    if (next.has(contract.id)) next.delete(contract.id);
                    else next.add(contract.id);
                    return next;
                  });
                };

                return (
                  <div key={contract.id} className={`rounded-xl border-2 overflow-hidden ${isDraft ? 'border-primary/20' : 'border-muted'} ${!isDraft ? 'opacity-70' : ''}`}>
                    <div
                      className={`flex items-center justify-between p-3 ${isDraft ? 'bg-primary/5' : 'bg-muted/30'} ${isCollapsible ? 'cursor-pointer' : ''}`}
                      onClick={isCollapsible ? toggleExpand : undefined}
                    >
                      <div className="flex items-center gap-3">
                        {isCollapsible && (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Package className={`h-5 w-5 ${isDraft ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-semibold">
                            {contract.contract_number || `Contrato Rascunho #${idx + 1}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {group.leads.length} serviço{group.leads.length !== 1 ? 's' : ''}
                            {contract.total_fee ? ` • € ${Number(contract.total_fee).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={contract.status || 'EM_ELABORACAO'} label={statusLabel} />
                        {isDraft && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAddServiceToContractId(contract.id);
                                setEditPaymentData(null);
                                setShowPaymentAgreement(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Adicionar Serviço
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isFinalizingContract}
                              onClick={() => handleFinalizeContract(contract.id)}
                            >
                              {isFinalizingContract ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                              )}
                              Concluir
                            </Button>
                          </>
                        )}
                        {!isDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/contracts/${contract.id}`)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Ver Contrato
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-3 space-y-3">
                        {group.leads.map(lead => renderLeadItem(lead, { 
                          contractId: isDraft ? contract.id : undefined,
                          editable: isDraft,
                        }))}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Agreement Dialog */}
      <PaymentAgreementDialog
        open={showPaymentAgreement}
        onOpenChange={async (open) => {
          if (!open) {
            // If we were adding a service to a specific contract, link new leads
            if (addServiceToContractId) {
              // Wait a moment for queries to settle, then find newly created leads not yet linked
              await new Promise(r => setTimeout(r, 500));
              const { data: currentLinks } = await supabase
                .from('contract_leads')
                .select('lead_id')
                .eq('contract_id', addServiceToContractId);
              const linkedIds = new Set(currentLinks?.map(cl => cl.lead_id) || []);
              
              // Refresh leads for this contact
              const { data: freshLeads } = await supabase
                .from('leads')
                .select('id')
                .eq('contact_id', contactId)
                .order('created_at', { ascending: false });
              
              const newLeads = (freshLeads || []).filter(l => !linkedIds.has(l.id));
              if (newLeads.length > 0) {
                // Link the most recently created lead (the one just added)
                await supabase.from('contract_leads').upsert(
                  [{ contract_id: addServiceToContractId, lead_id: newLeads[0].id }],
                  { onConflict: 'contract_id,lead_id' }
                );
                queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
                queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
                queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
              }
              setAddServiceToContractId(null);
            }
            setEditPaymentData(null);
          }
          setShowPaymentAgreement(open);
        }}
        contactId={contactId}
        contactName={contactName}
        initialData={editPaymentData}
      />

      {/* Delete/Archive Confirmation */}
      <Dialog open={!!deleteServiceLead} onOpenChange={(open) => !open && setDeleteServiceLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteServiceLead && hasProtectedContract(deleteServiceLead.id)
                ? 'Arquivar Serviço'
                : 'Excluir Serviço'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {deleteServiceLead && hasProtectedContract(deleteServiceLead.id) ? (
              <p className="text-sm text-muted-foreground">
                Este serviço possui contrato aprovado, assinado ou cancelado e não pode ser excluído.
                Deseja arquivá-lo?
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tem certeza que deseja excluir este serviço? Todos os pagamentos e oportunidades vinculados serão removidos permanentemente.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteServiceLead(null)} disabled={isDeletingService}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteService(deleteServiceLead)}
              disabled={isDeletingService}
            >
              {isDeletingService && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteServiceLead && hasProtectedContract(deleteServiceLead.id) ? 'Arquivar' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
