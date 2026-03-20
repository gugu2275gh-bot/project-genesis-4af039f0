import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useReactivationLog } from '@/hooks/useReactivationLog';
import { History } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_LABELS: Record<string, string> = {
  direct_route: 'Roteamento Direto',
  ask_confirmation: 'Pediu Confirmação',
  ask_disambiguation: 'Desambiguação',
  new_subject: 'Novo Assunto',
  fallback_manual: 'Fallback Manual',
  insufficient_context: 'Contexto Insuficiente',
};

const CONFIRMATION_LABELS: Record<string, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  denied: 'Negado',
  no_response: 'Sem Resposta',
};

const CONFIRMATION_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  denied: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_response: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

interface ReactivationLogSectionProps {
  contactId: string;
}

export default function ReactivationLogSection({ contactId }: ReactivationLogSectionProps) {
  const { logs, isLoading } = useReactivationLog(contactId);

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Log de Reativações Inteligentes
          {logs.length > 0 && <Badge variant="secondary">{logs.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma reativação registrada.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {logs.map(log => (
              <div key={log.id} className="border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {log.action_taken && (
                      <Badge variant="outline">{ACTION_LABELS[log.action_taken] || log.action_taken}</Badge>
                    )}
                    <Badge className={CONFIRMATION_COLORS[log.user_confirmation_status]}>
                      {CONFIRMATION_LABELS[log.user_confirmation_status] || log.user_confirmation_status}
                    </Badge>
                    {log.confidence_score != null && (
                      <span className="text-xs text-muted-foreground">
                        Confiança: {(log.confidence_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                {log.incoming_message_text && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Mensagem: </span>
                    "{log.incoming_message_text}"
                  </p>
                )}
                {log.selected_sector && (
                  <p className="text-xs text-muted-foreground">Setor: {log.selected_sector}</p>
                )}
                {log.open_pending_count > 0 && (
                  <p className="text-xs text-muted-foreground">{log.open_pending_count} pendência{log.open_pending_count > 1 ? 's' : ''} avaliada{log.open_pending_count > 1 ? 's' : ''}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
