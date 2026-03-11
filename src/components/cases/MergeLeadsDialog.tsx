import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { LEAD_STATUS_LABELS, SERVICE_INTEREST_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LeadWithContact } from '@/hooks/useLeads';
import { AlertTriangle, GitMerge } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface MergeLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLeadId: string;
  contactLeads: LeadWithContact[];
  onMerge: (leadIds: string[]) => Promise<void>;
  isPending: boolean;
}

export function MergeLeadsDialog({
  open,
  onOpenChange,
  currentLeadId,
  contactLeads,
  onMerge,
  isPending,
}: MergeLeadsDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const otherLeads = contactLeads.filter(l => l.id !== currentLeadId);

  const toggleLead = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    const allIds = [currentLeadId, ...selectedIds];
    await onMerge(allIds);
    onOpenChange(false);
    setSelectedIds(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5" />
            Mesclar Leads
          </DialogTitle>
          <DialogDescription>
            Selecione os leads duplicados para consolidar neste lead principal.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
            Interações, tarefas e mensagens serão transferidas para o lead mais recente. Os leads selecionados serão arquivados.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {otherLeads.map(lead => (
            <label
              key={lead.id}
              className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={selectedIds.has(lead.id)}
                onCheckedChange={() => toggleLead(lead.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge
                    status={lead.status || 'NOVO'}
                    label={LEAD_STATUS_LABELS[lead.status || 'NOVO']}
                  />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at!), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {SERVICE_INTEREST_LABELS[lead.service_interest || 'OUTRO']}
                </p>
                {lead.notes && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{lead.notes}</p>
                )}
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleMerge}
            disabled={selectedIds.size === 0 || isPending}
          >
            {isPending ? 'Mesclando...' : `Mesclar ${selectedIds.size + 1} leads`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
