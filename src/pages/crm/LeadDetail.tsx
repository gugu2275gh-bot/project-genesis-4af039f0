import { useParams, useNavigate } from 'react-router-dom';
import { ServiceTypeCombobox } from '@/components/ui/service-type-combobox';
import { useLead, useLeads } from '@/hooks/useLeads';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useInteractions } from '@/hooks/useInteractions';
import { useProfiles } from '@/hooks/useProfiles';
import { useContacts } from '@/hooks/useContacts';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Check, Phone, Mail, MessageSquare, Calendar, User, UserPlus, Globe, Trash2, Pencil, ShieldAlert, X, Pause, CalendarClock, RefreshCw, MapPin, FileText, Briefcase, GraduationCap, Heart, Flag, DollarSign } from 'lucide-react';
import { LEAD_STATUS_LABELS, INTERACTION_CHANNEL_LABELS, ORIGIN_CHANNEL_LABELS, OriginChannel } from '@/types/database';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadChat } from '@/components/crm/LeadChat';
import { PaymentAgreementDialog } from '@/components/crm/PaymentAgreementDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lead, isLoading } = useLead(id);
  const { updateLead, confirmInterest, deleteLead, createLeadForContact } = useLeads();

  // Check if lead has a cancelled contract (via opportunity)
  const { data: hasCancelledContract } = useQuery({
    queryKey: ['lead-cancelled-contract', id],
    queryFn: async () => {
      if (!id) return false;
      const { data: opps } = await supabase
        .from('opportunities')
        .select('id')
        .eq('lead_id', id);
      if (!opps?.length) return false;
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id')
        .in('opportunity_id', opps.map(o => o.id))
        .eq('status', 'CANCELADO')
        .limit(1);
      return (contracts?.length ?? 0) > 0;
    },
    enabled: !!id,
  });
  const { updateContact } = useContacts();
  const { interactions, createInteraction, updateInteraction, deleteInteraction, isEditable } = useInteractions(lead?.contact_id, id);
  const { data: profiles } = useProfiles();
  const { data: serviceTypes } = useServiceTypes();
  const { hasAnyRole, user } = useAuth();
  const canReassign = hasAnyRole(['ADMIN', 'MANAGER', 'SUPERVISOR']);

  const serviceTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    serviceTypes?.forEach(st => { map[st.code] = st.name; });
    return map;
  }, [serviceTypes]);

  const serviceTypeIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    serviceTypes?.forEach(st => { map[st.id] = st.name; });
    return map;
  }, [serviceTypes]);
  
  const [newNote, setNewNote] = useState('');
  const [interactionChannel, setInteractionChannel] = useState<string>('WHATSAPP');
  const [interactionSector, setInteractionSector] = useState<string>('atendimento');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editingInteractionContent, setEditingInteractionContent] = useState('');
  const [editingInteractionChannel, setEditingInteractionChannel] = useState<string>('WHATSAPP');
  const [followUpDate, setFollowUpDate] = useState('');
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [showPaymentAgreement, setShowPaymentAgreement] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    nationality: '',
    country_of_origin: '',
    birth_date: '',
    document_type: '',
    document_number: '',
    cpf: '',
    address: '',
    civil_status: '',
    profession: '',
    education_level: '',
    service_interest: '',
  });

  // Sync edit form with lead data
  useEffect(() => {
    if (lead?.contacts) {
      setEditForm({
        full_name: lead.contacts.full_name || '',
        phone: lead.contacts.phone?.toString() || '',
        email: lead.contacts.email || '',
        nationality: (lead.contacts as any).nationality || '',
        country_of_origin: (lead.contacts as any).country_of_origin || '',
        birth_date: (lead.contacts as any).birth_date || '',
        document_type: (lead.contacts as any).document_type || '',
        document_number: (lead.contacts as any).document_number || '',
        cpf: (lead.contacts as any).cpf || '',
        address: (lead.contacts as any).address || '',
        civil_status: (lead.contacts as any).civil_status || '',
        profession: (lead.contacts as any).profession || '',
        education_level: (lead.contacts as any).education_level || '',
        service_interest: lead.service_interest || '',
      });
    }
  }, [lead?.contacts]);

  const handleSaveContact = async () => {
    if (!lead?.contact_id || !editForm.full_name.trim()) return;
    
    await updateContact.mutateAsync({
      id: lead.contact_id,
      full_name: editForm.full_name.trim(),
      phone: editForm.phone ? editForm.phone.replace(/\D/g, '') : null,
      email: editForm.email.trim() || null,
      nationality: editForm.nationality.trim() || null,
      country_of_origin: editForm.country_of_origin.trim() || null,
      birth_date: editForm.birth_date || null,
      document_type: editForm.document_type.trim() || null,
      document_number: editForm.document_number.trim() || null,
      cpf: editForm.cpf.trim() || null,
      address: editForm.address.trim() || null,
      civil_status: editForm.civil_status.trim() || null,
      profession: editForm.profession.trim() || null,
      education_level: editForm.education_level.trim() || null,
    });

    // Update service_interest on the lead if changed
    if (editForm.service_interest && editForm.service_interest !== lead.service_interest) {
      const VALID_SERVICE_INTERESTS = [
        'VISTO_ESTUDANTE', 'VISTO_TRABALHO', 'REAGRUPAMENTO',
        'RENOVACAO_RESIDENCIA', 'NACIONALIDADE_RESIDENCIA',
        'NACIONALIDADE_CASAMENTO', 'OUTRO', 'RESIDENCIA_PARENTE_COMUNITARIO'
      ];
      const selectedST = serviceTypes?.find(st => st.code === editForm.service_interest);
      const isValidEnum = VALID_SERVICE_INTERESTS.includes(editForm.service_interest);
      await updateLead.mutateAsync({
        id: lead.id,
        service_interest: (isValidEnum ? editForm.service_interest : 'OUTRO') as any,
        service_type_id: selectedST?.id || null,
      });
    }
    
    // Invalidate lead query to refresh data
    queryClient.invalidateQueries({ queryKey: ['leads', id] });
    setIsEditDialogOpen(false);
  };

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

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Lead não encontrado</p>
        <Button variant="link" onClick={() => navigate('/crm/leads')}>
          Voltar para leads
        </Button>
      </div>
    );
  }

  const handleConfirmInterest = async () => {
    await confirmInterest.mutateAsync(lead.id);
  };

  const handleAddInteraction = async () => {
    if (!newNote.trim()) return;
    await createInteraction.mutateAsync({
      lead_id: lead.id,
      contact_id: lead.contact_id,
      channel: interactionChannel as any,
      direction: 'OUTBOUND',
      content: newNote,
      sector: interactionSector,
    });
    setNewNote('');
  };

  const handleStatusChange = async (status: string) => {
    if (status === 'FOLLOW_UP') {
      setFollowUpDate(lead.follow_up_date || '');
      setShowFollowUpDialog(true);
      return;
    }
    if (status === 'INTERESSE_CONFIRMADO' && !lead.interest_confirmed) {
      await handleConfirmInterest();
    } else {
      await updateLead.mutateAsync({ id: lead.id, status: status as any, follow_up_date: null });
    }
  };

  const handleConfirmFollowUp = async () => {
    if (!followUpDate) return;
    await updateLead.mutateAsync({ 
      id: lead.id, 
      status: 'FOLLOW_UP' as any, 
      follow_up_date: followUpDate 
    });
    setShowFollowUpDialog(false);
  };

  const handleDeleteLead = async () => {
    await deleteLead.mutateAsync(lead.id);
    navigate('/crm/leads');
  };

  const handleNewService = async () => {
    if (!lead?.contact_id) return;
    try {
      const newLead = await createLeadForContact.mutateAsync({
        contact_id: lead.contact_id,
        service_interest: lead.service_interest || 'OUTRO',
        notes: `Novo serviço originado do lead anterior (contrato cancelado)`,
      });
      navigate(`/crm/leads/${newLead.id}`);
    } catch (error) {
      // toast handled by hook
    }
  };

  const handleAssign = async (userId: string) => {
    await updateLead.mutateAsync({ id: lead.id, assigned_to_user_id: userId === 'unassigned' ? null : userId });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/crm/leads')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {lead.contacts?.full_name}
          </div>
        }
        description={`Lead criado em ${format(new Date(lead.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={
          <div className="flex items-center gap-2">
            {hasCancelledContract && (
              <Button onClick={handleNewService} disabled={createLeadForContact.isPending} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                {createLeadForContact.isPending ? 'Criando...' : 'Novo Serviço'}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
                    Todas as interações e tarefas relacionadas também serão excluídas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteLead}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteLead.isPending ? 'Excluindo...' : 'Confirmar Exclusão'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Informações do Lead</CardTitle>
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar Dados do Cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div>
                    <Label htmlFor="edit-name">Nome *</Label>
                    <Input
                      id="edit-name"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-phone">Telefone</Label>
                      <Input
                        id="edit-phone"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="Ex: 5511999999999"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-email">E-mail</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                  </div>
                  
                  <div className="border-t pt-4 mt-2">
                    <p className="text-sm font-medium text-muted-foreground mb-3">Dados Adicionais</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-nationality">Nacionalidade</Label>
                      <Input
                        id="edit-nationality"
                        value={editForm.nationality}
                        onChange={(e) => setEditForm({ ...editForm, nationality: e.target.value })}
                        placeholder="Ex: Brasileira"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-country">País de Origem</Label>
                      <Input
                        id="edit-country"
                        value={editForm.country_of_origin}
                        onChange={(e) => setEditForm({ ...editForm, country_of_origin: e.target.value })}
                        placeholder="Ex: Brasil"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-birth-date">Data de Nascimento</Label>
                      <Input
                        id="edit-birth-date"
                        type="date"
                        value={editForm.birth_date}
                        onChange={(e) => setEditForm({ ...editForm, birth_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-cpf">CPF</Label>
                      <Input
                        id="edit-cpf"
                        value={editForm.cpf}
                        onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })}
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-doc-type">Tipo de Documento</Label>
                      <Input
                        id="edit-doc-type"
                        value={editForm.document_type}
                        onChange={(e) => setEditForm({ ...editForm, document_type: e.target.value })}
                        placeholder="Ex: Passaporte"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-doc-number">Nº Documento</Label>
                      <Input
                        id="edit-doc-number"
                        value={editForm.document_number}
                        onChange={(e) => setEditForm({ ...editForm, document_number: e.target.value })}
                        placeholder="Número do documento"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="edit-address">Endereço</Label>
                    <Input
                      id="edit-address"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      placeholder="Endereço completo"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-civil-status">Estado Civil</Label>
                      <Input
                        id="edit-civil-status"
                        value={editForm.civil_status}
                        onChange={(e) => setEditForm({ ...editForm, civil_status: e.target.value })}
                        placeholder="Ex: Solteiro(a)"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-profession">Profissão</Label>
                      <Input
                        id="edit-profession"
                        value={editForm.profession}
                        onChange={(e) => setEditForm({ ...editForm, profession: e.target.value })}
                        placeholder="Profissão"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="edit-education">Escolaridade</Label>
                    <Input
                      id="edit-education"
                      value={editForm.education_level}
                      onChange={(e) => setEditForm({ ...editForm, education_level: e.target.value })}
                      placeholder="Ex: Ensino Superior"
                    />
                  </div>

                  <div>
                    <Label htmlFor="edit-service-interest">Serviço de Interesse</Label>
                    <ServiceTypeCombobox
                      value={editForm.service_interest}
                      onValueChange={(value) => setEditForm({ ...editForm, service_interest: value })}
                      serviceTypes={serviceTypes}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleSaveContact} 
                      disabled={!editForm.full_name.trim() || updateContact.isPending}
                    >
                      {updateContact.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{lead.contacts?.full_name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{lead.contacts?.phone || 'Não informado'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{lead.contacts?.email || 'Não informado'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Canal de Origem</p>
                <p className="font-medium">
                  {ORIGIN_CHANNEL_LABELS[(lead.contacts?.origin_channel as OriginChannel) || 'OUTRO']}
                </p>
              </div>
            </div>
            
            {lead.contacts?.origin_channel === 'COLABORADOR' && (
              <div className="flex items-center gap-3">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Nome do Colaborador</p>
                  <p className="font-medium">{lead.contacts?.referral_name || 'Não informado'}</p>
                </div>
              </div>
            )}

            {/* Additional contact fields - shown when filled */}
            {(lead.contacts as any)?.nationality && (
              <div className="flex items-center gap-3">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Nacionalidade</p>
                  <p className="font-medium">{(lead.contacts as any).nationality}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.country_of_origin && (
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">País de Origem</p>
                  <p className="font-medium">{(lead.contacts as any).country_of_origin}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.birth_date && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Data de Nascimento</p>
                  <p className="font-medium">{format(new Date((lead.contacts as any).birth_date + 'T00:00:00'), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.cpf && (
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">CPF</p>
                  <p className="font-medium">{(lead.contacts as any).cpf}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.document_type && (
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{(lead.contacts as any).document_type}</p>
                  <p className="font-medium">{(lead.contacts as any).document_number || '-'}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.address && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Endereço</p>
                  <p className="font-medium">{(lead.contacts as any).address}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.civil_status && (
              <div className="flex items-center gap-3">
                <Heart className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Estado Civil</p>
                  <p className="font-medium">{(lead.contacts as any).civil_status}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.profession && (
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Profissão</p>
                  <p className="font-medium">{(lead.contacts as any).profession}</p>
                </div>
              </div>
            )}

            {(lead.contacts as any)?.education_level && (
              <div className="flex items-center gap-3">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Escolaridade</p>
                  <p className="font-medium">{(lead.contacts as any).education_level}</p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Serviço de Interesse</p>
              <StatusBadge 
                status={lead.service_interest || 'OUTRO'} 
                label={
                  (lead.service_type_id && serviceTypeIdMap[lead.service_type_id]) ||
                  serviceTypeMap[lead.service_interest || 'OUTRO'] || 
                  lead.service_interest || 'Outro'
                }
                className="max-w-full truncate inline-block"
                title={
                  (lead.service_type_id && serviceTypeIdMap[lead.service_type_id]) ||
                  serviceTypeMap[lead.service_interest || 'OUTRO'] || 
                  lead.service_interest || 'Outro'
                }
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Status</p>
              <Select value={lead.status || 'NOVO'} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_STATUS_LABELS)
                    .filter(([value]) => !['DADOS_INCOMPLETOS', 'INTERESSE_PENDENTE'].includes(value))
                    .map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {lead.status === 'STANDBY' && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium flex items-center gap-2">
                  <Pause className="h-4 w-4" />
                  Standby — Prazos pausados
                </p>
              </div>
            )}

            {lead.status === 'FOLLOW_UP' && lead.follow_up_date && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Follow-up: {format(new Date(lead.follow_up_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            )}

            {/* Follow-up date dialog */}
            <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Definir Data de Follow-up</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="follow-up-date">Data prevista para retorno *</Label>
                    <Input
                      id="follow-up-date"
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleConfirmFollowUp} disabled={!followUpDate}>
                      Confirmar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                {canReassign ? <ShieldAlert className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                Responsável
              </p>
              {canReassign ? (
                <Select 
                  value={lead.assigned_to_user_id || 'unassigned'} 
                  onValueChange={handleAssign}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Não atribuído" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não atribuído</SelectItem>
                    {profiles?.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium text-sm">
                  {profiles?.find(p => p.id === lead.assigned_to_user_id)?.full_name || 'Não atribuído'}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="special-case"
                checked={lead.is_special_case || false}
                onCheckedChange={async (checked) => {
                  await updateLead.mutateAsync({ id: lead.id, is_special_case: !!checked });
                }}
              />
              <Label htmlFor="special-case" className="cursor-pointer">Caso especial</Label>
            </div>

            {/* Payment Agreement Button */}
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPaymentAgreement(true)}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Forma de Pagamento
              </Button>
              {lead.contact_id && (
                <PaymentAgreementDialog
                  open={showPaymentAgreement}
                  onOpenChange={setShowPaymentAgreement}
                  contactId={lead.contact_id}
                  contactName={lead.contacts?.full_name || ''}
                  serviceTypeId={lead.service_type_id}
                  onServiceTypeChange={async (serviceTypeId) => {
                    await updateLead.mutateAsync({ id: lead.id, service_type_id: serviceTypeId });
                  }}
                />
              )}
            </div>

            {lead.interest_confirmed && (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  ✓ Interesse Confirmado
                </p>
              </div>
            )}

            {lead.notes && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Notas</p>
                <p className="text-sm">{lead.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat and Interactions */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="chat" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">Chat WhatsApp</TabsTrigger>
              <TabsTrigger value="interactions">Histórico de Anotações</TabsTrigger>
            </TabsList>
            
            <TabsContent value="chat" className="mt-4">
              <LeadChat leadId={lead.id} contactPhone={lead.contacts?.phone || null} contactId={lead.contact_id} />
            </TabsContent>
            
            <TabsContent value="interactions" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Histórico de Anotações</CardTitle>
                  <CardDescription>Registre todas as comunicações com o cliente</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Select value={interactionChannel} onValueChange={setInteractionChannel}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(INTERACTION_CHANNEL_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={interactionSector} onValueChange={setInteractionSector}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="atendimento">Atendimento</SelectItem>
                          <SelectItem value="juridico">Jurídico</SelectItem>
                          <SelectItem value="financeiro">Financeiro</SelectItem>
                          <SelectItem value="caso_tecnico">Caso Técnico</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea
                        placeholder="Descreva a interação..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="flex-1"
                        rows={2}
                      />
                      <Button onClick={handleAddInteraction} disabled={createInteraction.isPending}>
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>

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
                            <div className="flex items-center gap-2 justify-between">
                              <div className="flex items-center gap-2">
                                <StatusBadge 
                                  status={interaction.channel || 'OUTRO'} 
                                  label={INTERACTION_CHANNEL_LABELS[interaction.channel || 'OUTRO']}
                                />
                                {(interaction as any).sector && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                                    {{atendimento: 'Atendimento', juridico: 'Jurídico', financeiro: 'Financeiro', caso_tecnico: 'Caso Técnico'}[(interaction as any).sector] || (interaction as any).sector}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(interaction.created_at!), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                {isEditable(interaction.created_at) && interaction.created_by_user_id === user?.id && (
                                  <div className="flex items-center gap-1 ml-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        setEditingInteractionId(interaction.id);
                                        setEditingInteractionContent(interaction.content || '');
                                        setEditingInteractionChannel(interaction.channel || 'WHATSAPP');
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir Interação</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Tem certeza que deseja excluir esta interação?
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteInteraction.mutateAsync(interaction.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                )}
                              </div>
                            </div>
                            {editingInteractionId === interaction.id ? (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Select value={editingInteractionChannel} onValueChange={setEditingInteractionChannel}>
                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(INTERACTION_CHANNEL_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Textarea
                                    value={editingInteractionContent}
                                    onChange={(e) => setEditingInteractionContent(e.target.value)}
                                    rows={2}
                                    className="flex-1"
                                  />
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={async () => {
                                        await updateInteraction.mutateAsync({
                                          id: interaction.id,
                                          content: editingInteractionContent,
                                          channel: editingInteractionChannel,
                                        });
                                        setEditingInteractionId(null);
                                      }}
                                      disabled={updateInteraction.isPending}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => setEditingInteractionId(null)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm">{interaction.content}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
