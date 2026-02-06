import { useParams, useNavigate } from 'react-router-dom';
import { useLead, useLeads } from '@/hooks/useLeads';
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
import { ArrowLeft, Check, Phone, Mail, MessageSquare, Calendar, User, UserPlus, Globe, Trash2, Pencil } from 'lucide-react';
import { LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS, INTERACTION_CHANNEL_LABELS, ORIGIN_CHANNEL_LABELS, OriginChannel } from '@/types/database';
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
  const { updateLead, confirmInterest, deleteLead } = useLeads();
  const { updateContact } = useContacts();
  const { interactions, createInteraction } = useInteractions(lead?.contact_id, id);
  const { data: profiles } = useProfiles();
  
  const [newNote, setNewNote] = useState('');
  const [interactionChannel, setInteractionChannel] = useState<string>('WHATSAPP');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
    navigate('/crm/opportunities');
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
    await updateLead.mutateAsync({ id: lead.id, status: status as any });
  };

  const handleDeleteLead = async () => {
    await deleteLead.mutateAsync(lead.id);
    navigate('/crm/leads');
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
            {!lead.interest_confirmed && (
              <Button onClick={handleConfirmInterest} disabled={confirmInterest.isPending}>
                <Check className="h-4 w-4 mr-2" />
                {confirmInterest.isPending ? 'Confirmando...' : 'Confirmar Interesse'}
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

            <div>
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Responsável
              </p>
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
              <TabsTrigger value="interactions">Interações Sistema</TabsTrigger>
            </TabsList>
            
            <TabsContent value="chat" className="mt-4">
              <LeadChat leadId={lead.id} contactPhone={lead.contacts?.phone || null} />
            </TabsContent>
            
            <TabsContent value="interactions" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Histórico de Interações</CardTitle>
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
