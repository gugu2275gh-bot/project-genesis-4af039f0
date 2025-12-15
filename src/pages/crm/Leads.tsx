import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { useContacts, ContactInsert } from '@/hooks/useContacts';
import { useLeadSLAAlerts } from '@/hooks/useLeadSLAAlerts';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye } from 'lucide-react';
import { LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Leads() {
  const navigate = useNavigate();
  const { leads, isLoading, createLead } = useLeads();
  const { createContact } = useContacts();
  useLeadSLAAlerts(); // Monitor leads waiting > 2h
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    full_name: '',
    email: '',
    phone: '',
    service_interest: 'VISTO_ESTUDANTE' as any,
  });

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.contacts?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      l.contacts?.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.contacts?.phone?.toString().includes(search);
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (!newLead.full_name) return;
    
    // Convert phone string to number
    const phoneNumber = newLead.phone ? parseInt(newLead.phone.replace(/\D/g, ''), 10) : undefined;
    
    // First create contact
    const contact = await createContact.mutateAsync({
      full_name: newLead.full_name,
      email: newLead.email || undefined,
      phone: phoneNumber,
      origin_channel: 'WHATSAPP',
      preferred_language: 'pt',
    });

    // Then create lead
    await createLead.mutateAsync({
      contact_id: contact.id,
      service_interest: newLead.service_interest,
      status: 'NOVO',
    });

    setIsDialogOpen(false);
    setNewLead({
      full_name: '',
      email: '',
      phone: '',
      service_interest: 'VISTO_ESTUDANTE',
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
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={createLead.isPending}>
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
            {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
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
