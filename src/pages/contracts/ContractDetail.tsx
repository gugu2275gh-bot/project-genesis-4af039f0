import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContract, useContracts } from '@/hooks/useContracts';
import { useQuery } from '@tanstack/react-query';
import { useProfiles } from '@/hooks/useProfiles';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArrowLeft, Send, Check, Save, X, Calendar, FileText, Upload, FileCheck, Loader2, User, Phone, MapPin, CreditCard, Pause, Play, AlertTriangle } from 'lucide-react';
import { CONTRACT_STATUS_LABELS, SERVICE_INTEREST_LABELS, LANGUAGE_LABELS, CONTRACT_TEMPLATE_LABELS, ContractTemplate, PAYMENT_METHOD_LABELS, PAYMENT_ACCOUNT_LABELS, PAYMENT_FORM_LABELS, PaymentAccount } from '@/types/database';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ContractCostsSection } from '@/components/contracts/ContractCostsSection';
import { ContractNotesSection } from '@/components/contracts/ContractNotesSection';
import { supabase } from '@/integrations/supabase/client';
import { useBeneficiaries } from '@/hooks/useBeneficiaries';
import { BeneficiaryData, BankAccountData, PaymentData } from '@/lib/generate-contract';
import { SERVICE_INTEREST_LABELS as SIL } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { ContractPreview, ContractPreviewEditData } from '@/components/contracts/ContractPreview';
import { Eye } from 'lucide-react';
export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contract, isLoading } = useContract(id);
  const { updateContract, sendForApproval, markAsSigned, cancelContract, suspendContract, reactivateContract, approveContract, rejectContract } = useContracts();
  const { data: profiles = [] } = useProfiles();
  const { beneficiaries } = useBeneficiaries(id);

  // Fetch payment accounts and payments for contract preview
  const { data: paymentAccounts } = useQuery({
    queryKey: ['payment-accounts-for-contract', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_accounts').select('*').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch all leads linked to this contract via contract_leads (with service type names and contact info)
  const { data: contractLeadLinks } = useQuery({
    queryKey: ['contract-lead-links', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('contract_leads')
        .select('lead_id, leads:lead_id(id, contact_id, service_type_id, service_interest, service_types:service_type_id(name))')
        .eq('contract_id', id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch payment_notes from all contacts linked to this contract's leads (titular + beneficiaries)
  const allLinkedContactIds = useMemo(() => {
    if (!contractLeadLinks) return [];
    const ids = new Set<string>();
    contractLeadLinks.forEach((cl: any) => {
      const contactId = cl.leads?.contact_id;
      if (contactId) ids.add(contactId);
    });
    return Array.from(ids);
  }, [contractLeadLinks]);

  const { data: allLinkedContactNotes } = useQuery({
    queryKey: ['contract-linked-contact-notes', id, allLinkedContactIds],
    queryFn: async () => {
      if (allLinkedContactIds.length === 0) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('id, payment_notes')
        .in('id', allLinkedContactIds);
      if (error) throw error;
      return data || [];
    },
    enabled: allLinkedContactIds.length > 0,
  });

  // Fetch all opportunity IDs for linked leads
  const { data: linkedOpportunityIds } = useQuery({
    queryKey: ['contract-linked-opportunities', id, contractLeadLinks],
    queryFn: async () => {
      const leadIds = contractLeadLinks?.map(cl => cl.lead_id) || [];
      if (leadIds.length === 0) return [];
      const { data, error } = await supabase
        .from('opportunities')
        .select('id')
        .in('lead_id', leadIds);
      if (error) throw error;
      return data?.map(o => o.id) || [];
    },
    enabled: !!contractLeadLinks && contractLeadLinks.length > 0,
  });

  const { data: contractPayments } = useQuery({
    queryKey: ['contract-payments', id, linkedOpportunityIds],
    queryFn: async () => {
      if (!id) return [];
      
      // Fetch payments linked to this contract directly OR via linked opportunities from contract_leads
      const orConditions = [`contract_id.eq.${id}`];
      if (linkedOpportunityIds && linkedOpportunityIds.length > 0) {
        linkedOpportunityIds.forEach(oppId => orConditions.push(`opportunity_id.eq.${oppId}`));
      }
      
      const { data, error } = await supabase
        .from('payments')
        .select('*, beneficiary_contact:beneficiary_contact_id(full_name, document_type, document_number), opportunities:opportunity_id(id, lead_id, leads:lead_id(id, service_type_id, service_interest))')
        .or(orConditions.join(','));
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch service cases for beneficiaries
  const { data: serviceCases } = useQuery({
    queryKey: ['beneficiary-service-cases', id],
    queryFn: async () => {
      const benWithCases = beneficiaries?.filter(b => b.service_case_id) || [];
      if (benWithCases.length === 0) return [];
      const ids = benWithCases.map(b => b.service_case_id!);
      const { data, error } = await supabase.from('service_cases').select('id, service_type').in('id', ids);
      if (error) throw error;
      return data;
    },
    enabled: (beneficiaries?.length ?? 0) > 0,
  });
  
  const [formData, setFormData] = useState({
    scope_summary: '',
    total_fee: '',
    installment_conditions: '',
    refund_policy_text: '',
    language: 'pt',
    installment_count: '1',
    installment_amount: '',
    first_due_date: '',
    contract_template: 'NACIONALIDADE',
    status: 'EM_ELABORACAO',
    // New fields
    contract_number: '',
    assigned_to_user_id: '',
    down_payment: '',
    down_payment_date: '',
    payment_method: 'TRANSFERENCIA',
    payment_account: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  
  // State for suspension
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');
  
  // State for signed document upload
  const [signedDocumentFile, setSignedDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [signedDocumentUrl, setSignedDocumentUrl] = useState<string | null>(null);
  const { toast } = useToast();
  
  // State for sign with upload dialog
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signDialogFile, setSignDialogFile] = useState<File | null>(null);
  const [isSigningWithUpload, setIsSigningWithUpload] = useState(false);
  
  // State for reject dialog
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Get assigned user name for display
  const assignedUser = profiles.find(p => p.id === (contract as any)?.assigned_to_user_id);

  const generatedPaymentDetails = useMemo(() => {
    if (!contractPayments || contractPayments.length === 0) return '';

    const currency = contract?.currency || 'EUR';
    const formatMoney = (value?: number | null) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return null;
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
      }).format(value);
    };

    // Sort: titular payments first (no beneficiary_contact_id), then beneficiaries
    const sortedPayments = [...contractPayments].sort((a: any, b: any) => {
      const aIsBen = !!a.beneficiary_contact_id;
      const bIsBen = !!b.beneficiary_contact_id;
      if (aIsBen !== bIsBen) return aIsBen ? 1 : -1;
      return 0;
    });

    return sortedPayments
      .map((payment: any) => {
        const leadId = payment.opportunities?.leads?.id || payment.opportunities?.lead_id;
        const linkedLead = contractLeadLinks?.find((cl: any) => cl.lead_id === leadId)?.leads;
        const serviceName =
          linkedLead?.service_types?.name ||
          (linkedLead?.service_interest
            ? SERVICE_INTEREST_LABELS[linkedLead.service_interest as keyof typeof SERVICE_INTEREST_LABELS]
            : null) ||
          'Serviço';

        const beneficiaryName = payment.beneficiary_contact?.full_name;
        const serviceLabel = beneficiaryName
          ? `${serviceName} para ${beneficiaryName}`
          : serviceName;

        const lines: string[] = [];
        const agreementDate = payment.created_at || payment.due_date;
        if (agreementDate) {
          lines.push(`Acordo de Pagamento — ${format(new Date(agreementDate), 'dd/MM/yyyy', { locale: ptBR })}`);
        }

        lines.push(`Serviço: ${serviceLabel}`);

        const grossAmount = payment.gross_amount ?? payment.amount;
        const formattedGrossAmount = formatMoney(grossAmount);
        if (formattedGrossAmount) {
          lines.push(`Valor Bruto: ${formattedGrossAmount}`);
        }

        if (payment.vat_amount && Number(payment.vat_amount) > 0) {
          const formattedVatAmount = formatMoney(payment.vat_amount);
          if (formattedVatAmount) {
            const vatLabel = payment.vat_rate ? `IVA (${payment.vat_rate}%): + ` : 'IVA: + ';
            lines.push(`${vatLabel}${formattedVatAmount}`);
          }
        }

        if (payment.discount_value && Number(payment.discount_value) > 0) {
          const formattedDiscount = formatMoney(payment.discount_value);
          if (formattedDiscount) {
            lines.push(`Desconto: - ${formattedDiscount}`);
          }
        }

        const totalFinal = payment.amount ?? grossAmount;
        const formattedTotalFinal = formatMoney(totalFinal);
        if (formattedTotalFinal) {
          lines.push(`Total Final: ${formattedTotalFinal}`);
        }

        if (payment.payment_method) {
          lines.push(
            `Método: ${PAYMENT_METHOD_LABELS[payment.payment_method as keyof typeof PAYMENT_METHOD_LABELS] || payment.payment_method}`
          );
        }

        if (payment.payment_form) {
          lines.push(
            `Forma: ${PAYMENT_FORM_LABELS[payment.payment_form as keyof typeof PAYMENT_FORM_LABELS] || payment.payment_form}`
          );
        }

        return lines.join('\n');
      })
      .join('\n---\n');
  }, [contract?.currency, contractLeadLinks, contractPayments]);

  // Fallback: filter payment_notes from linked contacts when there are no active payments yet
  const filteredPaymentNotes = useMemo(() => {
    if (!contract || !contractLeadLinks) return '';

    const activeServiceNames = new Set<string>();
    contractLeadLinks.forEach((cl: any) => {
      const lead = cl.leads;
      if (lead?.service_types?.name) {
        activeServiceNames.add(lead.service_types.name);
      }
    });

    const allNotes: string[] = [];
    (allLinkedContactNotes || []).forEach((contact: any) => {
      const rawNotes = contact.payment_notes || '';
      if (!rawNotes) return;

      const parts = rawNotes.split('\n---\n').filter(Boolean).map((p: string) => p.trim());
      const filtered = parts.filter((block: string) => {
        if (activeServiceNames.size === 0) return true;
        const serviceMatch = block.match(/Serviço:\s*(.+?)(?:\n|$)/);
        if (!serviceMatch) return true;
        return activeServiceNames.has(serviceMatch[1].trim());
      });

      allNotes.push(...filtered);
    });

    if (allNotes.length === 0) {
      const c = contract as any;
      const resolvedContact = Array.isArray(c?.opportunities?.leads?.contacts)
        ? c.opportunities.leads.contacts[0]
        : c?.opportunities?.leads?.contacts;
      const rawNotes = resolvedContact?.payment_notes || '';

      if (rawNotes) {
        const parts = rawNotes.split('\n---\n').filter(Boolean).map((p: string) => p.trim());
        const filtered = parts.filter((block: string) => {
          if (activeServiceNames.size === 0) return true;
          const serviceMatch = block.match(/Serviço:\s*(.+?)(?:\n|$)/);
          if (!serviceMatch) return true;
          return activeServiceNames.has(serviceMatch[1].trim());
        });
        allNotes.push(...filtered);
      }
    }

    return allNotes.join('\n---\n');
  }, [contract, contractLeadLinks, allLinkedContactNotes]);

  // Initialize form data when contract loads
  useEffect(() => {
    if (contract) {
      const c = contract as any;
      const installmentConditions = contract.installment_conditions || generatedPaymentDetails || filteredPaymentNotes || '';
      
      setFormData({
        scope_summary: contract.scope_summary || '',
        total_fee: contract.total_fee?.toString() || '',
        installment_conditions: installmentConditions,
        refund_policy_text: contract.refund_policy_text || '',
        language: contract.language || 'pt',
        installment_count: contract.installment_count?.toString() || '1',
        installment_amount: contract.installment_amount?.toString() || '',
        first_due_date: contract.first_due_date || '',
        contract_template: c.contract_template || 'GENERICO',
        status: contract.status || 'EM_ELABORACAO',
        contract_number: c.contract_number || '',
        assigned_to_user_id: c.assigned_to_user_id || '',
        down_payment: c.down_payment?.toString() || '',
        down_payment_date: c.down_payment_date || '',
        payment_method: c.payment_method || 'TRANSFERENCIA',
        payment_account: c.payment_account || '',
      });
      setSignedDocumentUrl(c.signed_document_url || null);
    }
  }, [contract, generatedPaymentDetails, filteredPaymentNotes]);

  // Auto-calculate installment amount when total or count changes
  useEffect(() => {
    const total = parseFloat(formData.total_fee);
    const count = parseInt(formData.installment_count);
    if (total > 0 && count > 0) {
      const amount = (total / count).toFixed(2);
      setFormData(prev => ({ ...prev, installment_amount: amount }));
    }
  }, [formData.total_fee, formData.installment_count]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 col-span-2" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contrato não encontrado</p>
        <Button variant="link" onClick={() => navigate('/contracts')}>
          Voltar para contratos
        </Button>
      </div>
    );
  }

  const handleSave = async () => {
    // Validação: se status é ASSINADO, precisa ter documento
    if (formData.status === 'ASSINADO' && !signedDocumentFile && !signedDocumentUrl) {
      toast({
        title: 'Documento obrigatório',
        description: 'É necessário anexar o contrato assinado para marcar como "Assinado".',
        variant: 'destructive',
      });
      return;
    }

    let documentUrl = signedDocumentUrl;

    // Se tem arquivo novo para upload
    if (signedDocumentFile && formData.status === 'ASSINADO') {
      setIsUploading(true);
      try {
        const fileExt = signedDocumentFile.name.split('.').pop();
        const filePath = `contracts/${contract.id}/signed-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('signed-contracts')
          .upload(filePath, signedDocumentFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('signed-contracts')
          .getPublicUrl(filePath);

        documentUrl = urlData.publicUrl;
      } catch (error: any) {
        toast({
          title: 'Erro no upload',
          description: error.message || 'Não foi possível enviar o documento. Tente novamente.',
          variant: 'destructive',
        });
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    await updateContract.mutateAsync({
      id: contract.id,
      scope_summary: formData.scope_summary,
      total_fee: formData.total_fee ? parseFloat(formData.total_fee) : null,
      installment_conditions: formData.installment_conditions,
      refund_policy_text: formData.refund_policy_text,
      language: formData.language as any,
      installment_count: parseInt(formData.installment_count) || 1,
      installment_amount: formData.installment_amount ? parseFloat(formData.installment_amount) : null,
      first_due_date: formData.first_due_date || null,
      contract_template: formData.contract_template,
      status: formData.status,
      signed_document_url: documentUrl,
      signed_at: formData.status === 'ASSINADO' ? new Date().toISOString() : contract.signed_at,
      // New fields
      contract_number: formData.contract_number || null,
      assigned_to_user_id: formData.assigned_to_user_id || null,
      down_payment: formData.down_payment ? parseFloat(formData.down_payment) : null,
      down_payment_date: formData.down_payment_date || null,
      payment_method: formData.payment_method,
      payment_account: formData.payment_account || null,
    } as any);
    
    setSignedDocumentFile(null);
    setIsEditing(false);
  };

  const handleSendForApproval = async () => {
    await sendForApproval.mutateAsync(contract.id);
  };

  const handleMarkAsSignedWithUpload = async () => {
    if (!signDialogFile) {
      toast({
        title: 'Documento obrigatório',
        description: 'É necessário anexar o contrato assinado.',
        variant: 'destructive',
      });
      return;
    }

    setIsSigningWithUpload(true);
    
    try {
      // 1. Upload do documento
      const fileExt = signDialogFile.name.split('.').pop();
      const filePath = `contracts/${contract.id}/signed-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('signed-contracts')
        .upload(filePath, signDialogFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('signed-contracts')
        .getPublicUrl(filePath);

      // 2. Atualizar contrato com URL do documento
      await updateContract.mutateAsync({
        id: contract.id,
        signed_document_url: urlData.publicUrl,
      } as any);

      // 3. Marcar como assinado (gera pagamentos)
      await markAsSigned.mutateAsync(contract.id);
      
      setShowSignDialog(false);
      setSignDialogFile(null);
    } catch (error: any) {
      toast({
        title: 'Erro ao processar assinatura',
        description: error.message || 'Não foi possível completar a operação.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningWithUpload(false);
    }
  };

  const handleCancel = async () => {
    if (!cancellationReason.trim()) return;
    await cancelContract.mutateAsync({ 
      id: contract.id, 
      reason: cancellationReason 
    });
    setShowCancelDialog(false);
    setCancellationReason('');
  };

  const handleSuspend = async () => {
    if (!suspensionReason.trim()) return;
    await suspendContract.mutateAsync({
      id: contract.id,
      reason: suspensionReason,
    });
    setShowSuspendDialog(false);
    setSuspensionReason('');
  };

  const handleReactivate = async () => {
    await reactivateContract.mutateAsync(contract.id);
  };

  const contractData = contract as any;
  const isSuspended = contractData.is_suspended === true;

  const canEdit = contract.status === 'EM_ELABORACAO';
  const canApprove = contract.status === 'EM_ELABORACAO';
  const canReject = contract.status === 'EM_ELABORACAO';
  const canSign = contract.status === 'APROVADO';
  const canDownloadContract = contract.status === 'APROVADO' || contract.status === 'ASSINADO';
  const canCancel = contract.status !== 'CANCELADO' && contract.status !== 'REPROVADO';
  const canSuspend = contract.status === 'ASSINADO' && !isSuspended;
  const canReactivate = isSuspended;

  // Generate preview of installments
  const installmentCount = parseInt(formData.installment_count) || 1;
  const installmentAmount = parseFloat(formData.installment_amount) || 0;
  const firstDueDate = formData.first_due_date ? new Date(formData.first_due_date) : null;
  
  const plannedInstallments = [];
  if (firstDueDate && installmentAmount > 0) {
    for (let i = 0; i < installmentCount; i++) {
      plannedInstallments.push({
        number: i + 1,
        amount: installmentAmount,
        dueDate: addMonths(firstDueDate, i),
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Contrato - {contract.opportunities?.leads?.contacts?.full_name}
            {isSuspended && (
              <Badge variant="destructive" className="flex items-center gap-1 ml-2">
                <AlertTriangle className="h-3 w-3" />
                SUSPENSO
              </Badge>
            )}
          </div>
        }
        description={`Criado em ${format(new Date(contract.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {canCancel && (
              <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar Contrato
              </Button>
            )}
            {canApprove && (
              <Button onClick={() => approveContract.mutateAsync(contract.id)} disabled={approveContract.isPending}>
                <Check className="h-4 w-4 mr-2" />
                {approveContract.isPending ? 'Aprovando...' : 'Aprovar Contrato'}
              </Button>
            )}
            {canReject && (
              <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>
                <X className="h-4 w-4 mr-2" />
                Reprovar Contrato
              </Button>
            )}
            {canSign && (
              <Button onClick={() => setShowSignDialog(true)}>
                <Check className="h-4 w-4 mr-2" />
                Marcar como Assinado
              </Button>
            )}
            {canSuspend && (
              <Button variant="destructive" onClick={() => setShowSuspendDialog(true)}>
                <Pause className="h-4 w-4 mr-2" />
                Suspender por Inadimplência
              </Button>
            )}
            {canReactivate && (
              <Button onClick={handleReactivate} disabled={reactivateContract.isPending}>
                <Play className="h-4 w-4 mr-2" />
                {reactivateContract.isPending ? 'Reativando...' : 'Reativar Contrato'}
              </Button>
            )}
          </div>
        }
      />

      {/* Cancel Contract Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>
              Esta ação irá cancelar o contrato e todos os pagamentos pendentes associados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo do Cancelamento *</Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Voltar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancel}
              disabled={!cancellationReason.trim() || cancelContract.isPending}
            >
              {cancelContract.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Contract Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender Contrato por Inadimplência</DialogTitle>
            <DialogDescription>
              Isso irá suspender tanto o contrato quanto o caso técnico associado.
              O técnico responsável será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Suspensão *</Label>
              <Textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="Descreva o motivo da suspensão..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSuspend}
              disabled={!suspensionReason.trim() || suspendContract.isPending}
            >
              {suspendContract.isPending ? 'Suspendendo...' : 'Confirmar Suspensão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Contract Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar Contrato</DialogTitle>
            <DialogDescription>
              O contrato será devolvido para revisão e o responsável será notificado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo da Reprovação *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Informe o motivo da reprovação..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Voltar
            </Button>
            <Button 
              variant="destructive" 
              onClick={async () => {
                if (!rejectionReason.trim()) return;
                await rejectContract.mutateAsync({ id: contract.id, reason: rejectionReason });
                setShowRejectDialog(false);
                setRejectionReason('');
              }}
              disabled={!rejectionReason.trim() || rejectContract.isPending}
            >
              {rejectContract.isPending ? 'Reprovando...' : 'Confirmar Reprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignDialog} onOpenChange={(open) => {
        setShowSignDialog(open);
        if (!open) setSignDialogFile(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar Contrato como Assinado</DialogTitle>
            <DialogDescription>
              Para marcar o contrato como assinado, é obrigatório anexar o documento assinado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <Label className="text-primary font-medium">
                  Contrato Assinado (obrigatório)
                </Label>
              </div>
              
              {signDialogFile ? (
                <div className="flex items-center justify-between p-3 bg-background rounded-md border">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm">{signDialogFile.name}</span>
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSignDialogFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast({ 
                            title: 'Arquivo muito grande', 
                            description: 'Máximo 10MB', 
                            variant: 'destructive' 
                          });
                          return;
                        }
                        setSignDialogFile(file);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formatos aceitos: PDF, JPG, PNG (máx. 10MB)
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowSignDialog(false);
              setSignDialogFile(null);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleMarkAsSignedWithUpload}
              disabled={!signDialogFile || isSigningWithUpload}
            >
              {isSigningWithUpload ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Assinatura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Contract Info + Client Data */}
        <div className="space-y-6">
          {/* Contract Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações do Contrato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(contract as any).contract_number && (
                <div>
                  <p className="text-sm text-muted-foreground">Número do Contrato</p>
                  <p className="font-medium font-mono">{(contract as any).contract_number}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Serviço</p>
                <p className="font-medium">{SERVICE_INTEREST_LABELS[contract.service_type]}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Modelo do Contrato</p>
                <p className="font-medium">{
                  {
                    NACIONALIDADE: 'Nacionalidad Española por Residencia',
                    REGULARIZACION_EXTRAORDINARIA: 'Regularización Extraordinaria',
                    DOCUMENTOS: 'Geral Trámites',
                    GENERICO: 'Geral Trámites',
                  }[((contract as any).contract_template || 'DOCUMENTOS') as string] || 'Geral Trámites'
                }</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <StatusBadge 
                  status={contract.status || 'EM_ELABORACAO'} 
                  label={CONTRACT_STATUS_LABELS[contract.status || 'EM_ELABORACAO']} 
                />
              </div>
              {assignedUser && (
                <div>
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-medium">{assignedUser.full_name}</p>
                </div>
              )}
              {contract.cancellation_reason && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {contract.status === 'REPROVADO' ? 'Motivo da Reprovação' : 'Motivo do Cancelamento'}
                  </p>
                  <p className="text-sm text-destructive whitespace-pre-wrap">{contract.cancellation_reason}</p>
                </div>
              )}
              {contract.signed_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Assinado em</p>
                  <p className="font-medium">
                    {format(new Date(contract.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Dados do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Nome Completo</p>
                <p className="font-medium">{contract.opportunities?.leads?.contacts?.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {contract.opportunities?.leads?.contacts?.phone || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Endereço</p>
                <p className="font-medium flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {(contract.opportunities?.leads?.contacts as any)?.address || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Documento</p>
                <p className="font-medium">
                  {(contract.opportunities?.leads?.contacts as any)?.document_type || 'Documento'}: {(contract.opportunities?.leads?.contacts as any)?.document_number || '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Resumo Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contract.total_fee && (
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="font-medium text-lg">
                    {new Intl.NumberFormat('pt-BR', { 
                      style: 'currency', 
                      currency: contract.currency || 'EUR' 
                    }).format(contract.total_fee)}
                  </p>
                </div>
              )}
              {(contract as any).down_payment && (
                <div>
                  <p className="text-sm text-muted-foreground">Entrada (Sinal)</p>
                  <p className="font-medium">
                    {new Intl.NumberFormat('pt-BR', { 
                      style: 'currency', 
                      currency: contract.currency || 'EUR' 
                    }).format((contract as any).down_payment)}
                    {(contract as any).down_payment_date && (
                      <span className="text-sm text-muted-foreground ml-2">
                        em {format(new Date((contract as any).down_payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    )}
                  </p>
                </div>
              )}
              {contract.installment_count && contract.installment_count > 1 && (
                <div>
                  <p className="text-sm text-muted-foreground">Parcelamento</p>
                  <p className="font-medium">
                    {contract.installment_count}x de {new Intl.NumberFormat('pt-BR', { 
                      style: 'currency', 
                      currency: contract.currency || 'EUR' 
                    }).format(contract.installment_amount || 0)}
                  </p>
                </div>
              )}
              {(contract as any).payment_method && (
                <div>
                  <p className="text-sm text-muted-foreground">Forma de Pagamento</p>
                  <p className="font-medium">{PAYMENT_METHOD_LABELS[(contract as any).payment_method as keyof typeof PAYMENT_METHOD_LABELS] || (contract as any).payment_method}</p>
                </div>
              )}
              {(contract as any).payment_account && (
                <div>
                  <p className="text-sm text-muted-foreground">Conta de Recebimento</p>
                  <p className="font-medium">{PAYMENT_ACCOUNT_LABELS[(contract as any).payment_account as PaymentAccount] || (contract as any).payment_account}</p>
                </div>
              )}
              {(() => {
                const notes = filteredPaymentNotes || generatedPaymentDetails || '';
                if (!notes) return null;

                const blocks = notes.split('\n---\n').map((b: string) => b.trim()).filter(Boolean);
                const items: { service: string; obs: string }[] = [];

                blocks.forEach((block: string) => {
                  const serviceMatch = block.match(/Serviço:\s*(.+?)(?:\n|$)/);
                  const service = serviceMatch ? serviceMatch[1].trim() : 'Serviço';
                  block.split('\n').forEach((line: string) => {
                    if (line.startsWith('Observações:')) {
                      const obs = line.replace('Observações:', '').trim();
                      if (obs) items.push({ service, obs });
                    }
                  });
                });

                if (items.length === 0) return null;

                // Group by service
                const grouped = items.reduce((acc: Record<string, string[]>, { service, obs }) => {
                  if (!acc[service]) acc[service] = [];
                  acc[service].push(obs);
                  return acc;
                }, {});

                const serviceNames = Object.keys(grouped);

                return (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Observações</p>
                    <div className="text-sm bg-muted/50 rounded-md p-3 space-y-3">
                      {serviceNames.map((service, i) => (
                        <div key={i} className={i > 0 ? 'pt-3 border-t border-border/50' : ''}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                            {service}
                          </p>
                          <div className="space-y-1">
                            {grouped[service].map((obs, j) => (
                              <p key={j} className="font-medium">{obs}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Contract Preview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Pré-visualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ContractPreview
              template={(contract as any).contract_template || 'DOCUMENTOS'}
              clientName={contract.opportunities?.leads?.contacts?.full_name || ''}
              documentType={(contract.opportunities?.leads?.contacts as any)?.document_type || ''}
              documentNumber={(contract.opportunities?.leads?.contacts as any)?.document_number || ''}
              contractNumber={(contract as any).contract_number || ''}
              canDownload={canDownloadContract}
              contractStatus={contract.status || 'EM_ELABORACAO'}
              date={contract.created_at ? new Date(contract.created_at) : undefined}
              serviceDescription={contract.scope_summary || undefined}
              paymentConditions={formData.installment_conditions || contract.installment_conditions || undefined}
              paymentMethod={(contract as any).payment_method || undefined}
              currency={contract.currency || 'EUR'}
              phone={contract.opportunities?.leads?.contacts?.phone?.toString() || undefined}
              email={(contract.opportunities?.leads?.contacts as any)?.email || undefined}
              address={(contract.opportunities?.leads?.contacts as any)?.address || undefined}
              bankAccount={(() => {
                const pm = (contract as any).payment_method;
                const pa = (contract as any).payment_account;
                if (pm !== 'TRANSFERENCIA' || !pa || !paymentAccounts) return undefined;
                const account = paymentAccounts.find((a: any) => a.country === pa || a.id === pa);
                if (!account) return undefined;
                return { bankName: account.bank_name, accountName: account.account_name, accountDetails: account.account_details } as BankAccountData;
              })()}
              beneficiaries={beneficiaries?.filter(b => !b.is_primary).map(b => {
                const sc = serviceCases?.find((s: any) => s.id === b.service_case_id);
                const benContactId = (b as any).contact_id;
                const benPayments = contractPayments?.filter((p: any) => benContactId && p.beneficiary_contact_id === benContactId && p.opportunity_id === contract.opportunity_id) || [];
                const totalBenAmount = benPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
                return {
                  fullName: b.full_name,
                  documentType: b.document_type || undefined,
                  documentNumber: b.document_number || undefined,
                  serviceName: sc ? (SIL as any)[sc.service_type] || sc.service_type : undefined,
                  amount: totalBenAmount > 0 ? totalBenAmount : undefined,
                } as BeneficiaryData;
              }) || []}
              payments={contractPayments?.map(p => ({
                amount: (p as any).amount,
                installment_number: (p as any).installment_number,
                due_date: (p as any).due_date,
                status: (p as any).status,
                payment_method: (p as any).payment_method,
                gross_amount: (p as any).gross_amount,
                vat_amount: (p as any).vat_amount,
                vat_rate: (p as any).vat_rate,
                discount_value: (p as any).discount_value,
                discount_type: (p as any).discount_type,
                payment_form: (p as any).payment_form,
              } as PaymentData)) || []}
              onSaveEdits={async (editData: ContractPreviewEditData) => {
                await updateContract.mutateAsync({
                  id: contract.id,
                  contract_number: editData.contractNumber,
                  installment_conditions: editData.installmentConditions,
                });
                toast({ title: 'Alterações salvas', description: 'As edições da pré-visualização foram salvas com sucesso.' });
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Costs Section - Available for all statuses except CANCELADO */}
      <ContractCostsSection 
        contractId={contract.id}
        canEdit={contract.status !== 'CANCELADO'}
        currency={contract.currency || 'EUR'}
      />

      {/* Notes Section - Histórico de Acordos */}
      <ContractNotesSection contractId={contract.id} />
    </div>
  );
}
