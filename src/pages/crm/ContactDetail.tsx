import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContact, useContacts, ContactUpdate } from '@/hooks/useContacts';
import { useLeads } from '@/hooks/useLeads';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  CreditCard
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ORIGIN_CHANNEL_LABELS,
  LANGUAGE_LABELS,
  LEAD_STATUS_LABELS,
  SERVICE_INTEREST_LABELS,
  DOCUMENT_TYPE_LABELS,
} from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: contact, isLoading, error } = useContact(id);
  const { updateContact } = useContacts();
  const { leads } = useLeads();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState<Partial<ContactUpdate>>({});
  const [phoneInput, setPhoneInput] = useState('');

  // Get leads for this contact
  const contactLeads = leads.filter(l => l.contact_id === id);

  // Initialize edit state when contact loads
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
      });
      setPhoneInput(contact.phone?.toString() || '');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!id) return;
    
    try {
      const phoneNumber = phoneInput ? parseInt(phoneInput.replace(/\D/g, ''), 10) : null;
      await updateContact.mutateAsync({
        id,
        ...editedContact,
        phone: phoneNumber || undefined,
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

  return (
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
        {/* Main Info */}
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
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <Label>Nome Completo *</Label>
                    <Input
                      value={editedContact.full_name || ''}
                      onChange={(e) => setEditedContact({ ...editedContact, full_name: e.target.value })}
                    />
                  </div>
                  
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
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>País de Origem</Label>
                      <Input
                        value={editedContact.country_of_origin || ''}
                        onChange={(e) => setEditedContact({ ...editedContact, country_of_origin: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Nacionalidade</Label>
                      <Input
                        value={editedContact.nationality || ''}
                        onChange={(e) => setEditedContact({ ...editedContact, nationality: e.target.value })}
                      />
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Documento */}
                  <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>

                  {/* Endereço */}
                  <div>
                    <Label>Endereço</Label>
                    <Textarea
                      value={editedContact.address || ''}
                      onChange={(e) => setEditedContact({ ...editedContact, address: e.target.value })}
                      placeholder="Endereço completo"
                      rows={2}
                    />
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
              ) : (
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
                  
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">País de Origem</p>
                      <p className="font-medium">{contact.country_of_origin || '-'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Nacionalidade</p>
                      <p className="font-medium">{contact.nationality || '-'}</p>
                    </div>
                  </div>

                  {/* Documento */}
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Documento</p>
                      <p className="font-medium">
                        {contact.document_type ? DOCUMENT_TYPE_LABELS[contact.document_type] : '-'}
                        {contact.document_number && ` - ${contact.document_number}`}
                      </p>
                    </div>
                  </div>

                  {/* Endereço */}
                  <div className="flex items-start gap-3 col-span-2">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Endereço</p>
                      <p className="font-medium">{contact.address || '-'}</p>
                    </div>
                  </div>

                  {/* Indicação */}
                  <div className="flex items-center gap-3 col-span-2">
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related Leads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Leads Vinculados ({contactLeads.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contactLeads.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum lead vinculado a este contato.
                </p>
              ) : (
                <div className="space-y-3">
                  {contactLeads.map(lead => (
                    <div 
                      key={lead.id} 
                      className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    >
                      <div>
                        <p className="font-medium">
                          {SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO']}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Criado em {format(new Date(lead.created_at!), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <StatusBadge 
                        status={lead.status || 'NOVO'} 
                        label={LEAD_STATUS_LABELS[lead.status || 'NOVO']} 
                      />
                    </div>
                  ))}
                </div>
              )}
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
        </div>
      </div>
    </div>
  );
}
