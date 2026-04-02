import { useState, useMemo, useEffect } from 'react';
import { PaymentAgreementDialog, PaymentAgreementInitialData } from '@/components/crm/PaymentAgreementDialog';
import { ContractGroupsSection } from '@/components/crm/ContractGroupsSection';
import PendingItemsSection from '@/components/contacts/PendingItemsSection';
import ReactivationLogSection from '@/components/contacts/ReactivationLogSection';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useContact, useContacts, ContactUpdate } from '@/hooks/useContacts';
import { useLeads } from '@/hooks/useLeads';
import { useContactDocuments } from '@/hooks/useContactDocuments';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { ServiceTypeCombobox } from '@/components/ui/service-type-combobox';
import { useContactBeneficiaries } from '@/hooks/useContactBeneficiaries';
import { useInteractions } from '@/hooks/useInteractions';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_INTEREST_LABELS as SVC_LABELS_DOC, DOCUMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, INTERACTION_CHANNEL_LABELS, CONTRACT_STATUS_LABELS } from '@/types/database';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  Globe, 
  Building,
  Save,
  AlertCircle,
  FileText,
  Loader2,
  MapPin,
  Users,
  CreditCard,
  Calendar,
  Briefcase,
  Baby,
  MessageSquare,
  DollarSign,
  Plus,
  Upload,
  Trash2,
  Pencil
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ORIGIN_CHANNEL_LABELS,
  LANGUAGE_LABELS,
  LEAD_STATUS_LABELS,
  SERVICE_INTEREST_LABELS,
  DOCUMENT_TYPE_LABELS,
  CIVIL_STATUS_LABELS,
  LEGAL_GUARDIAN_RELATIONSHIP_LABELS,
} from '@/types/database';
import { useToast } from '@/hooks/use-toast';

function calculateAge(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  try {
    const age = differenceInYears(new Date(), new Date(birthDate));
    return `${age} anos`;
  } catch {
    return null;
  }
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: contact, isLoading, error } = useContact(id);
  const { updateContact } = useContacts();
  const { leads, createLeadForContact } = useLeads();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState<Partial<ContactUpdate>>({});
  const [phoneInput, setPhoneInput] = useState('');
  const [showNewServiceDialog, setShowNewServiceDialog] = useState(false);
  const [newServiceInterest, setNewServiceInterest] = useState<string>('OUTRO');
  const [newServiceNotes, setNewServiceNotes] = useState('');
  const [paymentNotes, setPaymentNotes] = useState<string | null>(null);
  const [isSavingPaymentNotes, setIsSavingPaymentNotes] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const queryClient = useQueryClient();

  const contactLeads = leads.filter(l => l.contact_id === id && l.status !== 'ARQUIVADO_SEM_RETORNO');

  // Extract "Observações" from the last payment agreement block in payment_notes
  const extractLastNotes = (): string => {
    const notes = (contact as any)?.payment_notes || '';
    if (!notes) return '';
    const blocks = notes.split('---');
    const lastBlock = blocks[blocks.length - 1] || '';
    const match = lastBlock.match(/Observações:\s*(.+?)(?:\n|$)/);
    return match ? match[1].trim() : '';
  };
  useEffect(() => {
    if (contact) {
      setPaymentNotes((contact as any).payment_notes || '');
    }
  }, [contact?.id]);

  const handleSavePaymentNotes = async () => {
    if (!id) return;
    setIsSavingPaymentNotes(true);
    try {
      await updateContact.mutateAsync({ id, payment_notes: paymentNotes } as any);
      toast({ title: 'Acordo de pagamento salvo' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingPaymentNotes(false);
    }
  };

  // Leads que têm pelo menos um pagamento confirmado = serviços
  const { data: confirmedLeadIds = [] } = useQuery({
    queryKey: ['confirmed-lead-ids', id],
    queryFn: async () => {
      if (!id) return [];
      const { data: cLeads } = await supabase.from('leads').select('id').eq('contact_id', id);
      if (!cLeads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id, lead_id').in('lead_id', cLeads.map(l => l.id));
      if (!opps?.length) return [];
      const { data: payments } = await supabase.from('payments').select('opportunity_id').in('opportunity_id', opps.map(o => o.id)).eq('status', 'CONFIRMADO');
      if (!payments?.length) return [];
      const oppIds = new Set(payments.map(p => p.opportunity_id));
      return opps.filter(o => oppIds.has(o.id)).map(o => o.lead_id);
    },
    enabled: !!id,
  });
  const confirmedLeads = contactLeads.filter(l => confirmedLeadIds.includes(l.id));
  const pendingPaymentLeads = contactLeads.filter(l => l.service_type_id && !confirmedLeadIds.includes(l.id));
  const { data: serviceTypes } = useServiceTypes();
  const allServiceLeads = [...confirmedLeads, ...pendingPaymentLeads];
  const { data: contactDocuments = [], isLoading: docsLoading } = useContactDocuments(id);
  const { beneficiaries: contactBeneficiaries, titular: contactTitular, isLoading: benefLoading } = useContactBeneficiaries(id);
  const { interactions } = useInteractions(id);

  const { data: beneficiaryServiceCases = [], isLoading: benefCasesLoading } = useQuery({
    queryKey: ['beneficiary-service-cases', id, contact?.is_beneficiary],
    queryFn: async () => {
      if (!id || !contact?.is_beneficiary) return [];
      const { data } = await supabase
        .from('contract_beneficiaries')
        .select('*, service_cases:service_case_id(id, service_type, sector, technical_status, created_at)')
        .eq('contact_id', id)
        .not('service_case_id', 'is', null);
      return (data || []).filter((b: any) => b.service_cases).map((b: any) => b.service_cases);
    },
    enabled: !!id && !!contact?.is_beneficiary,
  });

  const handleStartEdit = () => {
    if (contact) {
      setEditedContact({
        full_name: contact.full_name,
        email: contact.email,
        country_of_origin: contact.country_of_origin,
        nationality: contact.nationality,
        origin_channel: contact.origin_channel,
        preferred_language: contact.preferred_language,
        document_type: contact.document_type,
        document_number: contact.document_number,
        address: contact.address,
        referral_name: contact.referral_name,
        referral_confirmed: contact.referral_confirmed,
        civil_status: contact.civil_status,
        profession: contact.profession,
        cpf: contact.cpf,
        mother_name: contact.mother_name,
        father_name: contact.father_name,
        spain_arrival_date: contact.spain_arrival_date,
        birth_date: (contact as any).birth_date,
        birth_city: (contact as any).birth_city,
        birth_state: (contact as any).birth_state,
        second_document_type: (contact as any).second_document_type,
        second_document_number: (contact as any).second_document_number,
        document_expiry_date: (contact as any).document_expiry_date,
        legal_guardian_name: (contact as any).legal_guardian_name,
        legal_guardian_phone: (contact as any).legal_guardian_phone,
        legal_guardian_email: (contact as any).legal_guardian_email,
        legal_guardian_address: (contact as any).legal_guardian_address,
        legal_guardian_birth_date: (contact as any).legal_guardian_birth_date,
        legal_guardian_relationship: (contact as any).legal_guardian_relationship,
        eu_entry_last_6_months: contact.eu_entry_last_6_months,
        eu_entry_location: (contact as any).eu_entry_location,
        has_eu_family_member: (contact as any).has_eu_family_member,
        works_remotely: (contact as any).works_remotely,
        monthly_income: (contact as any).monthly_income,
        has_admin_marketing_experience: (contact as any).has_admin_marketing_experience,
        education_level: contact.education_level,
        is_empadronado: (contact as any).is_empadronado,
        empadronamiento_since: (contact as any).empadronamiento_since,
        empadronamiento_city: (contact as any).empadronamiento_city,
        empadronamiento_address: contact.empadronamiento_address,
        has_job_offer: (contact as any).has_job_offer,
        payment_notes: (contact as any).payment_notes,
      });
      setPhoneInput(contact.phone?.toString() || '');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    
    try {
      const phoneStr = phoneInput ? phoneInput.replace(/\D/g, '') : null;
      await updateContact.mutateAsync({
        id,
        ...editedContact,
        phone: phoneStr || undefined,
      });
      toast({
        title: 'Contato atualizado',
        description: 'As informações foram salvas com sucesso.',
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCreateNewService = async () => {
    if (!id) return;
    try {
      // Find the selected service type to get the service_interest enum
      const selectedST = serviceTypes?.find(st => st.code === newServiceInterest);
      const newLead = await createLeadForContact.mutateAsync({
        contact_id: id,
        service_interest: newServiceInterest,
        service_type_id: selectedST?.id,
        notes: newServiceNotes || undefined,
      });
      setShowNewServiceDialog(false);
      setNewServiceInterest('OUTRO');
      setNewServiceNotes('');
      navigate(`/crm/leads/${newLead.id}`);
    } catch (error) {
      // toast handled by hook
    }
  };

  const isMinor = useMemo(() => {
    const bd = isEditing ? (editedContact as any).birth_date : (contact as any)?.birth_date;
    if (!bd) return false;
    try {
      return differenceInYears(new Date(), new Date(bd)) < 18;
    } catch { return false; }
  }, [isEditing, editedContact, contact]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Contato não encontrado</h2>
        <p className="text-muted-foreground mb-4">O registro solicitado não existe.</p>
        <Button onClick={() => navigate('/crm/contacts')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Contatos
        </Button>
      </div>
    );
  }

  const c = contact as any; // to access new fields not yet in types

  const renderEditForm = () => (
    <div className="space-y-4">
      {/* Nome */}
      <div>
        <Label>Nome Completo *</Label>
        <Input
          value={editedContact.full_name || ''}
          onChange={(e) => setEditedContact({ ...editedContact, full_name: e.target.value })}
        />
      </div>
      
      {/* Telefone / Email */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Telefone</Label>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="+55 11 99999-9999"
          />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input
            value={editedContact.email || ''}
            onChange={(e) => setEditedContact({ ...editedContact, email: e.target.value })}
            type="email"
          />
        </div>
      </div>

      {/* Endereço */}
      <div>
        <Label>Endereço Residencial</Label>
        <Textarea
          value={editedContact.address || ''}
          onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}
          placeholder="Endereço completo"
          rows={2}
        />
      </div>

      {/* Data de Nascimento */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Data de Nascimento</Label>
          <Input
            type="date"
            value={(editedContact as any).birth_date || ''}
            onChange={(e) => setEditedContact({ ...editedContact, birth_date: e.target.value || null } as any)}
          />
          {(editedContact as any).birth_date && (
            <p className="text-sm text-muted-foreground mt-1">
              Idade: {calculateAge((editedContact as any).birth_date)}
            </p>
          )}
        </div>
        <div>
          <Label>Estado Civil</Label>
          <Select
            value={editedContact.civil_status || ''}
            onValueChange={(v) => setEditedContact({ ...editedContact, civil_status: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CIVIL_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* País / Cidade / Estado de Nascimento */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>País de Nascimento</Label>
          <Input
            value={editedContact.country_of_origin || ''}
            onChange={(e) => setEditedContact({ ...editedContact, country_of_origin: e.target.value })}
          />
        </div>
        <div>
          <Label>Cidade de Nascimento</Label>
          <Input
            value={(editedContact as any).birth_city || ''}
            onChange={(e) => setEditedContact({ ...editedContact, birth_city: e.target.value } as any)}
          />
        </div>
        <div>
          <Label>Estado de Nascimento</Label>
          <Input
            value={(editedContact as any).birth_state || ''}
            onChange={(e) => setEditedContact({ ...editedContact, birth_state: e.target.value } as any)}
          />
        </div>
      </div>

      {/* Nacionalidade / Profissão */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Nacionalidade(s)</Label>
          <Input
            value={editedContact.nationality || ''}
            onChange={(e) => setEditedContact({ ...editedContact, nationality: e.target.value })}
            placeholder="Ex: Brasileira, Portuguesa"
          />
        </div>
        <div>
          <Label>Profissão</Label>
          <Input
            value={editedContact.profession || ''}
            onChange={(e) => setEditedContact({ ...editedContact, profession: e.target.value })}
          />
        </div>
      </div>

      {/* Nome da Mãe / Pai */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Nome da Mãe</Label>
          <Input
            value={editedContact.mother_name || ''}
            onChange={(e) => setEditedContact({ ...editedContact, mother_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Nome do Pai</Label>
          <Input
            value={editedContact.father_name || ''}
            onChange={(e) => setEditedContact({ ...editedContact, father_name: e.target.value })}
          />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Documento Principal */}
      <h4 className="font-medium text-sm text-muted-foreground">Documento Principal</h4>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Tipo de Documento</Label>
          <Select
            value={editedContact.document_type || ''}
            onValueChange={(v) => setEditedContact({ ...editedContact, document_type: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Número do Documento</Label>
          <Input
            value={editedContact.document_number || ''}
            onChange={(e) => setEditedContact({ ...editedContact, document_number: e.target.value })}
            placeholder="Ex: Y1234567X"
          />
        </div>
        <div>
          <Label>Validade do Documento</Label>
          <Input
            type="date"
            value={(editedContact as any).document_expiry_date || ''}
            onChange={(e) => setEditedContact({ ...editedContact, document_expiry_date: e.target.value || null } as any)}
          />
        </div>
      </div>

      {/* Segundo Documento */}
      <h4 className="font-medium text-sm text-muted-foreground">Segundo Documento (opcional)</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select
            value={(editedContact as any).second_document_type || ''}
            onValueChange={(v) => setEditedContact({ ...editedContact, second_document_type: v } as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Número</Label>
          <Input
            value={(editedContact as any).second_document_number || ''}
            onChange={(e) => setEditedContact({ ...editedContact, second_document_number: e.target.value } as any)}
          />
        </div>
      </div>

      {/* CPF */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>CPF</Label>
          <Input
            value={editedContact.cpf || ''}
            onChange={(e) => setEditedContact({ ...editedContact, cpf: e.target.value })}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <Label>Data de Entrada na Espanha (ou previsão)</Label>
          <Input
            type="date"
            value={editedContact.spain_arrival_date || ''}
            onChange={(e) => setEditedContact({ ...editedContact, spain_arrival_date: e.target.value || null })}
          />
        </div>
      </div>

      <Separator className="my-4" />

      {/* Perguntas de Qualificação */}
      <h4 className="font-medium text-sm text-muted-foreground">Informações Adicionais</h4>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="eu_entry_last_6_months"
            checked={(editedContact as any).eu_entry_last_6_months || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, eu_entry_last_6_months: !!c } as any)}
          />
          <Label htmlFor="eu_entry_last_6_months" className="cursor-pointer">Esteve na Europa nos últimos 6 meses?</Label>
        </div>
        {(editedContact as any).eu_entry_last_6_months && (
          <div>
            <Label>Onde esteve?</Label>
            <Input
              value={(editedContact as any).eu_entry_location || ''}
              onChange={(e) => setEditedContact({ ...editedContact, eu_entry_location: e.target.value } as any)}
              placeholder="País/cidade"
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="has_eu_family_member"
            checked={(editedContact as any).has_eu_family_member || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, has_eu_family_member: !!c } as any)}
          />
          <Label htmlFor="has_eu_family_member" className="cursor-pointer">Possui familiar de 1º grau Europeu/residente na Espanha?</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="works_remotely"
            checked={(editedContact as any).works_remotely || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, works_remotely: !!c } as any)}
          />
          <Label htmlFor="works_remotely" className="cursor-pointer">Trabalha de forma remota?</Label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Renda Mensal (€)</Label>
          <Input
            type="number"
            value={(editedContact as any).monthly_income || ''}
            onChange={(e) => setEditedContact({ ...editedContact, monthly_income: e.target.value ? parseFloat(e.target.value) : null } as any)}
            placeholder="0.00"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id="education_level_superior"
            checked={editedContact.education_level === 'SUPERIOR'}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, education_level: c ? 'SUPERIOR' : null })}
          />
          <Label htmlFor="education_level_superior" className="cursor-pointer">Possui formação superior?</Label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="has_admin_marketing_experience"
            checked={(editedContact as any).has_admin_marketing_experience || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, has_admin_marketing_experience: !!c } as any)}
          />
          <Label htmlFor="has_admin_marketing_experience" className="cursor-pointer">Experiência em administração/marketing?</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="has_job_offer"
            checked={(editedContact as any).has_job_offer || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, has_job_offer: !!c } as any)}
          />
          <Label htmlFor="has_job_offer" className="cursor-pointer">Possui oferta de trabalho?</Label>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Se já reside na Espanha */}
      <h4 className="font-medium text-sm text-muted-foreground">Se já reside na Espanha</h4>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="is_empadronado"
            checked={(editedContact as any).is_empadronado || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, is_empadronado: !!c } as any)}
          />
          <Label htmlFor="is_empadronado" className="cursor-pointer">Está empadronado?</Label>
        </div>
      </div>

      {(editedContact as any).is_empadronado && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Empadronado desde quando?</Label>
            <Input
              type="date"
              value={(editedContact as any).empadronamiento_since || ''}
              onChange={(e) => setEditedContact({ ...editedContact, empadronamiento_since: e.target.value || null } as any)}
            />
          </div>
          <div>
            <Label>Cidade do Empadronamiento</Label>
            <Input
              value={(editedContact as any).empadronamiento_city || ''}
              onChange={(e) => setEditedContact({ ...editedContact, empadronamiento_city: e.target.value } as any)}
              placeholder="Ex: Barcelona"
            />
          </div>
        </div>
      )}

      <div>
        <Label>Endereço do Empadronamiento</Label>
        <Input
          value={editedContact.empadronamiento_address || ''}
          onChange={(e) => setEditedContact({ ...editedContact, empadronamiento_address: e.target.value })}
          placeholder="Endereço completo"
        />
      </div>

      <Separator className="my-4" />

      {/* Canal / Idioma */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Canal de Origem</Label>
          <Select
            value={editedContact.origin_channel || ''}
            onValueChange={(v: any) => setEditedContact({ ...editedContact, origin_channel: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORIGIN_CHANNEL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Idioma Preferencial</Label>
          <Select
            value={editedContact.preferred_language || ''}
            onValueChange={(v: any) => setEditedContact({ ...editedContact, preferred_language: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Indicação */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Indicado por (Colaborador/Parceiro)</Label>
          <Input
            value={editedContact.referral_name || ''}
            onChange={(e) => setEditedContact({ ...editedContact, referral_name: e.target.value })}
            placeholder="Nome do colaborador"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id="referral_confirmed"
            checked={editedContact.referral_confirmed || false}
            onCheckedChange={(c) => setEditedContact({ ...editedContact, referral_confirmed: !!c })}
          />
          <Label htmlFor="referral_confirmed" className="cursor-pointer">Indicação confirmada</Label>
        </div>
      </div>

      {/* Representante Legal (menores) */}
      {isMinor && (
        <>
          <Separator className="my-4" />
          <h4 className="font-medium flex items-center gap-2">
            <Baby className="h-4 w-4" />
            Representante Legal (Menor de Idade)
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nome do Representante</Label>
              <Input
                value={(editedContact as any).legal_guardian_name || ''}
                onChange={(e) => setEditedContact({ ...editedContact, legal_guardian_name: e.target.value } as any)}
              />
            </div>
            <div>
              <Label>Grau de Parentesco</Label>
              <Select
                value={(editedContact as any).legal_guardian_relationship || ''}
                onValueChange={(v) => setEditedContact({ ...editedContact, legal_guardian_relationship: v } as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEGAL_GUARDIAN_RELATIONSHIP_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Telefone</Label>
              <Input
                value={(editedContact as any).legal_guardian_phone || ''}
                onChange={(e) => setEditedContact({ ...editedContact, legal_guardian_phone: e.target.value } as any)}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                value={(editedContact as any).legal_guardian_email || ''}
                onChange={(e) => setEditedContact({ ...editedContact, legal_guardian_email: e.target.value } as any)}
                type="email"
              />
            </div>
          </div>
          <div>
            <Label>Endereço</Label>
            <Input
              value={(editedContact as any).legal_guardian_address || ''}
              onChange={(e) => setEditedContact({ ...editedContact, legal_guardian_address: e.target.value } as any)}
            />
          </div>
          <div>
            <Label>Data de Nascimento do Representante</Label>
            <Input
              type="date"
              value={(editedContact as any).legal_guardian_birth_date || ''}
              onChange={(e) => setEditedContact({ ...editedContact, legal_guardian_birth_date: e.target.value || null } as any)}
            />
          </div>
        </>
      )}
      
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => setIsEditing(false)}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={updateContact.isPending}>
          {updateContact.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );

  const renderViewFields = () => (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="flex items-center gap-3">
        <Phone className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Telefone</p>
          <p className="font-medium">{contact.phone || '-'}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">E-mail</p>
          <p className="font-medium">{contact.email || '-'}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 sm:col-span-2">
        <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div>
          <p className="text-sm text-muted-foreground">Endereço Residencial</p>
          <p className="font-medium">{contact.address || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Data de Nascimento</p>
          <p className="font-medium">
            {c.birth_date ? format(new Date(c.birth_date), "dd/MM/yyyy") : '-'}
            {c.birth_date && (
              <span className="text-muted-foreground ml-2">({calculateAge(c.birth_date)})</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Estado Civil</p>
          <p className="font-medium">{contact.civil_status ? CIVIL_STATUS_LABELS[contact.civil_status] || contact.civil_status : '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">País de Nascimento</p>
          <p className="font-medium">{contact.country_of_origin || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Cidade / Estado de Nascimento</p>
          <p className="font-medium">
            {[c.birth_city, c.birth_state].filter(Boolean).join(', ') || '-'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Nacionalidade(s)</p>
          <p className="font-medium">{contact.nationality || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Profissão</p>
          <p className="font-medium">{contact.profession || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Nome da Mãe</p>
          <p className="font-medium">{contact.mother_name || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Nome do Pai</p>
          <p className="font-medium">{contact.father_name || '-'}</p>
        </div>
      </div>

      <Separator className="sm:col-span-2" />

      {/* Documento Principal */}
      <div className="flex items-center gap-3">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Documento Principal</p>
          <p className="font-medium">
            {contact.document_type ? DOCUMENT_TYPE_LABELS[contact.document_type] : '-'}
            {contact.document_number && ` - ${contact.document_number}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Validade do Documento</p>
          <p className="font-medium">
            {c.document_expiry_date ? format(new Date(c.document_expiry_date), "dd/MM/yyyy") : '-'}
          </p>
        </div>
      </div>

      {/* Segundo Documento */}
      {(c.second_document_type || c.second_document_number) && (
        <div className="flex items-center gap-3 sm:col-span-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Segundo Documento</p>
            <p className="font-medium">
              {c.second_document_type ? DOCUMENT_TYPE_LABELS[c.second_document_type] || c.second_document_type : ''}
              {c.second_document_number && ` - ${c.second_document_number}`}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">CPF</p>
          <p className="font-medium">{contact.cpf || '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Entrada na Espanha</p>
          <p className="font-medium">
            {contact.spain_arrival_date ? format(new Date(contact.spain_arrival_date), "dd/MM/yyyy") : '-'}
          </p>
        </div>
      </div>

      <Separator className="sm:col-span-2" />

      {/* Informações Adicionais */}
      <div className="sm:col-span-2">
        <h4 className="font-medium text-sm text-muted-foreground mb-3">Informações Adicionais</h4>
      </div>

      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Esteve na Europa (últimos 6 meses)</p>
          <p className="font-medium">
            {c.eu_entry_last_6_months ? 'Sim' : c.eu_entry_last_6_months === false ? 'Não' : '-'}
            {c.eu_entry_last_6_months && c.eu_entry_location && (
              <span className="text-muted-foreground ml-1">({c.eu_entry_location})</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Familiar Europeu/Residente</p>
          <p className="font-medium">{c.has_eu_family_member ? 'Sim' : c.has_eu_family_member === false ? 'Não' : '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Trabalho Remoto</p>
          <p className="font-medium">{c.works_remotely ? 'Sim' : c.works_remotely === false ? 'Não' : '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Renda Mensal</p>
          <p className="font-medium">{c.monthly_income ? `€ ${Number(c.monthly_income).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Formação Superior</p>
          <p className="font-medium">{contact.education_level === 'SUPERIOR' ? 'Sim' : 'Não'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Experiência Admin/Marketing</p>
          <p className="font-medium">{c.has_admin_marketing_experience ? 'Sim' : c.has_admin_marketing_experience === false ? 'Não' : '-'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Oferta de Trabalho</p>
          <p className="font-medium">{c.has_job_offer ? 'Sim' : c.has_job_offer === false ? 'Não' : '-'}</p>
        </div>
      </div>

      {/* Empadronamiento */}
      <div className="flex items-center gap-3">
        <MapPin className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Empadronado</p>
          <p className="font-medium">
            {c.is_empadronado ? 'Sim' : c.is_empadronado === false ? 'Não' : '-'}
            {c.is_empadronado && c.empadronamiento_city && (
              <span className="text-muted-foreground ml-1">({c.empadronamiento_city})</span>
            )}
          </p>
        </div>
      </div>

      {c.is_empadronado && c.empadronamiento_since && (
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Empadronado desde</p>
            <p className="font-medium">{format(new Date(c.empadronamiento_since), "dd/MM/yyyy")}</p>
          </div>
        </div>
      )}

      {contact.empadronamiento_address && (
        <div className="flex items-start gap-3 sm:col-span-2">
          <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm text-muted-foreground">Endereço do Empadronamiento</p>
            <p className="font-medium">{contact.empadronamiento_address}</p>
          </div>
        </div>
      )}

      <Separator className="sm:col-span-2" />

      <div className="flex items-center gap-3">
        <Building className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Canal de Origem</p>
          <p className="font-medium">
            {ORIGIN_CHANNEL_LABELS[contact.origin_channel || 'OUTRO']}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <Globe className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Idioma Preferencial</p>
          <p className="font-medium">
            {LANGUAGE_LABELS[contact.preferred_language || 'pt']}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:col-span-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">Indicado por</p>
          <p className="font-medium">
            {contact.referral_name || '-'}
            {contact.referral_confirmed && contact.referral_name && (
              <Badge variant="outline" className="ml-2">Confirmado</Badge>
            )}
          </p>
        </div>
      </div>

      {/* Representante Legal */}
      {isMinor && c.legal_guardian_name && (
        <>
          <Separator className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <h4 className="font-medium flex items-center gap-2 mb-4">
              <Baby className="h-4 w-4" />
              Representante Legal
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{c.legal_guardian_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Parentesco</p>
                <p className="font-medium">
                  {c.legal_guardian_relationship ? LEGAL_GUARDIAN_RELATIONSHIP_LABELS[c.legal_guardian_relationship] || c.legal_guardian_relationship : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{c.legal_guardian_phone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{c.legal_guardian_email || '-'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Endereço</p>
                <p className="font-medium">{c.legal_guardian_address || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data de Nascimento</p>
                <p className="font-medium">
                  {c.legal_guardian_birth_date ? format(new Date(c.legal_guardian_birth_date), "dd/MM/yyyy") : '-'}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
    <div className="space-y-6">
      <PageHeader
        title={contact.full_name}
        description={`Contato criado em ${format(new Date(contact.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/crm/contacts')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            {!isEditing && (
              <Button onClick={handleStartEdit}>
                Editar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Contato
              </CardTitle>
              {isEditing && (
                <CardDescription>
                  Editando informações do contato
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {isEditing ? renderEditForm() : renderViewFields()}
            </CardContent>
          </Card>

          {/* Serviços & Pagamentos - seção unificada */}
          {!contact.is_beneficiary && (
            <ContractGroupsSection
              contactId={id!}
              contactName={contact.full_name}
              contactLeads={allServiceLeads}
              paymentNotes={paymentNotes}
              confirmedLeadIds={confirmedLeadIds}
              navigate={navigate}
              beneficiaryContacts={contactBeneficiaries.map(b => ({
                id: b.contact_id || b.id,
                full_name: b.full_name,
              }))}
            />
          )}

          {/* Serviços como Beneficiário */}
          {contact.is_beneficiary && (
            <BeneficiaryServicesSection
              contactId={id!}
              contact={contact}
              beneficiaryServiceCases={beneficiaryServiceCases}
              benefCasesLoading={benefCasesLoading}
              navigate={navigate}
            />
          )}

          {/* Pendências por Setor */}
          <PendingItemsSection contactId={id!} />

          {/* Log de Reativações */}
          <ReactivationLogSection contactId={id!} />

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Documentos ({contactDocuments.length})
                  </CardTitle>
                  <CardDescription>
                    Documentos anexados e enviados relacionados a este contato
                  </CardDescription>
                </div>
                <div className="relative">
                  <Input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    disabled={isUploadingDoc}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !id) return;
                      setIsUploadingDoc(true);
                      try {
                        const ext = file.name.split('.').pop();
                        const filePath = `contacts/${id}/${Date.now()}_${file.name}`;
                        const { error: uploadError } = await supabase.storage
                          .from('client-documents')
                          .upload(filePath, file);
                        if (uploadError) throw uploadError;
                        const { data: urlData } = supabase.storage
                          .from('client-documents')
                          .getPublicUrl(filePath);
                        // Store as interaction with document link
                        await supabase.from('interactions').insert({
                          contact_id: id,
                          channel: 'OUTRO',
                          direction: 'INBOUND',
                          content: `📎 Documento anexado: ${file.name}\n${urlData.publicUrl}`,
                        });
                        queryClient.invalidateQueries({ queryKey: ['contact-documents', id] });
                        queryClient.invalidateQueries({ queryKey: ['interactions'] });
                        toast({ title: 'Documento anexado com sucesso' });
                      } catch (err: any) {
                        toast({ title: 'Erro ao anexar documento', description: err.message, variant: 'destructive' });
                      } finally {
                        setIsUploadingDoc(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  <Button variant="outline" size="sm" disabled={isUploadingDoc}>
                    {isUploadingDoc ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    Anexar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : contactDocuments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum documento vinculado a este contato.
                </p>
              ) : (
                <div className="space-y-3">
                  {contactDocuments.map(doc => {
                    const statusColors: Record<string, string> = {
                      NAO_ENVIADO: 'bg-muted text-muted-foreground',
                      ENVIADO: 'bg-info/10 text-info',
                      EM_CONFERENCIA: 'bg-accent/10 text-accent-foreground',
                      APROVADO: 'bg-success/10 text-success',
                      REJEITADO: 'bg-destructive/10 text-destructive',
                    };
                    return (
                      <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{doc.document_type_name}</p>
                            {doc.is_required && (
                              <Badge variant="outline" className="text-xs">Obrigatório</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                            <span>{SVC_LABELS_DOC[doc.service_type as keyof typeof SVC_LABELS_DOC] || doc.service_type}</span>
                            {doc.case_protocol_number && (
                              <span>Protocolo: {doc.case_protocol_number}</span>
                            )}
                            {doc.uploaded_by_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {doc.uploaded_by_name}
                              </span>
                            )}
                            {doc.uploaded_at && (
                              <span>{format(new Date(doc.uploaded_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                            )}
                          </div>
                          {doc.status === 'REJEITADO' && doc.rejection_reason && (
                            <p className="text-xs text-destructive mt-1">Motivo: {doc.rejection_reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`border-0 ${statusColors[doc.status] || 'bg-muted'}`}>
                            {DOCUMENT_STATUS_LABELS[doc.status as keyof typeof DOCUMENT_STATUS_LABELS] || doc.status}
                          </Badge>
                          {doc.file_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>


          {/* Interactions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Interações Sistema
              </CardTitle>
              <CardDescription>Histórico de comunicações com o cliente</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {interactions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma interação registrada
                    </p>
                  ) : (
                    interactions.map((interaction) => (
                      <div
                        key={interaction.id}
                        className="p-4 rounded-lg bg-muted/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <StatusBadge
                            status={interaction.channel || 'OUTRO'}
                            label={INTERACTION_CHANNEL_LABELS[interaction.channel || 'OUTRO']}
                          />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(interaction.created_at!), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </div>
                        </div>
                        <p className="text-sm">{interaction.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-10 w-10 text-primary" />
                </div>
              </div>
              
              <div className="text-center">
                <h3 className="font-semibold text-lg">{contact.full_name}</h3>
                <p className="text-sm text-muted-foreground">{contact.email || 'Sem e-mail'}</p>
              </div>
              
              <Separator />
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de Leads</span>
                  <span className="font-medium">{contactLeads.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última atualização</span>
                  <span className="font-medium">
                    {format(new Date(contact.updated_at!), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Beneficiários / Titular */}
          {(contactBeneficiaries.length > 0 || contactTitular) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {contactTitular ? 'Titular Vinculado' : `Beneficiários (${contactBeneficiaries.length})`}
                </CardTitle>
                <CardDescription>
                  {contactTitular 
                    ? 'Este contato é beneficiário vinculado ao titular abaixo' 
                    : 'Beneficiários vinculados a este titular'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {benefLoading ? (
                  <Skeleton className="h-16" />
                ) : contactTitular ? (
                  <div
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => contactTitular.contact_id && navigate(`/crm/contacts/${contactTitular.contact_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{contactTitular.full_name}</p>
                        <p className="text-sm text-muted-foreground">Titular</p>
                      </div>
                    </div>
                    {contactTitular.contact_id && (
                      <Badge variant="outline">Ver Ficha</Badge>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contactBeneficiaries.map(ben => (
                      <div
                        key={ben.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${ben.contact_id ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
                        onClick={() => ben.contact_id && navigate(`/crm/contacts/${ben.contact_id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-secondary/50 flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{ben.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {ben.relationship || 'Beneficiário'}
                            </p>
                          </div>
                        </div>
                        {ben.contact_id && (
                          <Badge variant="outline">Ver Ficha</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>

      {/* Dialog Novo Serviço */}
      <Dialog open={showNewServiceDialog} onOpenChange={setShowNewServiceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Serviço para {contact.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Serviço</Label>
              <ServiceTypeCombobox
                value={newServiceInterest}
                onValueChange={setNewServiceInterest}
                serviceTypes={serviceTypes?.map(st => ({ code: st.code, name: st.name })) || []}
                placeholder="Selecione o serviço..."
              />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={newServiceNotes}
                onChange={(e) => setNewServiceNotes(e.target.value)}
                placeholder="Observações sobre o novo serviço..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewServiceDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateNewService} disabled={createLeadForContact.isPending}>
              {createLeadForContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

// ---- Beneficiary Services Section ----
import { SERVICE_SECTOR_LABELS as SECTOR_LABELS_MAP, TECHNICAL_STATUS_LABELS } from '@/types/database';

function BeneficiaryServicesSection({ contactId, contact, beneficiaryServiceCases, benefCasesLoading, navigate }: {
  contactId: string;
  contact: any;
  beneficiaryServiceCases: any[];
  benefCasesLoading: boolean;
  navigate: (path: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [serviceType, setServiceType] = useState('');
  const [sector, setSector] = useState('');
  const [showPaymentAgreement, setShowPaymentAgreement] = useState(false);
  const [editPaymentData, setEditPaymentData] = useState<PaymentAgreementInitialData | null>(null);

  const extractLastNotes = (): string => {
    const notes = contact?.payment_notes || '';
    if (!notes) return '';
    const blocks = notes.split('---');
    const lastBlock = blocks[blocks.length - 1] || '';
    const match = lastBlock.match(/Observações:\s*(.+?)(?:\n|$)/);
    return match ? match[1].trim() : '';
  };

  const extractFeesFromNotes = (serviceTypeId: string): { description: string; amount: string }[] => {
    const notes = contact?.payment_notes || '';
    if (!notes) return [];
    const blocks = notes.split('---');
    // Find the last block that matches this service
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      // Check if this block matches the service by looking for the service name or just use the last block
      const feeLines: { description: string; amount: string }[] = [];
      const lines = block.split('\n');
      for (const line of lines) {
        // Match pattern: "description: + € amount"
        const feeMatch = line.match(/^(.+?):\s*\+\s*€\s*([\d.,]+)\s*$/);
        if (feeMatch) {
          const desc = feeMatch[1].trim();
          // Skip known non-fee lines
          if (['Acordo de Pagamento', 'Serviço', 'Valor Bruto', 'IVA', 'Total', 'Total Final', 'Método', 'Forma', 'Parcelas', 'Origem', 'Conta', 'Detalhe', 'Observações', 'Desconto'].some(k => desc.startsWith(k))) continue;
          feeLines.push({ description: desc, amount: feeMatch[2].replace(',', '.') });
        }
      }
      if (feeLines.length > 0) return feeLines;
    }
    return [];
  };

  // Fetch leads for this beneficiary that have service_type_id but no service_case yet
  const { data: pendingBeneficiaryLeads = [] } = useQuery({
    queryKey: ['beneficiary-pending-leads', contactId],
    queryFn: async () => {
      const { data: bLeads } = await supabase
        .from('leads')
        .select('id, service_type_id, service_interest, created_at, status')
        .eq('contact_id', contactId)
        .not('service_type_id', 'is', null)
        .order('created_at', { ascending: false });
      return bLeads || [];
    },
    enabled: !!contactId,
  });

  const { data: pendingServiceTypes } = useServiceTypes();

  // Fetch payments for this beneficiary
  const { data: beneficiaryPayments = [] } = useQuery({
    queryKey: ['beneficiary-payments', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      // Payments via beneficiary_contact_id
      const { data: benefPayments } = await supabase
        .from('payments')
        .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest))')
        .eq('beneficiary_contact_id', contactId)
        .order('due_date', { ascending: true });

      // Payments via leads → opportunities
      const { data: cLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_id', contactId);

      let titularPayments: any[] = [];
      if (cLeads && cLeads.length > 0) {
        const leadIds = cLeads.map(l => l.id);
        const { data: opps } = await supabase
          .from('opportunities')
          .select('id')
          .in('lead_id', leadIds);
        if (opps && opps.length > 0) {
          const oppIds = opps.map(o => o.id);
          const { data: payments } = await supabase
            .from('payments')
            .select('*, contracts(contract_number, service_type), opportunities(id, lead_id, leads(id, service_type_id, service_interest))')
            .in('opportunity_id', oppIds)
            .order('due_date', { ascending: true });
          if (payments) titularPayments = payments;
        }
      }

      const allPayments = [...(benefPayments || []), ...titularPayments];
      const seen = new Set<string>();
      return allPayments.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
    enabled: !!contactId,
  });

  // Payment notes from contact
  const paymentNotes = (contact as any).payment_notes || '';
  const lastNote = (() => {
    const parts = paymentNotes.split('\n---\n').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1].trim() : '';
  })();

  // Group payments by service
  const paymentsByService = useMemo(() => {
    const groups: Record<string, { serviceName: string; payments: any[] }> = {};
    beneficiaryPayments.forEach((p: any) => {
      const lead = p.opportunities?.leads;
      const serviceTypeId = lead?.service_type_id || 'unknown';
      const serviceTypeName = serviceTypeId !== 'unknown' && pendingServiceTypes
        ? pendingServiceTypes.find((st: any) => st.id === serviceTypeId)?.name || SERVICE_INTEREST_LABELS[lead?.service_interest || 'OUTRO']
        : SERVICE_INTEREST_LABELS[lead?.service_interest || 'OUTRO'] || 'Serviço';
      if (!groups[serviceTypeId]) {
        groups[serviceTypeId] = { serviceName: serviceTypeName, payments: [] };
      }
      groups[serviceTypeId].payments.push(p);
    });
    return Object.values(groups);
  }, [beneficiaryPayments, pendingServiceTypes]);

  // Filter out leads that already have a linked service_case
  const existingServiceTypeIds = new Set(beneficiaryServiceCases.map((sc: any) => sc.service_type));
  const trulyPendingLeads = pendingBeneficiaryLeads.filter(l => !existingServiceTypeIds.has(l.service_interest));

  const allItems = [
    ...beneficiaryServiceCases.map((sc: any) => ({ type: 'case' as const, data: sc })),
    ...trulyPendingLeads.map(l => ({ type: 'pending' as const, data: l })),
  ];

  // Fetch titular's opportunities
  const { data: titularOpportunities = [] } = useQuery({
    queryKey: ['titular-opportunities', contact.linked_principal_contact_id],
    queryFn: async () => {
      const titularId = contact.linked_principal_contact_id;
      if (!titularId) return [];
      const { data: leads } = await supabase.from('leads').select('id').eq('contact_id', titularId);
      if (!leads?.length) return [];
      const { data: opps } = await supabase.from('opportunities').select('id, lead_id, status, total_amount').in('lead_id', leads.map(l => l.id));
      return opps || [];
    },
    enabled: !!contact.linked_principal_contact_id && showNewDialog,
  });

  // Find contract_beneficiary record for this contact
  const { data: beneficiaryRecord } = useQuery({
    queryKey: ['beneficiary-record', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contract_beneficiaries')
        .select('id, contract_id')
        .eq('contact_id', contactId)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!contactId && showNewDialog,
  });

  const createServiceMutation = useMutation({
    mutationFn: async () => {
      if (!titularOpportunities.length) throw new Error('Nenhuma oportunidade encontrada para o titular');
      if (!serviceType || !sector) throw new Error('Selecione tipo de serviço e setor');

      const opportunityId = titularOpportunities[0].id;

      const { data: newCase, error: caseError } = await supabase
        .from('service_cases')
        .insert([{
          opportunity_id: opportunityId,
          service_type: serviceType as any,
          sector: sector as any,
          technical_status: 'CONTATO_INICIAL' as any,
        }])
        .select()
        .single();

      if (caseError) throw caseError;

      if (beneficiaryRecord) {
        const { error: linkError } = await supabase
          .from('contract_beneficiaries')
          .update({ service_case_id: newCase.id })
          .eq('id', beneficiaryRecord.id);
        if (linkError) throw linkError;
      }

      return newCase;
    },
    onSuccess: (newCase) => {
      queryClient.invalidateQueries({ queryKey: ['beneficiary-service-cases'] });
      toast({ title: 'Serviço criado com sucesso' });
      setShowNewDialog(false);
      setServiceType('');
      setSector('');
      navigate(`/cases/${newCase.id}`);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar serviço', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Serviços & Pagamentos ({allItems.length})
            </CardTitle>
            <CardDescription>Serviços contratados, pagamentos e acordo financeiro</CardDescription>
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

          {benefCasesLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : allItems.length === 0 && paymentsByService.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum serviço ou pagamento registrado.
            </p>
          ) : (
            <div className="space-y-4">
              {allItems.map((item) => {
                if (item.type === 'case') {
                  const sc = item.data;
                  const displayName = SERVICE_INTEREST_LABELS[sc.service_type as keyof typeof SERVICE_INTEREST_LABELS] || sc.service_type;
                  // Find payments for this service case
                  const casePayments = paymentsByService.find(g => g.serviceName === displayName)?.payments || [];
                  const isCaseCompleted = sc.technical_status === 'ENCERRADO_APROVADO' || sc.technical_status === 'ENCERRADO_NEGADO';
                  const allCasePaymentsPaid = casePayments.length > 0 && casePayments.every((p: any) => p.status === 'CONFIRMADO');

                  return (
                    <div key={sc.id} className={`rounded-lg border overflow-hidden ${isCaseCompleted ? 'opacity-60' : ''}`}>
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/cases/${sc.id}`)}
                      >
                        <div>
                          <p className={`font-medium ${isCaseCompleted ? 'text-muted-foreground' : ''}`}>{displayName}</p>
                          <p className="text-sm text-muted-foreground">
                            Setor: {SECTOR_LABELS_MAP[sc.sector as keyof typeof SECTOR_LABELS_MAP] || sc.sector} • Criado em {format(new Date(sc.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isCaseCompleted && (
                            <StatusBadge variant="success" label="Concluído" />
                          )}
                          {allCasePaymentsPaid && casePayments.length > 0 && (
                            <StatusBadge variant="success" label="Quitado" />
                          )}
                          {!isCaseCompleted && (
                            <StatusBadge
                              status={sc.technical_status || 'CONTATO_INICIAL'}
                              label={TECHNICAL_STATUS_LABELS[sc.technical_status as keyof typeof TECHNICAL_STATUS_LABELS] || sc.technical_status}
                            />
                          )}
                        </div>
                      </div>
                      {/* Payments for this service */}
                      {casePayments.length > 0 && (
                        <div className="border-t bg-muted/10 px-3 py-2 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {casePayments.length} pagamento{casePayments.length > 1 ? 's' : ''}
                          </p>
                          {casePayments.map((payment: any) => (
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
                                {payment.status === 'PENDENTE' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const leadData = payment.opportunities?.leads;
                                      const serviceTypeId = leadData?.service_type_id || '';
                                      const groupPayments = casePayments.filter((p: any) => p.payment_form === 'PARCELADO');
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
                                        fees: extractFeesFromNotes(serviceTypeId),
                                      });
                                      setShowPaymentAgreement(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                } else {
                  const lead = item.data;
                  const stName = lead.service_type_id
                    ? pendingServiceTypes?.find(st => st.id === lead.service_type_id)?.name
                    : null;
                  const displayName = stName || SERVICE_INTEREST_LABELS[lead.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || lead.service_interest;
                  const leadPayments = paymentsByService.find(g => g.serviceName === displayName)?.payments || [];

                  return (
                    <div key={lead.id} className="rounded-lg border overflow-hidden">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/crm/leads/${lead.id}`)}
                      >
                        <div>
                          <p className="font-medium">{displayName}</p>
                          <p className="text-sm text-muted-foreground">
                            Criado em {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                          Aguardando Pagamento
                        </Badge>
                      </div>
                      {/* Payments for this pending lead */}
                      {leadPayments.length > 0 && (
                        <div className="border-t bg-muted/10 px-3 py-2 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {leadPayments.length} pagamento{leadPayments.length > 1 ? 's' : ''}
                          </p>
                          {leadPayments.map((payment: any) => (
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
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge
                                  status={payment.status || 'PENDENTE'}
                                  label={PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status}
                                />
                                {payment.status === 'PENDENTE' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const leadData = payment.opportunities?.leads;
                                      const serviceTypeId = leadData?.service_type_id || '';
                                      const groupPayments = leadPayments.filter((p: any) => p.payment_form === 'PARCELADO');
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
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
              })}

              {/* Orphan payment groups */}
              {paymentsByService
                .filter(group => {
                  return !allItems.some(item => {
                    const name = item.type === 'case'
                      ? (SERVICE_INTEREST_LABELS[item.data.service_type as keyof typeof SERVICE_INTEREST_LABELS] || item.data.service_type)
                      : (item.data.service_type_id ? pendingServiceTypes?.find(st => st.id === item.data.service_type_id)?.name : null) || SERVICE_INTEREST_LABELS[item.data.service_interest as keyof typeof SERVICE_INTEREST_LABELS] || item.data.service_interest;
                    return group.serviceName === name;
                  });
                })
                .map((group, gIdx) => (
                  <div key={`orphan-${gIdx}`} className="rounded-lg border overflow-hidden">
                    <div className="p-3">
                      <p className="font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        {group.serviceName}
                      </p>
                    </div>
                    <div className="border-t bg-muted/10 px-3 py-2 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {group.payments.length} pagamento{group.payments.length > 1 ? 's' : ''}
                      </p>
                      {group.payments.map((payment: any) => (
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
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge
                              status={payment.status || 'PENDENTE'}
                              label={PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status}
                            />
                            {payment.status === 'PENDENTE' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const leadData = payment.opportunities?.leads;
                                  const serviceTypeId = leadData?.service_type_id || '';
                                  const groupPayments = group.payments.filter((p: any) => p.payment_form === 'PARCELADO');
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
                      ))}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Agreement Dialog */}
      <PaymentAgreementDialog
        open={showPaymentAgreement}
        onOpenChange={setShowPaymentAgreement}
        contactId={contactId}
        contactName={contact.full_name}
        initialData={editPaymentData || undefined}
      />

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Serviço para Beneficiário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo de Serviço *</Label>
              <ServiceTypeCombobox
                value={serviceType}
                onValueChange={setServiceType}
                serviceTypes={pendingServiceTypes?.map(st => ({ code: st.code, name: st.name })) || []}
                placeholder="Selecione o serviço..."
              />
            </div>
            <div>
              <Label>Setor *</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SECTOR_LABELS_MAP).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!contact.linked_principal_contact_id && (
              <p className="text-sm text-destructive">
                Este beneficiário não está vinculado a um titular. Vincule-o primeiro.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createServiceMutation.mutate()}
              disabled={!serviceType || !sector || !contact.linked_principal_contact_id || createServiceMutation.isPending}
            >
              {createServiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}