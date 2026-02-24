import { useState, useMemo } from 'react';
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
  CreditCard,
  Calendar,
  Briefcase,
  Baby
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
  const { leads } = useLeads();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedContact, setEditedContact] = useState<Partial<ContactUpdate>>({});
  const [phoneInput, setPhoneInput] = useState('');

  const contactLeads = leads.filter(l => l.contact_id === id);

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
