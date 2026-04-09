import { useState, useMemo, useCallback } from 'react';
import { TitularLink } from '@/hooks/useContactBeneficiaries';
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
  Briefcase, CreditCard, DollarSign, Loader2, Plus, Pencil, Trash2, CheckCircle2, FileText, Package, ChevronRight, ChevronDown, User, Users, Clock, Play
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
  isBeneficiary?: boolean;
  titulares?: TitularLink[];
}

export function ContractGroupsSection({
  contactId,
  contactName,
  contactLeads,
  paymentNotes,
  confirmedLeadIds,
  navigate,
  beneficiaryContacts = [],
  isBeneficiary = false,
  titulares = [],
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
  const [showTitularPicker, setShowTitularPicker] = useState(false);
  const [pendingLeadsToLink, setPendingLeadsToLink] = useState<any[]>([]);

  // Resolve which titular to use — if only one, use it directly
  const titularContactId = titulares.length === 1 ? (titulares[0].contact_id || null) : null;
  const titularContactName = titulares.length === 1 ? titulares[0].full_name : null;
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

  // Fetch titular's draft contracts when this is a beneficiary view
  const { data: titularDraftContracts = [] } = useQuery({
    queryKey: ['titular-draft-contracts', titularContactId, titulares.map(t => t.contact_id).join(',')],
    queryFn: async () => {
      // Get all titular contact IDs
      const titularIds = titulares.map(t => t.contact_id).filter(Boolean) as string[];
      if (titularIds.length === 0) return [];
      // Get all titulars' leads
      const { data: allTitularLeads } = await supabase
        .from('leads')
        .select('id')
        .in('contact_id', titularIds);
      if (!allTitularLeads?.length) return [];
      // Get their opportunities
      const { data: titularOpps } = await supabase
        .from('opportunities')
        .select('id, lead_id')
        .in('lead_id', allTitularLeads.map(l => l.id));
      if (!titularOpps?.length) return [];
      // Get draft contracts
      const { data: drafts } = await supabase
        .from('contracts')
        .select('id, contract_number, status, opportunity_id, created_at')
        .in('opportunity_id', titularOpps.map(o => o.id))
        .eq('status', 'EM_ELABORACAO')
        .order('created_at', { ascending: false });
      // Also check contract_leads for draft contracts linked to titular's leads
      const { data: titularContractLinks } = await supabase
        .from('contract_leads')
        .select('contract_id, contracts(id, contract_number, status, opportunity_id, created_at)')
        .in('lead_id', allTitularLeads.map(l => l.id));
      const draftFromLinks = (titularContractLinks || [])
        .filter((cl: any) => cl.contracts?.status === 'EM_ELABORACAO')
        .map((cl: any) => cl.contracts);
      // Merge and deduplicate
      const allDrafts = [...(drafts || []), ...draftFromLinks];
      const seen = new Set<string>();
      return allDrafts.filter(d => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
    },
    enabled: isBeneficiary && titulares.length > 0,
  });

  // Fetch payments for this contact
  const { data: contactPayments = [] } = useQuery({
    queryKey: ['contact-payments', contactId, isBeneficiary],
    queryFn: async () => {
      if (!contactId) return [];

      // Payments via own leads → opportunities
      let ownPayments: any[] = [];
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', contactId);
      if (cLeads?.length) {
        const { data: opps } = await supabase.from('opportunities').select('id').in('lead_id', cLeads.map(l => l.id));
        if (opps?.length) {
          const { data: payments } = await supabase
            .from('payments')
            .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest)), beneficiary:beneficiary_contact_id(id, full_name)')
            .in('opportunity_id', opps.map(o => o.id))
            .order('due_date', { ascending: true });
          ownPayments = payments || [];
        }
      }

      // If beneficiary, also fetch payments linked via beneficiary_contact_id
      let benefPayments: any[] = [];
      if (isBeneficiary) {
        const { data: bPayments } = await supabase
          .from('payments')
          .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest)), beneficiary:beneficiary_contact_id(id, full_name)')
          .eq('beneficiary_contact_id', contactId)
          .order('due_date', { ascending: true });
        benefPayments = bPayments || [];
      }

      // Merge and deduplicate
      const allPayments = [...ownPayments, ...benefPayments];
      const seen = new Set<string>();
      return allPayments.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
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

    return Object.values(groups).sort((a, b) => {
      const dateA = a.contract?.created_at ? new Date(a.contract.created_at).getTime() : 0;
      const dateB = b.contract?.created_at ? new Date(b.contract.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [allContractLeadLinks, contactContracts, allLeads, deduplicatedPayments]);

  // Ungrouped leads (not linked to any contract)
  const groupedLeadIds = new Set(contractGroups.flatMap(g => g.leads.map(l => l.id)));
  const allUngroupedLeads = allLeads.filter(l => !groupedLeadIds.has(l.id));
  const ungroupedLeads = allUngroupedLeads.filter(l => l.status !== 'STANDBY');
  const standbyLeads = allUngroupedLeads.filter(l => l.status === 'STANDBY');

  // Ungrouped payments
  const groupedPaymentIds = new Set(contractGroups.flatMap(g => g.payments.map(p => p.id)));
  const ungroupedPayments = deduplicatedPayments.filter(p => !groupedPaymentIds.has(p.id));

  const getLeadDisplayName = useCallback((lead: any) => {
    const serviceTypeName = lead.service_type_id
      ? serviceTypes?.find(st => st.id === lead.service_type_id)?.name
      : null;
    return serviceTypeName || SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO'];
  }, [serviceTypes]);

  const extractLastNotes = (): string => {
    const notes = paymentNotes || '';
    if (!notes) return '';
    const blocks = notes.split('---');
    const lastBlock = blocks[blocks.length - 1] || '';
    const match = lastBlock.match(/Observações:\s*(.+?)(?:\n|$)/);
    return match ? match[1].trim() : '';
  };

  const parsedPaymentNoteBlocks = useMemo(() => {
    const notes = paymentNotes || '';
    if (!notes) {
      return [] as Array<{
        serviceName: string;
        grossAmount: number | null;
        totalFinal: number | null;
        fees: { description: string; amount: string }[];
      }>;
    }

    const ignoredPrefixes = [
      'Acordo de Pagamento',
      'Serviço',
      'Valor Bruto',
      'IVA',
      'Total',
      'Total Final',
      'Método',
      'Forma',
      'Parcelas',
      'Origem',
      'Conta',
      'Detalhe',
      'Observações',
      'Desconto',
      'Outros Custos',
    ];

    const parseMoneyValue = (line: string, label: string) => {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = line.match(new RegExp(`^${escapedLabel}:\\s*(?:[+\\-]\\s*)?€\\s*([\\d.,]+)`, 'i'));
      if (!match) return null;
      return Number(match[1].replace(',', '.'));
    };

    return notes
      .split('---')
      .map((rawBlock) => {
        const block = rawBlock.trim();
        if (!block) return null;

        const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
        const serviceName = lines.find(line => line.startsWith('Serviço:'))?.replace('Serviço:', '').trim() || '';
        const grossAmountLine = lines.find(line => line.startsWith('Valor Bruto:'));
        const totalFinalLine = lines.find(line => line.startsWith('Total Final:'));

        const fees: { description: string; amount: string }[] = [];
        for (const line of lines) {
          const feeMatch = line.match(/^(.+?):\s*\+\s*€\s*([\d.,]+)\s*$/);
          if (!feeMatch) continue;

          const desc = feeMatch[1].trim();
          if (ignoredPrefixes.some(prefix => desc.startsWith(prefix))) continue;

          fees.push({
            description: desc,
            amount: feeMatch[2].replace(',', '.'),
          });
        }

        return {
          serviceName,
          grossAmount: grossAmountLine ? parseMoneyValue(grossAmountLine, 'Valor Bruto') : null,
          totalFinal: totalFinalLine ? parseMoneyValue(totalFinalLine, 'Total Final') : null,
          fees,
        };
      })
      .filter((block): block is {
        serviceName: string;
        grossAmount: number | null;
        totalFinal: number | null;
        fees: { description: string; amount: string }[];
      } => Boolean(block));
  }, [paymentNotes]);

  const findNoteBlockForLead = useCallback((params: {
    serviceName: string;
    grossAmount: number | null;
    totalFinal: number | null;
    usedIndexes: Set<number>;
    preferLatest?: boolean;
  }) => {
    const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR');
    const amountsMatch = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 0.01;

    const candidates = parsedPaymentNoteBlocks
      .map((block, index) => ({ block, index }))
      .filter(({ block, index }) => !params.usedIndexes.has(index) && normalize(block.serviceName) === normalize(params.serviceName));

    const orderedCandidates = params.preferLatest ? [...candidates].reverse() : candidates;

    return orderedCandidates.find(({ block }) => amountsMatch(block.grossAmount, params.grossAmount) && amountsMatch(block.totalFinal, params.totalFinal))
      || orderedCandidates.find(({ block }) => amountsMatch(block.totalFinal, params.totalFinal))
      || orderedCandidates.find(({ block }) => amountsMatch(block.grossAmount, params.grossAmount))
      || orderedCandidates[0]
      || null;
  }, [parsedPaymentNoteBlocks]);

  const extractFeesFromNotes = useCallback((params: {
    serviceName: string;
    grossAmount: number | null;
    totalFinal: number | null;
    usedIndexes: Set<number>;
    preferLatest?: boolean;
  }) => {
    const match = findNoteBlockForLead(params);
    if (!match) return [] as { description: string; amount: string }[];

    params.usedIndexes.add(match.index);
    return match.block.fees;
  }, [findNoteBlockForLead]);

  const getLeadExpectedAmounts = useCallback((leadPayments: any[]) => {
    if (leadPayments.length === 0) {
      return { grossAmount: null, totalFinal: null };
    }

    if (leadPayments.length === 1) {
      const payment = leadPayments[0];
      return {
        grossAmount: Number(payment.gross_amount || payment.amount || 0),
        totalFinal: Number(payment.amount || 0),
      };
    }

    return {
      grossAmount: null,
      totalFinal: leadPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0),
    };
  }, []);

  // Helper: link beneficiary leads to a specific titular's draft or create new draft
  const linkLeadsToTitularContract = async (leadsToLink: any[], chosenTitularId: string, chosenTitularName?: string) => {
    if (!chosenTitularId || leadsToLink.length === 0) return;

    const leadIdsToLink = leadsToLink.map(l => l.id);

    // Check if this specific titular has an open draft contract
    const { data: thisLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_id', chosenTitularId);
    
    let draftContract: any = null;
    if (thisLeads?.length) {
      const { data: thisOpps } = await supabase
        .from('opportunities')
        .select('id')
        .in('lead_id', thisLeads.map(l => l.id));
      if (thisOpps?.length) {
        const { data: drafts } = await supabase
          .from('contracts')
          .select('id, contract_number, status, opportunity_id, created_at')
          .in('opportunity_id', thisOpps.map(o => o.id))
          .eq('status', 'EM_ELABORACAO')
          .order('created_at', { ascending: false })
          .limit(1);
        if (drafts?.length) draftContract = drafts[0];
      }
    }

    if (draftContract) {
      const links = leadIdsToLink.map(lid => ({
        contract_id: draftContract.id,
        lead_id: lid,
      }));
      const { error } = await supabase
        .from('contract_leads')
        .upsert(links, { onConflict: 'contract_id,lead_id' });
      if (error) throw error;
      toast({ title: 'Serviços adicionados ao contrato do titular', description: chosenTitularName || undefined });
    } else {
      // Create new draft under this titular
      const { data: titLeads } = await supabase
        .from('leads')
        .select('id, service_interest')
        .eq('contact_id', chosenTitularId)
        .order('created_at', { ascending: false })
        .limit(1);

      let opportunityId: string;
      if (titLeads?.length) {
        const { data: titOpps } = await supabase
          .from('opportunities')
          .select('id')
          .eq('lead_id', titLeads[0].id)
          .limit(1);
        if (titOpps?.length) {
          opportunityId = titOpps[0].id;
        } else {
          const { data: newOpp, error: oppErr } = await supabase
            .from('opportunities')
            .insert({ lead_id: titLeads[0].id })
            .select()
            .single();
          if (oppErr) throw oppErr;
          opportunityId = newOpp.id;
        }
      } else {
        const { data: benOpps } = await supabase
          .from('opportunities')
          .select('id')
          .eq('lead_id', leadIdsToLink[0])
          .limit(1);
        if (!benOpps?.length) {
          toast({ title: 'Nenhuma oportunidade encontrada', variant: 'destructive' });
          return;
        }
        opportunityId = benOpps[0].id;
      }

      const firstLead = leadsToLink[0];
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          opportunity_id: opportunityId,
          service_type: firstLead?.service_interest || 'OUTRO',
          status: 'EM_ELABORACAO',
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      if (contractError) throw contractError;

      const links = leadIdsToLink.map(lid => ({
        contract_id: contract.id,
        lead_id: lid,
      }));
      const { error: linkError } = await supabase
        .from('contract_leads')
        .insert(links);
      if (linkError) throw linkError;

      toast({ title: 'Novo contrato criado no titular', description: chosenTitularName || undefined });
    }

    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
    queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
    queryClient.invalidateQueries({ queryKey: ['contracts'] });
    queryClient.invalidateQueries({ queryKey: ['titular-draft-contracts'] });
    queryClient.invalidateQueries({ queryKey: ['contract-leads', chosenTitularId] });
    queryClient.invalidateQueries({ queryKey: ['contact-contracts', chosenTitularId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups', chosenTitularId] });
    queryClient.invalidateQueries({ queryKey: ['beneficiary-contract-leads', chosenTitularId] });
  };

  // Helper: start the beneficiary→titular flow, showing picker if multiple titulars
  const startBeneficiaryContractFlow = (leadsToLink: any[]) => {
    if (titulares.length === 1 && titulares[0].contact_id) {
      return linkLeadsToTitularContract(leadsToLink, titulares[0].contact_id, titulares[0].full_name);
    } else if (titulares.length > 1) {
      setPendingLeadsToLink(leadsToLink);
      setShowTitularPicker(true);
      return Promise.resolve();
    }
    toast({ title: 'Nenhum titular vinculado', variant: 'destructive' });
    return Promise.resolve();
  };

  // Create a new draft contract and link selected leads
  const handleCreateContractGroup = async () => {
    if (selectedLeadIds.size === 0) {
      toast({ title: 'Selecione ao menos um serviço', variant: 'destructive' });
      return;
    }

    setIsCreatingContract(true);
    try {
      // If beneficiary, redirect to titular's contract
      if (isBeneficiary && titulares.length > 0) {
        const leadsToLink = contactLeads.filter(l => selectedLeadIds.has(l.id));
        await startBeneficiaryContractFlow(leadsToLink);
        setSelectedLeadIds(new Set());
        return;
      }

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

      // Check if there's already an active contract linked to any of the selected leads
      const selectedIds = Array.from(selectedLeadIds);
      const { data: existingLinks } = await supabase
        .from('contract_leads')
        .select('contract_id, contracts:contract_id(id, status)')
        .in('lead_id', selectedIds);
      
      const hasActiveContract = existingLinks?.some((link: any) => 
        link.contracts && link.contracts.status !== 'CANCELADO'
      );
      
      if (hasActiveContract) {
        toast({ title: 'Contrato já existe', description: 'Um dos serviços selecionados já está vinculado a um contrato ativo.', variant: 'destructive' });
        setIsCreatingContract(false);
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
      // Refresh session to ensure valid token
      await supabase.auth.refreshSession();

      const { data, error } = await supabase.functions.invoke('delete-service', {
        body: { lead_id: lead.id },
      });

      if (error) throw error;

      toast({
        title: data?.action === 'archived' ? 'Serviço arquivado' : 'Serviço excluído com sucesso',
      });

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

  // Helper: open person selector or directly open payment dialog
  const handleAddServiceClick = (contractId?: string | null) => {
    if (beneficiaryContacts.length > 0) {
      setPendingAddServiceContractId(contractId ?? null);
      setShowPersonSelector(true);
    } else {
      setAddServiceToContractId(contractId ?? null);
      setEditPaymentData(null);
      setSelectedBeneficiaryId(null);
      setSelectedBeneficiaryName('');
      setShowPaymentAgreement(true);
    }
  };

  const handlePersonSelected = (personId: string | null, personName: string) => {
    setSelectedBeneficiaryId(personId);
    setSelectedBeneficiaryName(personName);
    setAddServiceToContractId(pendingAddServiceContractId ?? null);
    setEditPaymentData(null);
    setShowPersonSelector(false);
    setShowPaymentAgreement(true);
  };

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
                leadId: leadData?.id,
                opportunityId: payment.opportunity_id,
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
    const leadPayments = deduplicatedPayments.filter((p: any) => {
      const pLeadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
      return pLeadId === lead.id;
    });
    const allPaymentsPaid = leadPayments.length > 0 && leadPayments.every((p: any) => p.status === 'CONFIRMADO');

    // Detect if this lead serves a beneficiary (payment.beneficiary_contact_id differs from contactId)
    const beneficiaryPayment = !lead._isBeneficiary
      ? leadPayments.find((p: any) => p.beneficiary_contact_id && p.beneficiary_contact_id !== contactId)
      : null;
    const beneficiaryNameFromPayment = beneficiaryPayment
      ? (beneficiaryPayment as any).beneficiary?.full_name
        || beneficiaryContacts.find(b => b.id === beneficiaryPayment.beneficiary_contact_id)?.full_name
        || null
      : null;

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
              <p className={`font-medium ${isServiceCompleted ? 'text-muted-foreground' : ''}`}>
                {displayName}
                {(lead._isBeneficiary || beneficiaryNameFromPayment) && (
                  <Badge variant="outline" className="ml-2 text-xs border-primary/30 text-primary bg-primary/5">
                    Beneficiário - {lead._beneficiaryName || beneficiaryNameFromPayment || ''}
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                Criado em {format(new Date(lead.created_at!), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isServiceCompleted && <StatusBadge variant="success" label="Concluído" />}
            {allPaymentsPaid && leadPayments.length > 0 && <StatusBadge variant="success" label="Quitado" />}
            {lead.status === 'STANDBY' && (
              <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-100">
                <Clock className="h-3 w-3 mr-1" />
                Serviço Futuro
              </Badge>
            )}
            {!isServiceCompleted && lead.status !== 'STANDBY' && (
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
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    const leadPayment = leadPayments[0];
                    if (leadPayment) {
                      const groupPayments = leadPayments.filter((p: any) => p.payment_form === 'PARCELADO');
                      const installments = groupPayments.length > 1
                        ? groupPayments.map((p: any) => ({ amount: p.amount?.toString() || '', due_date: p.due_date || '' }))
                        : [];
                      setEditPaymentData({
                        amount: leadPayment.amount,
                        payment_method: leadPayment.payment_method,
                        payment_form: leadPayment.payment_form,
                        apply_vat: leadPayment.apply_vat,
                        vat_rate: leadPayment.vat_rate,
                        discount_type: leadPayment.discount_type,
                        discount_value: leadPayment.discount_value,
                        gross_amount: leadPayment.gross_amount,
                        serviceTypeId: lead.service_type_id || '',
                        installments,
                        notes: paymentNotes || '',
                        leadId: lead.id,
                        opportunityId: leadPayment.opportunity_id,
                      });
                    } else {
                      setEditPaymentData({
                        amount: 0,
                        serviceTypeId: lead.service_type_id || '',
                        notes: paymentNotes || '',
                        leadId: lead.id,
                      });
                    }
                    setShowPaymentAgreement(true);
                  }}
                  title="Editar serviço"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
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
              </>
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

  const totalServices = allLeads.length;

  // Build dynamic summary from actual lead + payment data (not static payment_notes text)
  const lastGroupNotes = useMemo(() => {
    // Determine which leads belong to the "latest pending group"
    let relevantLeads: any[] = [];

    if (ungroupedLeads.length > 0) {
      relevantLeads = ungroupedLeads;
    } else {
      const sortedGroups = [...contractGroups].sort((a, b) => {
        const dateA = a.contract?.created_at ? new Date(a.contract.created_at).getTime() : 0;
        const dateB = b.contract?.created_at ? new Date(b.contract.created_at).getTime() : 0;
        return dateB - dateA;
      });
      const latestGroup = sortedGroups[0];
      const latestStatus = latestGroup?.contract?.status;
      const isFinalized = latestStatus && ['APROVADO', 'ASSINADO', 'CANCELADO', 'REPROVADO'].includes(latestStatus);

      if (!isFinalized && latestGroup) {
        relevantLeads = latestGroup.leads || [];
      } else {
        return '';
      }
    }

    if (relevantLeads.length === 0) return '';

    // For each relevant lead, find its payments and build a summary block
    const blocks: string[] = [];
    const sortedRelevantLeads = [...relevantLeads].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });

    const usedNoteIndexes = new Set<number>();
    const leadFeesById = new Map<string, { description: string; amount: string }[]>();

    [...sortedRelevantLeads].reverse().forEach((lead) => {
      const displayName = getLeadDisplayName(lead);
      const leadPayments = deduplicatedPayments.filter((p: any) => {
        const pLeadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
        return pLeadId === lead.id;
      });
      const { grossAmount, totalFinal } = getLeadExpectedAmounts(leadPayments);

      leadFeesById.set(lead.id, extractFeesFromNotes({
        serviceName: displayName,
        grossAmount,
        totalFinal,
        usedIndexes: usedNoteIndexes,
        preferLatest: true,
      }));
    });

    for (const lead of sortedRelevantLeads) {
      const displayName = getLeadDisplayName(lead);
      const createdDate = lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '';

      // Find payments for this lead via opportunities
      const leadPayments = deduplicatedPayments.filter((p: any) => {
        const pLeadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
        return pLeadId === lead.id;
      });
      const leadFees = leadFeesById.get(lead.id) || [];

      let block = `Acordo de Pagamento — ${createdDate}\n`;
      block += `Serviço: ${displayName}\n`;

      if (leadPayments.length === 0) {
        block += `Sem pagamentos registrados`;
      } else if (leadPayments.length === 1) {
        const p = leadPayments[0];
        const currency = p.currency || 'EUR';
        const symbol = currency === 'EUR' ? '€' : currency;
        block += `Valor Bruto: ${symbol} ${Number(p.gross_amount || p.amount).toFixed(2)}\n`;
        if (p.vat_amount && Number(p.vat_amount) > 0) {
          block += `IVA (${p.vat_rate || 21}%): + ${symbol} ${Number(p.vat_amount).toFixed(2)}\n`;
        }
        if (leadFees.length > 0) {
          block += `Outros Custos:\n`;
          leadFees.forEach(fee => {
            block += `  ${fee.description}: + ${symbol} ${Number(fee.amount).toFixed(2)}\n`;
          });
        }
        if (p.discount_value && Number(p.discount_value) > 0) {
          const discLabel = p.discount_type === 'PERCENTUAL' ? ` (${p.discount_value}%)` : '';
          block += `Desconto: - ${symbol} ${Number(p.discount_value).toFixed(2)}${discLabel}\n`;
        }
        block += `Total Final: ${symbol} ${Number(p.amount).toFixed(2)}\n`;
        if (p.payment_method) {
          const methodLabels: Record<string, string> = {
            'TRANSFERENCIA': 'Transferência', 'PIX': 'PIX', 'CARTAO': 'Cartão',
            'DINHEIRO': 'Dinheiro', 'MB_WAY': 'MB Way', 'BIZUM': 'Bizum', 'OUTRO': 'Outro'
          };
          block += `Método: ${methodLabels[p.payment_method] || p.payment_method}\n`;
        }
        if (p.payment_form) {
          const formLabels: Record<string, string> = { 'UNICO': 'Pagamento Único', 'PARCELADO': 'Parcelado', 'RECORRENTE': 'Recorrente' };
          block += `Forma: ${formLabels[p.payment_form] || p.payment_form}`;
        }
      } else {
        // Multiple installments
        const total = leadPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
        const currency = leadPayments[0]?.currency || 'EUR';
        const symbol = currency === 'EUR' ? '€' : currency;
        if (leadFees.length > 0) {
          block += `Outros Custos:\n`;
          leadFees.forEach(fee => {
            block += `  ${fee.description}: + ${symbol} ${Number(fee.amount).toFixed(2)}\n`;
          });
        }
        block += `Total Final: ${symbol} ${total.toFixed(2)}\n`;
        block += `Parcelas: ${leadPayments.length}x\n`;
        leadPayments.forEach((p: any, idx: number) => {
          const dateStr = p.due_date ? format(new Date(p.due_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) : 'A definir';
          block += `  ${idx + 1}ª: ${symbol} ${Number(p.amount).toFixed(2)} — Venc: ${dateStr}\n`;
        });
      }

      blocks.push(block.trim());
    }

    return blocks.join('\n\n');
  }, [contractGroups, ungroupedLeads, deduplicatedPayments, getLeadDisplayName, extractFeesFromNotes, getLeadExpectedAmounts]);

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
              Novo Serviço
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Beneficiary info banner */}
          {isBeneficiary && titulares.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <span>
                Contratos deste beneficiário são geridos {titulares.length === 1 ? 'pelo titular: ' : 'pelos titulares: '}
                {titulares.map((t, i) => (
                  <span key={t.contact_id || i}>
                    {i > 0 && ', '}
                    <strong 
                      className="cursor-pointer hover:underline"
                      onClick={() => t.contact_id && navigate(`/crm/contacts/${t.contact_id}`)}
                    >{t.full_name}</strong>
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Last payment agreement group notes */}
          {lastGroupNotes ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-line">
              {lastGroupNotes}
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
                        onClick={() => handleAddServiceClick(null)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Serviço
                      </Button>
                      {!isBeneficiary && (
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
                      )}
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

              {/* Standby Services */}
              {standbyLeads.length > 0 && (
                <div className="rounded-xl border-2 border-dashed border-amber-300 overflow-hidden bg-amber-50/50">
                  <div className="flex items-center justify-between p-3 bg-amber-100/50">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-semibold text-amber-800">
                          Serviços Futuros (Standby)
                        </p>
                        <p className="text-sm text-amber-600">
                          {standbyLeads.length} serviço{standbyLeads.length !== 1 ? 's' : ''} aguardando ativação
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-3">
                    {standbyLeads.map(lead => {
                      const displayName = getLeadDisplayName(lead);
                      const standbyPayments = deduplicatedPayments.filter((p: any) => {
                        const pLeadId = p.opportunities?.leads?.id || p.opportunities?.lead_id;
                        return pLeadId === lead.id;
                      });
                      const standbyBenefPayment = !(lead as any)._isBeneficiary
                        ? standbyPayments.find((p: any) => p.beneficiary_contact_id && p.beneficiary_contact_id !== contactId)
                        : null;
                      const standbyBenefName = standbyBenefPayment
                        ? (standbyBenefPayment as any).beneficiary?.full_name
                          || beneficiaryContacts.find(b => b.id === standbyBenefPayment.beneficiary_contact_id)?.full_name
                          || null
                        : null;
                      return (
                        <div key={lead.id} className="rounded-lg border border-amber-200 bg-background overflow-hidden">
                          <div className="flex items-center justify-between p-3">
                            <div
                              className="cursor-pointer flex-1"
                              onClick={() => navigate(`/crm/leads/${lead.id}`)}
                            >
                              <p className="font-medium">{displayName}
                                {((lead as any)._isBeneficiary || standbyBenefName) && (
                                  <Badge variant="outline" className="ml-2 text-xs border-primary/30 text-primary bg-primary/5">
                                    Beneficiário - {(lead as any)._beneficiaryName || standbyBenefName || ''}
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Criado em {format(new Date(lead.created_at!), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                                Serviço Futuro
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-primary"
                                onClick={async () => {
                                  try {
                                    await supabase.from('leads').update({ status: 'INTERESSE_PENDENTE' }).eq('id', lead.id);
                                    queryClient.invalidateQueries({ queryKey: ['leads'] });
                                    queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups', contactId] });
                                    toast({ title: 'Serviço ativado com sucesso' });
                                  } catch (error: any) {
                                    toast({ title: 'Erro', description: error.message, variant: 'destructive' });
                                  }
                                }}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Ativar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteServiceLead(lead);
                                }}
                                title="Excluir serviço"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                          editable: false,
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

      {/* Person Selector Dialog */}
      <Dialog open={showPersonSelector} onOpenChange={(open) => { if (!open) setShowPersonSelector(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Para quem é o serviço?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-auto py-3"
              onClick={() => handlePersonSelected(null, contactName)}
            >
              <User className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">{contactName}</p>
                <p className="text-xs text-muted-foreground">Titular</p>
              </div>
            </Button>
            {beneficiaryContacts.map(b => (
              <Button
                key={b.id}
                variant="outline"
                className="w-full justify-start gap-2 h-auto py-3"
                onClick={() => handlePersonSelected(b.id, b.full_name)}
              >
                <Users className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">{b.full_name}</p>
                  <p className="text-xs text-muted-foreground">Beneficiário</p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Agreement Dialog */}
      <PaymentAgreementDialog
        open={showPaymentAgreement}
        onOpenChange={async (open) => {
          if (!open) {
            const targetContactId = selectedBeneficiaryId || contactId;
            // If we were adding a service to a specific contract, link new leads
            if (addServiceToContractId) {
              // Wait for query cache to settle before checking new leads
              await queryClient.refetchQueries({ queryKey: ['leads'] });
              const { data: currentLinks } = await supabase
                .from('contract_leads')
                .select('lead_id')
                .eq('contract_id', addServiceToContractId);
              const linkedIds = new Set(currentLinks?.map(cl => cl.lead_id) || []);
              
              // Refresh leads for the target contact
              const { data: freshLeads } = await supabase
                .from('leads')
                .select('id')
                .eq('contact_id', targetContactId)
                .order('created_at', { ascending: false });
              
              const newLeads = (freshLeads || []).filter(l => !linkedIds.has(l.id));
              if (newLeads.length > 0) {
                await supabase.from('contract_leads').upsert(
                  [{ contract_id: addServiceToContractId, lead_id: newLeads[0].id }],
                  { onConflict: 'contract_id,lead_id' }
                );
                queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
                queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
                queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
                queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups', contactId] });
                queryClient.invalidateQueries({ queryKey: ['beneficiary-contract-leads', contactId] });
                queryClient.invalidateQueries({ queryKey: ['beneficiary-payments-in-groups', contactId] });
              }
              setAddServiceToContractId(null);
            }
            setEditPaymentData(null);
            setSelectedBeneficiaryId(null);
            setSelectedBeneficiaryName('');
            // Invalidate all relevant queries for beneficiary and titular views
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['contact-leads', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact-payments', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contact-contracts', contactId] });
            queryClient.invalidateQueries({ queryKey: ['contract-leads', contactId] });
            queryClient.invalidateQueries({ queryKey: ['beneficiary-leads-in-groups'] });
            queryClient.invalidateQueries({ queryKey: ['beneficiary-contract-leads'] });
            queryClient.invalidateQueries({ queryKey: ['beneficiary-payments-in-groups'] });
            queryClient.invalidateQueries({ queryKey: ['titular-draft-contracts'] });
            queryClient.invalidateQueries({ queryKey: ['opportunities'] });
          }
          setShowPaymentAgreement(open);
        }}
        contactId={selectedBeneficiaryId || contactId}
        contactName={selectedBeneficiaryName || contactName}
        initialData={editPaymentData}
        isBeneficiary={!!selectedBeneficiaryId || isBeneficiary}
        titulares={titulares}
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

      {/* Titular Picker Dialog — shown when beneficiary has multiple titulars */}
      <Dialog open={showTitularPicker} onOpenChange={setShowTitularPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Titular</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Este beneficiário está vinculado a múltiplos titulares. Selecione em qual titular o contrato será criado:
          </p>
          <div className="space-y-2">
            {titulares.map((t, idx) => (
              <Button
                key={t.contact_id || idx}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={async () => {
                  setShowTitularPicker(false);
                  if (!t.contact_id) return;
                  setIsCreatingContract(true);
                  try {
                    await linkLeadsToTitularContract(pendingLeadsToLink, t.contact_id, t.full_name);
                    setSelectedLeadIds(new Set());
                  } catch (error: any) {
                    toast({ title: 'Erro ao vincular ao titular', description: error.message, variant: 'destructive' });
                  } finally {
                    setIsCreatingContract(false);
                    setPendingLeadsToLink([]);
                  }
                }}
              >
                <User className="h-4 w-4" />
                {t.full_name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
