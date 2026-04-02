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
import { toast } from 'sonner';

import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ContractsList() {
  const navigate = useNavigate();
  const { contracts, isLoading, createContract } = useContracts();
  const { opportunities } = useOpportunities();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('approved');
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

    // Check for existing active contract for this opportunity
    const { data: existingContracts } = await supabase
      .from('contracts')
      .select('id, status')
      .eq('opportunity_id', selectedOpportunity)
      .not('status', 'eq', 'CANCELADO')
      .limit(1);
    
    if (existingContracts?.length) {
      toast.error('Já existe um contrato ativo para esta oportunidade.');
      return;
    }

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
      cell: (contract) => {
        const dynamicName = contract.opportunities?.leads?.service_types?.name;
        const name = dynamicName || SERVICE_INTEREST_LABELS[contract.service_type || 'OUTRO'];
        return <span className="truncate block max-w-[220px]" title={name}>{name}</span>;
      },
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

  const dateColumnDrafts: Column<typeof contracts[0]> = {
    key: 'created_at',
    header: 'Criado em',
    cell: (contract) => contract.created_at
      ? format(new Date(contract.created_at), 'dd/MM/yyyy', { locale: ptBR })
      : '-',
  };

  const dateColumnApproved: Column<typeof contracts[0]> = {
    key: 'signed_at',
    header: 'Aprovado / Assinado em',
    cell: (contract) => {
      const date = contract.signed_at || contract.updated_at;
      return date ? format(new Date(date), 'dd/MM/yyyy', { locale: ptBR }) : '-';
    },
  };

  const dateColumnCancelled: Column<typeof contracts[0]> = {
    key: 'updated_at',
    header: 'Cancelado em',
    cell: (contract) => contract.updated_at
      ? format(new Date(contract.updated_at), 'dd/MM/yyyy', { locale: ptBR })
      : '-',
  };

  const getColumnsForTab = (tab: string) => {
    const baseColumns = columns.slice(0, -1); // all except actions
    const actionsCol = columns[columns.length - 1];
    let dateCol: Column<typeof contracts[0]>;
    if (tab === 'approved') dateCol = dateColumnApproved;
    else if (tab === 'cancelled') dateCol = dateColumnCancelled;
    else dateCol = dateColumnDrafts;
    return [...baseColumns, dateCol, actionsCol];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos"
        description="Gerenciar contratos e documentos jurídicos"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            Contratos Aprovados
            {contracts.filter(c => c.status === 'APROVADO' || c.status === 'ASSINADO').length > 0 && (
              <Badge variant="secondary" className="ml-1">{contracts.filter(c => c.status === 'APROVADO' || c.status === 'ASSINADO').length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="flex items-center gap-2">
            Em Elaboração
            {contracts.filter(c => c.status === 'EM_ELABORACAO').length > 0 && (
              <Badge variant="secondary" className="ml-1">{contracts.filter(c => c.status === 'EM_ELABORACAO').length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="flex items-center gap-2">
            Contratos Cancelados
            {contracts.filter(c => c.status === 'CANCELADO' || c.status === 'REPROVADO').length > 0 && (
              <Badge variant="secondary" className="ml-1">{contracts.filter(c => c.status === 'CANCELADO' || c.status === 'REPROVADO').length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approved" className="space-y-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos aprovados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <DataTable
            columns={getColumnsForTab('approved')}
            data={contracts.filter(c => 
              (c.status === 'APROVADO' || c.status === 'ASSINADO') &&
              (c.opportunities?.leads?.contacts?.full_name || '').toLowerCase().includes(search.toLowerCase())
            )}
            loading={isLoading}
            emptyMessage="Nenhum contrato aprovado encontrado"
            onRowClick={(contract) => navigate(`/contracts/${contract.id}`)}
          />
        </TabsContent>

        <TabsContent value="drafts" className="space-y-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos em elaboração..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <DataTable
            columns={getColumnsForTab('drafts')}
            data={contracts.filter(c => 
              c.status === 'EM_ELABORACAO' &&
              (c.opportunities?.leads?.contacts?.full_name || '').toLowerCase().includes(search.toLowerCase())
            )}
            loading={isLoading}
            emptyMessage="Nenhum contrato em elaboração"
            onRowClick={(contract) => navigate(`/contracts/${contract.id}`)}
          />
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contratos cancelados..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <DataTable
            columns={getColumnsForTab('cancelled')}
            data={contracts.filter(c => 
              (c.status === 'CANCELADO' || c.status === 'REPROVADO') &&
              (c.opportunities?.leads?.contacts?.full_name || '').toLowerCase().includes(search.toLowerCase())
            )}
            loading={isLoading}
            emptyMessage="Nenhum contrato cancelado encontrado"
            onRowClick={(contract) => navigate(`/contracts/${contract.id}`)}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
