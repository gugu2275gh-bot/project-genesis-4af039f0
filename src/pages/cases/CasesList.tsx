import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCases } from '@/hooks/useCases';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Eye } from 'lucide-react';
import { TECHNICAL_STATUS_LABELS, SERVICE_SECTOR_LABELS, SERVICE_INTEREST_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

export default function CasesList() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { cases, myCases, isLoading } = useCases();
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');

  const isTechnician = hasRole('TECNICO');
  const displayCases = activeTab === 'mine' ? myCases : cases;

  const filteredCases = displayCases.filter(c => {
    const matchesSearch = 
      c.opportunities?.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.protocol_number?.includes(search);
    const matchesSector = sectorFilter === 'all' || c.sector === sectorFilter;
    const matchesStatus = statusFilter === 'all' || c.technical_status === statusFilter;
    return matchesSearch && matchesSector && matchesStatus;
  });

  const columns: Column<typeof cases[0]>[] = [
    {
      key: 'client',
      header: 'Cliente',
      cell: (serviceCase) => (
        <div>
          <div className="font-medium">{serviceCase.opportunities?.leads?.contacts?.full_name}</div>
          <div className="text-sm text-muted-foreground">{serviceCase.opportunities?.leads?.contacts?.email}</div>
        </div>
      ),
    },
    {
      key: 'service_type',
      header: 'Serviço',
      cell: (serviceCase) => SERVICE_INTEREST_LABELS[serviceCase.service_type],
    },
    {
      key: 'sector',
      header: 'Setor',
      cell: (serviceCase) => (
        <StatusBadge 
          status={serviceCase.sector} 
          label={SERVICE_SECTOR_LABELS[serviceCase.sector]} 
        />
      ),
    },
    {
      key: 'technical_status',
      header: 'Status',
      cell: (serviceCase) => (
        <StatusBadge 
          status={serviceCase.technical_status || 'CONTATO_INICIAL'} 
          label={TECHNICAL_STATUS_LABELS[serviceCase.technical_status || 'CONTATO_INICIAL']} 
        />
      ),
    },
    {
      key: 'protocol_number',
      header: 'Protocolo',
      cell: (serviceCase) => serviceCase.protocol_number || '-',
    },
    {
      key: 'submission_date',
      header: 'Submetido',
      cell: (serviceCase) => serviceCase.submission_date 
        ? format(new Date(serviceCase.submission_date), 'dd/MM/yyyy', { locale: ptBR })
        : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (serviceCase) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/cases/${serviceCase.id}`);
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
        title="Casos Técnicos"
        description="Gerenciar processos e documentações em andamento"
      />

      {isTechnician && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todos os Casos</TabsTrigger>
            <TabsTrigger value="mine">Meus Casos</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar casos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Setores</SelectItem>
            {Object.entries(SERVICE_SECTOR_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.entries(TECHNICAL_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredCases}
        loading={isLoading}
        emptyMessage="Nenhum caso encontrado"
        onRowClick={(c) => navigate(`/cases/${c.id}`)}
      />
    </div>
  );
}
