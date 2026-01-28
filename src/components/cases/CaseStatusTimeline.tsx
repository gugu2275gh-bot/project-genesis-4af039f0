import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TECHNICAL_STATUS_LABELS } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';

interface StatusChange {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
  changed_by_name?: string;
}

interface CaseStatusTimelineProps {
  serviceCaseId: string;
  currentStatus: string;
}

export function CaseStatusTimeline({ serviceCaseId, currentStatus }: CaseStatusTimelineProps) {
  const [statusHistory, setStatusHistory] = useState<StatusChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      setIsLoading(true);
      try {
        // Fetch from audit_logs table for status changes
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('table_name', 'service_cases')
          .eq('record_id', serviceCaseId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        // Parse status changes from audit logs
        const changes: StatusChange[] = [];
        
        data?.forEach((log) => {
          const oldData = log.old_data as Record<string, any> | null;
          const newData = log.new_data as Record<string, any> | null;
          
          if (newData?.technical_status && 
              (!oldData?.technical_status || oldData.technical_status !== newData.technical_status)) {
            changes.push({
              id: log.id,
              old_status: oldData?.technical_status || null,
              new_status: newData.technical_status,
              changed_at: log.created_at || new Date().toISOString(),
            });
          }
        });

        // Add current status if no history
        if (changes.length === 0 && currentStatus) {
          changes.push({
            id: 'current',
            old_status: null,
            new_status: currentStatus,
            changed_at: new Date().toISOString(),
          });
        }

        setStatusHistory(changes);
      } catch (error) {
        console.error('Error fetching status history:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (serviceCaseId) {
      fetchHistory();
    }
  }, [serviceCaseId, currentStatus]);

  const getStatusColor = (status: string) => {
    if (status.startsWith('ENCERRADO_APROVADO') || status === 'TIE_RETIRADO') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (status.startsWith('ENCERRADO_NEGADO') || status === 'DENEGADO') {
      return 'bg-red-100 text-red-800 border-red-200';
    }
    if (status.includes('AGUARDANDO') || status === 'PENDENTE') {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (status.includes('CONFERENCIA') || status === 'EM_ACOMPANHAMENTO') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    return 'bg-muted text-foreground border-border';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Histórico de Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : statusHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma mudança de status registrada
            </p>
          ) : (
            <div className="space-y-4">
              {statusHistory.map((change, index) => (
                <div key={change.id} className="relative flex gap-3">
                  {/* Timeline line */}
                  {index < statusHistory.length - 1 && (
                    <div className="absolute left-[11px] top-6 w-0.5 h-full bg-border" />
                  )}
                  
                  {/* Icon */}
                  <div className="relative z-10 flex-shrink-0">
                    {index === 0 ? (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle className="h-3.5 w-3.5 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {change.old_status && (
                        <>
                          <Badge variant="outline" className="text-xs">
                            {TECHNICAL_STATUS_LABELS[change.old_status] || change.old_status}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        </>
                      )}
                      <Badge className={`text-xs ${getStatusColor(change.new_status)}`}>
                        {TECHNICAL_STATUS_LABELS[change.new_status] || change.new_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(change.changed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {change.changed_by_name && (
                      <p className="text-xs text-muted-foreground">
                        por {change.changed_by_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
