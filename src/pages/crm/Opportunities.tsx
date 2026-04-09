import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight, ChevronDown, User, Eye } from 'lucide-react';
import { OPPORTUNITY_STATUS_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export default function Opportunities() {
  const navigate = useNavigate();
  const { opportunities, isLoading } = useOpportunities();
  const { data: serviceTypes } = useServiceTypes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const serviceTypeIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    serviceTypes?.forEach(st => { map[st.id] = st.name; });
    return map;
  }, [serviceTypes]);

  const filteredOpportunities = opportunities.filter(o => {
    const matchesSearch =
      o.leads?.contacts?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      o.leads?.contacts?.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Group opportunities by contact
  const groupedClients = useMemo(() => {
    const map = new Map<string, {
      contactId: string;
      contactName: string;
      contactEmail: string | null;
      opportunities: typeof filteredOpportunities;
    }>();

    for (const opp of filteredOpportunities) {
      const cid = opp.leads?.contact_id || opp.leads?.contacts?.id || 'unknown';
      if (!map.has(cid)) {
        map.set(cid, {
          contactId: cid,
          contactName: opp.leads?.contacts?.full_name || 'Sem nome',
          contactEmail: opp.leads?.contacts?.email || null,
          opportunities: [],
        });
      }
      map.get(cid)!.opportunities.push(opp);
    }

    return Array.from(map.values()).sort((a, b) => {
      const aDate = new Date(a.opportunities[0]?.created_at || 0).getTime();
      const bDate = new Date(b.opportunities[0]?.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [filteredOpportunities]);

  const toggleClient = (contactId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : groupedClients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma oportunidade encontrada
        </div>
      ) : (
        <div className="space-y-2">
          {groupedClients.map(group => {
            const isExpanded = expandedClients.has(group.contactId);
            const oppCount = group.opportunities.length;

            return (
              <div key={group.contactId} className="border rounded-lg overflow-hidden">
                {/* Client header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleClient(group.contactId)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{group.contactName}</span>
                    {group.contactEmail && (
                      <span className="text-sm text-muted-foreground ml-2">{group.contactEmail}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {oppCount} {oppCount === 1 ? 'oportunidade' : 'oportunidades'}
                  </Badge>
                </div>

                {/* Expanded opportunities */}
                {isExpanded && (
                  <div className="border-t divide-y">
                    {group.opportunities.map(opp => {
                      const serviceName = opp.leads?.service_type_id
                        ? serviceTypeIdMap[opp.leads.service_type_id]
                        : null;

                      return (
                        <div
                          key={opp.id}
                          className="flex items-center gap-4 px-4 py-3 pl-12 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => navigate(`/crm/contacts/${group.contactId}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {serviceName || 'Serviço não definido'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Criada em {format(new Date(opp.created_at!), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          </div>
                          <StatusBadge
                            status={opp.status || 'ABERTA'}
                            label={OPPORTUNITY_STATUS_LABELS[opp.status || 'ABERTA']}
                          />
                          <div className="text-sm font-medium w-28 text-right">
                            {opp.total_amount
                              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: opp.currency || 'EUR' }).format(opp.total_amount)
                              : '-'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/crm/contacts/${group.contactId}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
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
