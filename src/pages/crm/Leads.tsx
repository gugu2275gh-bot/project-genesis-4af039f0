import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { useContacts } from '@/hooks/useContacts';
import { useLeadSLAAlerts } from '@/hooks/useLeadSLAAlerts';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, UserPlus, Users } from 'lucide-react';
import { LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS, ORIGIN_CHANNEL_LABELS, OriginChannel } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Leads() {
  const navigate = useNavigate();
  const { leads, isLoading, createLead } = useLeads();
  const { contacts, createContact } = useContacts();
  useLeadSLAAlerts();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [leadMode, setLeadMode] = useState<'new' | 'existing'>('new');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactSearch, setContactSearch] = useState('');
  const [newLead, setNewLead] = useState({
    full_name: '',
    email: '',
    phone: '',
    service_interest: 'VISTO_ESTUDANTE' as any,
    service_interest_other: '',
    origin_channel: 'WHATSAPP' as OriginChannel,
    referral_name: '',
  });

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts?.slice(0, 20) || [];
    const lower = contactSearch.toLowerCase();
    return (contacts || []).filter(c =>
      c.full_name.toLowerCase().includes(lower) ||
      c.email?.toLowerCase().includes(lower) ||
      c.phone?.toString().includes(contactSearch)
    ).slice(0, 20);
  }, [contacts, contactSearch]);

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.contacts?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.contacts?.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.contacts?.phone?.toString().includes(search);
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (leadMode === 'existing') {
      if (!selectedContactId) return;
      await createLead.mutateAsync({
        contact_id: selectedContactId,
        service_interest: newLead.service_interest,
        status: 'NOVO',
        notes: newLead.service_interest === 'OUTRO' && newLead.service_interest_other
          ? `Serviço: ${newLead.service_interest_other}`
          : undefined,
      });
    } else {
      if (!newLead.full_name) return;
      const phoneNumber = newLead.phone ? parseInt(newLead.phone.replace(/\D/g, ''), 10) : undefined;
      const contact = await createContact.mutateAsync({
        full_name: newLead.full_name,
        email: newLead.email || undefined,
        phone: phoneNumber,
        origin_channel: newLead.origin_channel,
        referral_name: newLead.origin_channel === 'COLABORADOR' ? newLead.referral_name : undefined,
        preferred_language: 'pt',
      });
      await createLead.mutateAsync({
        contact_id: contact.id,
        service_interest: newLead.service_interest,
        status: 'NOVO',
        notes: newLead.service_interest === 'OUTRO' && newLead.service_interest_other
          ? `Serviço: ${newLead.service_interest_other}`
          : undefined,
      });
    }

    setIsDialogOpen(false);
    setLeadMode('new');
    setSelectedContactId('');
    setContactSearch('');
    setNewLead({
      full_name: '',
      email: '',
      phone: '',
      service_interest: 'VISTO_ESTUDANTE',
      service_interest_other: '',
      origin_channel: 'WHATSAPP',
      referral_name: '',
    });
  };

  const columns: Column<typeof leads[0]>[] = [
    {
      key: 'contacts',
      header: 'Cliente',
      cell: (lead) => (
        <div>
          <div className="font-medium">{lead.contacts?.full_name}</div>
          <div className="text-sm text-muted-foreground">{lead.contacts?.email}</div>
        </div>
      ),
    },
    {
      key: 'service_interest',
      header: 'Serviço',
      cell: (lead) => SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO'],
    },
    {
      key: 'status',
      header: 'Status',
      cell: (lead) => (
        <StatusBadge 
          status={lead.status || 'NOVO'} 
          label={LEAD_STATUS_LABELS[lead.status || 'NOVO']} 
        />
      ),
    },
    {
      key: 'interest_confirmed',
      header: 'Interesse',
      cell: (lead) => (
        <span className={lead.interest_confirmed ? 'text-green-600' : 'text-muted-foreground'}>
          {lead.interest_confirmed ? 'Confirmado' : 'Pendente'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Data',
      cell: (lead) => format(new Date(lead.created_at!), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    },
    {
      key: 'actions',
      header: '',
      cell: (lead) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/crm/leads/${lead.id}`);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Caixa de entrada de leads e oportunidades"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={leadMode === 'new' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setLeadMode('new')}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Novo Contato
                  </Button>
                  <Button
                    type="button"
                    variant={leadMode === 'existing' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setLeadMode('existing')}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Contato Existente
                  </Button>
                </div>

                {leadMode === 'existing' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Ideal para clientes com contrato cancelado que desejam iniciar um novo serviço.
                    </p>
                    <div>
                      <Label>Buscar Contato</Label>
                      <Input
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        placeholder="Nome, e-mail ou telefone..."
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto border rounded-md">
                      {filteredContacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3 text-center">Nenhum contato encontrado</p>
                      ) : (
                        filteredContacts.map(contact => (
                          <div
                            key={contact.id}
                            className={`p-3 cursor-pointer border-b last:border-b-0 hover:bg-accent transition-colors ${selectedContactId === contact.id ? 'bg-accent' : ''}`}
                            onClick={() => setSelectedContactId(contact.id)}
                          >
                            <div className="font-medium text-sm">{contact.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {contact.email && <span>{contact.email}</span>}
                              {contact.phone && <span> · {contact.phone}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Nome Completo *</Label>
                      <Input
                        value={newLead.full_name}
                        onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                        placeholder="Nome do cliente"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Telefone</Label>
                        <Input
                          value={newLead.phone}
                          onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                          placeholder="+55 11 99999-9999"
                        />
                      </div>
                      <div>
                        <Label>E-mail</Label>
                        <Input
                          value={newLead.email}
                          onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                          placeholder="email@exemplo.com"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Canal de Origem</Label>
                      <Select
                        value={newLead.origin_channel}
                        onValueChange={(v: OriginChannel) => setNewLead({ ...newLead, origin_channel: v, referral_name: '' })}
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
                    {newLead.origin_channel === 'COLABORADOR' && (
                      <div>
                        <Label>Nome do Colaborador</Label>
                        <Input
                          value={newLead.referral_name}
                          onChange={(e) => setNewLead({ ...newLead, referral_name: e.target.value })}
                          placeholder="Nome do colaborador que indicou"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <Label>Serviço de Interesse</Label>
                  <Select
                    value={newLead.service_interest}
                    onValueChange={(v: any) => setNewLead({ ...newLead, service_interest: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_INTEREST_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newLead.service_interest === 'OUTRO' && (
                  <div>
                    <Label>Especifique o serviço</Label>
                    <Input
                      value={newLead.service_interest_other}
                      onChange={(e) => setNewLead({ ...newLead, service_interest_other: e.target.value })}
                      placeholder="Descreva o serviço de interesse"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={createLead.isPending || (leadMode === 'new' && !newLead.full_name) || (leadMode === 'existing' && !selectedContactId)}
                  >
                    {createLead.isPending ? 'Criando...' : 'Criar Lead'}
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
            placeholder="Buscar leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(LEAD_STATUS_LABELS)
              .filter(([value]) => !['DADOS_INCOMPLETOS', 'INTERESSE_PENDENTE'].includes(value))
              .map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredLeads}
        loading={isLoading}
        emptyMessage="Nenhum lead encontrado"
        onRowClick={(lead) => navigate(`/crm/leads/${lead.id}`)}
      />
    </div>
  );
}
