import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContracts } from '@/hooks/useContracts';
import { useOpportunities } from '@/hooks/useOpportunities';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, FileText, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CONTRACT_STATUS_LABELS, SERVICE_INTEREST_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ContractsList() {
  const navigate = useNavigate();
  const { contracts, isLoading, createContract } = useContracts();
  const { opportunities } = useOpportunities();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState('');

  const availableOpportunities = opportunities.filter(o => 
    (o.status === 'ABERTA' || o.status === 'CONTRATO_EM_ELABORACAO') &&
    !contracts.some(c => c.opportunity_id === o.id)
  );

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = 
      c.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (!selectedOpportunity) return;
    const opp = opportunities.find(o => o.id === selectedOpportunity);
    await createContract.mutateAsync({
      opportunity_id: selectedOpportunity,
      service_type: opp?.leads?.service_interest || 'OUTRO',
      status: 'EM_ELABORACAO',
    });
    setIsDialogOpen(false);
    setSelectedOpportunity('');
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
        return (
          <span className={isFullyPaid ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
            {isFullyPaid ? 'Quitado' : formatCurrency(balance, contract.currency || 'EUR')}
          </span>
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
                    <Select value={selectedOpportunity} onValueChange={setSelectedOpportunity}>
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
    </div>
  );
}
