import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeads } from '@/hooks/useLeads';
import { supabase } from '@/integrations/supabase/client';
import { useContacts } from '@/hooks/useContacts';
import { useLeadSLAAlerts } from '@/hooks/useLeadSLAAlerts';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { ServiceTypeCombobox } from '@/components/ui/service-type-combobox';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, UserPlus, Users, ChevronRight, ChevronDown, User, AlertTriangle } from 'lucide-react';
import { LEAD_STATUS_LABELS, ORIGIN_CHANNEL_LABELS, OriginChannel } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function Leads() {
  const navigate = useNavigate();
  const { leads, isLoading, createLead } = useLeads();
  const { contacts, createContact } = useContacts();
  const { data: serviceTypes } = useServiceTypes();
  useLeadSLAAlerts();

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

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedClients, setExpandedClients] = useState<Set<string> | null>(null);
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
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);

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

  // Group leads by contact
  const groupedClients = useMemo(() => {
    const map = new Map<string, {
      contactId: string;
      contactName: string;
      contactEmail: string | null;
      contactPhone: string | null;
      leads: typeof filteredLeads;
    }>();

    for (const lead of filteredLeads) {
      const cid = lead.contact_id;
      if (!map.has(cid)) {
        map.set(cid, {
          contactId: cid,
          contactName: lead.contacts?.full_name || 'Sem nome',
          contactEmail: lead.contacts?.email || null,
          contactPhone: lead.contacts?.phone || null,
          leads: [],
        });
      }
      map.get(cid)!.leads.push(lead);
    }

    return Array.from(map.values()).sort((a, b) => {
      const aDate = new Date(a.leads[0]?.created_at || 0).getTime();
      const bDate = new Date(b.leads[0]?.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [filteredLeads]);

  const FINAL_STATUSES = new Set(['ARQUIVADO_SEM_RETORNO', 'CANCELADO', 'PERDIDO']);

  // Start with all clients collapsed
  const resolvedExpanded = useMemo(() => {
    if (expandedClients !== null) return expandedClients;
    return new Set<string>();
  }, [expandedClients]);

  const toggleClient = (contactId: string) => {
    setExpandedClients(prev => {
      const base = prev !== null ? prev : resolvedExpanded;
      const next = new Set(base);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const checkDuplicateContact = async (phone?: string, email?: string) => {
    if (!phone && !email) return null;
    let query = supabase.from('contacts').select('id, full_name, phone, email');
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 8) {
        const { data } = await query.eq('phone', cleanPhone).limit(1);
        if (data?.length) return data[0];
      }
    }
    if (email) {
      const { data } = await supabase.from('contacts').select('id, full_name, phone, email').eq('email', email).limit(1);
      if (data?.length) return data[0];
    }
    return null;
  };

  const checkDuplicateLead = async (contactId: string, serviceInterest: string) => {
    const { data } = await supabase
      .from('leads')
      .select('id, service_interest, service_type_id, status')
      .eq('contact_id', contactId)
      .not('status', 'in', '("ARQUIVADO_SEM_RETORNO","MESCLADO")')
      .limit(10);
    if (!data?.length) return null;
    // Check for same service
    const match = data.find(l => l.service_interest === serviceInterest || l.service_type_id === serviceInterest);
    if (match) return { exact: true, count: data.length };
    if (data.length > 0) return { exact: false, count: data.length };
    return null;
  };

  const handleCreate = async (forceCreate = false) => {
    setDuplicateWarning(null);

    if (leadMode === 'existing') {
      if (!selectedContactId) return;
      
      if (!forceCreate) {
        const dup = await checkDuplicateLead(selectedContactId, newLead.service_interest);
        if (dup?.exact) {
          setDuplicateWarning('Este contato já possui um lead ativo com o mesmo serviço de interesse. Deseja criar mesmo assim?');
          return;
        } else if (dup) {
          setDuplicateWarning(`Este contato já possui ${dup.count} lead(s) ativo(s). Deseja criar mais um?`);
          return;
        }
      }

      const createdLead = await createLead.mutateAsync({
        contact_id: selectedContactId,
        service_interest: newLead.service_interest,
        status: 'NOVO',
        notes: newLead.service_interest === 'OUTRO' && newLead.service_interest_other
          ? `Serviço: ${newLead.service_interest_other}`
          : undefined,
      });
      setIsDialogOpen(false);
      navigate(`/crm/leads/${createdLead.id}`);
      return;
    } else {
      if (!newLead.full_name) return;
      const phoneStr = newLead.phone ? newLead.phone.replace(/\D/g, '') : undefined;

      if (!forceCreate) {
        // Check duplicate contact
        const existingContact = await checkDuplicateContact(newLead.phone, newLead.email);
        if (existingContact) {
          setDuplicateWarning(
            `Já existe um contato "${existingContact.full_name}" com ${existingContact.phone === phoneStr ? 'o mesmo telefone' : 'o mesmo e-mail'}. Use a aba "Contato Existente" para adicionar um lead a este contato.`
          );
          return;
        }
      }

      const contact = await createContact.mutateAsync({
        full_name: newLead.full_name,
        email: newLead.email || undefined,
        phone: phoneStr,
        origin_channel: newLead.origin_channel,
        referral_name: newLead.origin_channel === 'COLABORADOR' ? newLead.referral_name : undefined,
        preferred_language: 'pt',
      });
      const createdLead = await createLead.mutateAsync({
        contact_id: contact.id,
        service_interest: newLead.service_interest,
        status: 'NOVO',
        notes: newLead.service_interest === 'OUTRO' && newLead.service_interest_other
          ? `Serviço: ${newLead.service_interest_other}`
          : undefined,
      });
      setIsDialogOpen(false);
      navigate(`/crm/leads/${createdLead.id}`);
      return;
    }
  };

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
              <div className="space-y-4 overflow-hidden">
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
                  <ServiceTypeCombobox
                    value={newLead.service_interest}
                    onValueChange={(v) => setNewLead({ ...newLead, service_interest: v })}
                    serviceTypes={serviceTypes}
                  />
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
                {duplicateWarning && (
                  <Alert className="border-warning/30 bg-warning/5">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <AlertDescription className="text-sm">
                      {duplicateWarning}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setIsDialogOpen(false); setDuplicateWarning(null); }}>
                    Cancelar
                  </Button>
                  {duplicateWarning ? (
                    <Button
                      variant="destructive"
                      onClick={() => handleCreate(true)}
                      disabled={createLead.isPending}
                    >
                      {createLead.isPending ? 'Criando...' : 'Criar Mesmo Assim'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCreate(false)}
                      disabled={createLead.isPending || (leadMode === 'new' && !newLead.full_name) || (leadMode === 'existing' && !selectedContactId)}
                    >
                      {createLead.isPending ? 'Criando...' : 'Criar Lead'}
                    </Button>
                  )}
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
            placeholder="Buscar por cliente..."
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : groupedClients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum lead encontrado
        </div>
      ) : (
        <div className="space-y-2">
          {groupedClients.map(client => {
            const isExpanded = resolvedExpanded.has(client.contactId);
            const allConcluded = client.leads.every(l => FINAL_STATUSES.has(l.status || ''));
            return (
              <div key={client.contactId} className={`border rounded-lg overflow-hidden bg-card ${allConcluded ? 'opacity-60' : ''}`}>
                {/* Client row */}
                <button
                  onClick={() => toggleClient(client.contactId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{client.contactName}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {client.contactEmail}
                      {client.contactEmail && client.contactPhone && ' · '}
                      {client.contactPhone}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {client.leads.length} {client.leads.length === 1 ? 'lead' : 'leads'}
                  </Badge>
                </button>

                {/* Expanded leads */}
                {isExpanded && (
                  <div className="border-t bg-muted/30">
                    {client.leads.map(lead => (
                      <div
                        key={lead.id}
                        onClick={() => navigate(`/crm/leads/${lead.id}`)}
                        className="flex items-center gap-3 px-4 py-3 pl-16 hover:bg-muted/50 cursor-pointer transition-colors border-t first:border-t-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="text-sm font-medium truncate max-w-[200px]" title={(lead.service_type_id && serviceTypeIdMap[lead.service_type_id]) || serviceTypeMap[lead.service_interest || 'OUTRO'] || lead.service_interest || 'Outro'}>
                              {(lead.service_type_id && serviceTypeIdMap[lead.service_type_id]) || serviceTypeMap[lead.service_interest || 'OUTRO'] || lead.service_interest || 'Outro'}
                            </span>
                            <StatusBadge
                              status={lead.status || 'NOVO'}
                              label={LEAD_STATUS_LABELS[lead.status || 'NOVO']}
                            />
                            {lead.interest_confirmed && (
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 text-xs">
                                Interesse Confirmado
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Criado em {format(new Date(lead.created_at!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                        <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}