import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useContracts } from '@/hooks/useContracts';
import { useOpportunities } from '@/hooks/useOpportunities';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, FileText, AlertTriangle, Clock, Download, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { CONTRACT_STATUS_LABELS, SERVICE_INTEREST_LABELS, CONTRACT_TEMPLATE_LABELS } from '@/types/database';

import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ContractsList() {
  const navigate = useNavigate();
  const { contracts, isLoading, createContract } = useContracts();
  const { opportunities } = useOpportunities();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('contracts');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('DOCUMENTOS');

  // Fetch opportunity IDs that have at least one payment
  const { data: opportunitiesWithPayments } = useQuery({
    queryKey: ['opportunities-with-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('opportunity_id')
        .not('opportunity_id', 'is', null);
      if (error) throw error;
      // Return unique opportunity IDs
      return [...new Set(data?.map(p => p.opportunity_id) || [])];
    },
  });

  const oppWithPaymentsSet = new Set(opportunitiesWithPayments || []);

  // Helper to determine the correct template based on service interest
  const getTemplateForService = (serviceInterest: string): string => {
    if (serviceInterest === 'NACIONALIDADE_RESIDENCIA') return 'NACIONALIDADE';
    return 'DOCUMENTOS';
  };

  const availableOpportunities = opportunities.filter(o => 
    (o.status === 'ABERTA' || o.status === 'CONTRATO_EM_ELABORACAO') &&
    !contracts.some(c => c.opportunity_id === o.id)
  );

  // Clients pending contract: opportunities with payments but no contract yet
  const pendingContractClients = opportunities.filter(o => 
    !contracts.some(c => c.opportunity_id === o.id) &&
    oppWithPaymentsSet.has(o.id)
  );

  const filteredPendingClients = pendingContractClients.filter(o => {
    const name = o.leads?.contacts?.full_name || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = 
      c.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (!selectedOpportunity) return;
    const opp = opportunities.find(o => o.id === selectedOpportunity);
    const serviceInterest = opp?.leads?.service_interest || 'OUTRO';
    const template = getTemplateForService(serviceInterest);
    const result = await createContract.mutateAsync({
      opportunity_id: selectedOpportunity,
      service_type: serviceInterest,
      status: 'EM_ELABORACAO',
      contract_template: selectedTemplate || template,
    } as any);

    setIsDialogOpen(false);
    setSelectedOpportunity('');
    setSelectedTemplate('DOCUMENTOS');
  };

  // Auto-select template when opportunity changes
  const handleOpportunityChange = (oppId: string) => {
    setSelectedOpportunity(oppId);
    const opp = opportunities.find(o => o.id === oppId);
    if (opp) {
      const serviceInterest = opp.leads?.service_interest || 'OUTRO';
      setSelectedTemplate(getTemplateForService(serviceInterest));
    }
  };

  const calculatePaymentStatus = (contract: typeof contracts[0]) => {
    const totalFee = contract.total_fee || 0;
    const payments = contract.payments || [];
    
    const paidAmount = payments
      .filter(p => p.status === 'CONFIRMADO')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const balance = totalFee - paidAmount;
    
    return { totalFee, paidAmount, balance };
  };

  const hasOverduePayments = (contract: typeof contracts[0]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const payments = contract.payments || [];
    return payments.some(p => 
      p.status === 'PENDENTE' && 
      p.due_date && 
      new Date(p.due_date) < today
    );
  };

  const formatCurrency = (value: number, currency: string = 'EUR') => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);

  const columns: Column<typeof contracts[0]>[] = [
    {
      key: 'client',
      header: 'Cliente',
      cell: (contract) => (
        <div>
          <div className="font-medium">{contract.opportunities?.leads?.contacts?.full_name}</div>
          <div className="text-sm text-muted-foreground">{contract.opportunities?.leads?.contacts?.email}</div>
        </div>
      ),
    },
    {
      key: 'service_type',
      header: 'Serviço',
      cell: (contract) => SERVICE_INTEREST_LABELS[contract.service_type || 'OUTRO'],
    },
    {
      key: 'status',
      header: 'Status',
      cell: (contract) => {
        const contractData = contract as any;
        return (
          <div className="flex items-center gap-2">
            <StatusBadge 
              status={contract.status || 'EM_ELABORACAO'} 
              label={CONTRACT_STATUS_LABELS[contract.status || 'EM_ELABORACAO']} 
            />
            {contractData.is_suspended && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Suspenso
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'total_fee',
      header: 'Valor Total',
      cell: (contract) => {
        const { totalFee } = calculatePaymentStatus(contract);
        return totalFee > 0 ? formatCurrency(totalFee, contract.currency || 'EUR') : '-';
      },
    },
    {
      key: 'paid_amount',
      header: 'Pago',
      cell: (contract) => {
        const { paidAmount } = calculatePaymentStatus(contract);
        return (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            {formatCurrency(paidAmount, contract.currency || 'EUR')}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Saldo',
      cell: (contract) => {
        const { balance } = calculatePaymentStatus(contract);
        const isFullyPaid = balance <= 0;
        const isOverdue = hasOverduePayments(contract);
        return (
          <div className="flex items-center gap-2">
            <span className={isFullyPaid ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
              {isFullyPaid ? 'Quitado' : formatCurrency(balance, contract.currency || 'EUR')}
            </span>
            {isOverdue && !isFullyPaid && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Atraso
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'signed_at',
      header: 'Assinado em',
      cell: (contract) => contract.signed_at 
        ? format(new Date(contract.signed_at), 'dd/MM/yyyy', { locale: ptBR })
        : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (contract) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/contracts/${contract.id}`);
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
        title="Contratos"
        description="Gerenciar contratos e documentos jurídicos"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Contrato
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Contrato</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Oportunidade</Label>
                  {availableOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Não há oportunidades disponíveis para criar contrato.
                    </p>
                  ) : (
                    <Select value={selectedOpportunity} onValueChange={handleOpportunityChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma oportunidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOpportunities.map((opp) => (
                          <SelectItem key={opp.id} value={opp.id}>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {opp.leads?.contacts?.full_name} - {SERVICE_INTEREST_LABELS[opp.leads?.service_interest || 'OUTRO']}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Modelo do Contrato</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DOCUMENTOS">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Geral Trámites
                        </div>
                      </SelectItem>
                      <SelectItem value="NACIONALIDADE">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Nacionalidad Española por Residencia
                        </div>
                      </SelectItem>
                      <SelectItem value="REGULARIZACION_EXTRAORDINARIA">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Regularización Extraordinaria
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={!selectedOpportunity || createContract.isPending}
                  >
                    {createContract.isPending ? 'Criando...' : 'Criar Contrato'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Pendentes de Contrato
            {pendingContractClients.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingContractClients.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contratos..."
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
                {Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            data={filteredContracts}
            loading={isLoading}
            emptyMessage="Nenhum contrato encontrado"
            onRowClick={(contract) => navigate(`/contracts/${contract.id}`)}
          />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes pendentes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredPendingClients.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <p>Nenhum cliente pendente de contrato</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredPendingClients.map((opp) => (
                <Card key={opp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/crm/leads/${opp.lead_id}`)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{opp.leads?.contacts?.full_name || 'Sem nome'}</p>
                        <p className="text-sm text-muted-foreground">
                          {opp.leads?.contacts?.email || opp.leads?.contacts?.phone || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        {SERVICE_INTEREST_LABELS[opp.leads?.service_interest || 'OUTRO']}
                      </Badge>
                      <StatusBadge
                        status={opp.status || 'ABERTA'}
                        label={opp.status === 'CONTRATO_EM_ELABORACAO' ? 'Contrato em Elaboração' : 'Aberta'}
                      />
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOpportunity(opp.id);
                          handleOpportunityChange(opp.id);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Gerar Contrato
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
