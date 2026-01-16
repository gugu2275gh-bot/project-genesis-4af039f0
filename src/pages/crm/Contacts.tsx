import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContacts, ContactInsert } from '@/hooks/useContacts';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Phone, Mail } from 'lucide-react';
import { ORIGIN_CHANNEL_LABELS, LANGUAGE_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';

export default function Contacts() {
  const navigate = useNavigate();
  const { contacts, isLoading, createContact } = useContacts();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [newContact, setNewContact] = useState<Omit<Partial<ContactInsert>, 'phone'>>({
    full_name: '',
    email: '',
    origin_channel: 'WHATSAPP',
    preferred_language: 'pt',
  });

  const filteredContacts = contacts.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.toString().includes(search)
  );

  const handleCreate = async () => {
    if (!newContact.full_name) return;
    // Convert phone string to number
    const phoneNumber = phoneInput ? parseInt(phoneInput.replace(/\D/g, ''), 10) : null;
    await createContact.mutateAsync({ 
      ...newContact, 
      phone: phoneNumber || undefined 
    } as ContactInsert);
    setIsDialogOpen(false);
    setPhoneInput('');
    setNewContact({
      full_name: '',
      email: '',
      origin_channel: 'WHATSAPP',
      preferred_language: 'pt',
    });
  };

  const columns: Column<typeof contacts[0]>[] = [
    {
      key: 'full_name',
      header: 'Nome',
      cell: (contact) => (
        <div className="font-medium">{contact.full_name}</div>
      ),
    },
    {
      key: 'phone',
      header: 'Telefone',
      cell: (contact) => (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          {contact.phone || '-'}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      cell: (contact) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          {contact.email || '-'}
        </div>
      ),
    },
    {
      key: 'origin_channel',
      header: 'Canal',
      cell: (contact) => (
        <StatusBadge 
          status={contact.origin_channel || 'OUTRO'} 
          label={ORIGIN_CHANNEL_LABELS[contact.origin_channel || 'OUTRO']} 
        />
      ),
    },
    {
      key: 'preferred_language',
      header: 'Idioma',
      cell: (contact) => LANGUAGE_LABELS[contact.preferred_language || 'pt'],
    },
    {
      key: 'nationality',
      header: 'Nacionalidade',
      cell: (contact) => contact.nationality || '-',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contatos"
        description="Gerenciar todos os contatos registrados"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Contato
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Contato</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome Completo *</Label>
                  <Input
                    value={newContact.full_name}
                    onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
                    placeholder="Nome do contato"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                      value={newContact.email || ''}
                      onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Canal de Origem</Label>
                    <Select
                      value={newContact.origin_channel}
                      onValueChange={(v: any) => setNewContact({ ...newContact, origin_channel: v })}
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
                      value={newContact.preferred_language}
                      onValueChange={(v: any) => setNewContact({ ...newContact, preferred_language: v })}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>País de Origem</Label>
                    <Input
                      value={newContact.country_of_origin || ''}
                      onChange={(e) => setNewContact({ ...newContact, country_of_origin: e.target.value })}
                      placeholder="Brasil"
                    />
                  </div>
                  <div>
                    <Label>Nacionalidade</Label>
                    <Input
                      value={newContact.nationality || ''}
                      onChange={(e) => setNewContact({ ...newContact, nationality: e.target.value })}
                      placeholder="Brasileira"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={createContact.isPending}>
                    {createContact.isPending ? 'Criando...' : 'Criar Contato'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredContacts}
        loading={isLoading}
        emptyMessage="Nenhum contato encontrado"
        onRowClick={(contact) => navigate(`/crm/contacts/${contact.id}`)}
      />
    </div>
  );
}
