import { useParams, useNavigate } from 'react-router-dom';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Check, Phone, Mail, MessageSquare, Calendar, User, UserPlus, Globe, Trash2, Pencil, ShieldAlert, X, Pause, CalendarClock, RefreshCw } from 'lucide-react';
import { LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS, INTERACTION_CHANNEL_LABELS, ORIGIN_CHANNEL_LABELS, OriginChannel } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadChat } from '@/components/crm/LeadChat';
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
  const { hasAnyRole, user } = useAuth();
  const canReassign = hasAnyRole(['ADMIN', 'MANAGER', 'SUPERVISOR']);
  
  const [newNote, setNewNote] = useState('');
  const [interactionChannel, setInteractionChannel] = useState<string>('WHATSAPP');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editingInteractionContent, setEditingInteractionContent] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    email: '',
  });

  // Sync edit form with lead data
  useEffect(() => {
    if (lead?.contacts) {
      setEditForm({
        full_name: lead.contacts.full_name || '',
        phone: lead.contacts.phone?.toString() || '',
        email: lead.contacts.email || '',
      });
    }
  }, [lead?.contacts]);

  const handleSaveContact = async () => {
    if (!lead?.contact_id || !editForm.full_name.trim()) return;
    
    await updateContact.mutateAsync({
      id: lead.contact_id,
      full_name: editForm.full_name.trim(),
      phone: editForm.phone ? parseInt(editForm.phone.replace(/\D/g, '')) : null,
      email: editForm.email.trim() || null,
    });
    
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
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="edit-name">Nome *</Label>
                    <Input
                      id="edit-name"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      placeholder="Nome completo"
                    />
                  </div>
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

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2">Serviço de Interesse</p>
              <StatusBadge 
                status={lead.service_interest || 'OUTRO'} 
                label={SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO']} 
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Status</p>
              <Select value={lead.status || 'NOVO'} onValueChange={handleStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
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
              <LeadChat leadId={lead.id} contactPhone={lead.contacts?.phone || null} />
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
                            <div className="flex items-center justify-between">
                              <StatusBadge 
                                status={interaction.channel || 'OUTRO'} 
                                label={INTERACTION_CHANNEL_LABELS[interaction.channel || 'OUTRO']}
                              />
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
                              <div className="flex gap-2">
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
