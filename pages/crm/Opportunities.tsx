import { useState } from 'react';
import { useOpportunities } from '@/hooks/useOpportunities';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { OPPORTUNITY_STATUS_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Opportunities() {
  const { opportunities, isLoading } = useOpportunities();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredOpportunities = opportunities.filter(o => {
    const matchesSearch = 
      o.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.leads?.contacts?.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<typeof opportunities[0]>[] = [
    {
      key: 'lead',
      header: 'Cliente',
      cell: (opp) => (
        <div>
          <div className="font-medium">{opp.leads?.contacts?.full_name}</div>
          <div className="text-sm text-muted-foreground">{opp.leads?.contacts?.email}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (opp) => (
        <StatusBadge 
          status={opp.status || 'ABERTA'} 
          label={OPPORTUNITY_STATUS_LABELS[opp.status || 'ABERTA']} 
        />
      ),
    },
    {
      key: 'total_amount',
      header: 'Valor',
      cell: (opp) => opp.total_amount 
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: opp.currency || 'EUR' }).format(opp.total_amount)
        : '-',
    },
    {
      key: 'created_at',
      header: 'Data de Criação',
      cell: (opp) => format(new Date(opp.created_at!), 'dd/MM/yyyy', { locale: ptBR }),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oportunidades"
        description="Pipeline de vendas e oportunidades"
      />

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar oportunidades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(OPPORTUNITY_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredOpportunities}
        loading={isLoading}
        emptyMessage="Nenhuma oportunidade encontrada"
      />
    </div>
  );
}
