import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingItems, CreatePendingItem } from '@/hooks/usePendingItems';
import { Plus, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SECTOR_OPTIONS = [
  'PAGAMENTO', 'DOCUMENTACAO', 'JURIDICO', 'TECNICO', 'ATENCAO_CLIENTE', 'FINANCEIRO', 'OUTRO'
];

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberta',
  waiting_customer: 'Aguardando Cliente',
  in_progress: 'Em Andamento',
  resolved: 'Resolvida',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  waiting_customer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

interface PendingItemsSectionProps {
  contactId: string;
}

export default function PendingItemsSection({ contactId }: PendingItemsSectionProps) {
  const { openItems, closedItems, isLoading, createPendingItem, resolvePendingItem, cancelPendingItem } = usePendingItems(contactId);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newItem, setNewItem] = useState<Partial<CreatePendingItem>>({ sector: 'OUTRO' });

  const handleCreate = () => {
    if (!newItem.sector) return;
    createPendingItem.mutate({
      contact_id: contactId,
      sector: newItem.sector,
      pending_subject_title: newItem.pending_subject_title || undefined,
      pending_reason: newItem.pending_reason || undefined,
      last_question_to_customer: newItem.last_question_to_customer || undefined,
      awaiting_customer_reply: newItem.awaiting_customer_reply || false,
    });
    setShowCreateDialog(false);
    setNewItem({ sector: 'OUTRO' });
  };

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Pendências por Setor
          {openItems.length > 0 && (
            <Badge variant="secondary">{openItems.length} aberta{openItems.length > 1 ? 's' : ''}</Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {openItems.length === 0 && closedItems.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma pendência registrada.</p>
        )}

        {openItems.map(item => (
          <div key={item.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                <span className="font-medium text-sm">{item.sector}</span>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => resolvePendingItem.mutate(item.id)}>
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => cancelPendingItem.mutate(item.id)}>
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                </Button>
              </div>
            </div>
            {item.pending_subject_title && <p className="text-sm font-medium">{item.pending_subject_title}</p>}
            {item.pending_reason && <p className="text-xs text-muted-foreground">{item.pending_reason}</p>}
            {item.last_question_to_customer && (
              <p className="text-xs italic text-muted-foreground">Última pergunta: "{item.last_question_to_customer}"</p>
            )}
            {item.awaiting_customer_reply && (
              <Badge variant="outline" className="text-xs"><Clock className="h-3 w-3 mr-1" /> Aguardando resposta</Badge>
            )}
            <p className="text-xs text-muted-foreground">
              Criada em {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          </div>
        ))}

        {closedItems.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer">
              {closedItems.length} pendência{closedItems.length > 1 ? 's' : ''} encerrada{closedItems.length > 1 ? 's' : ''}
            </summary>
            <div className="mt-2 space-y-2">
              {closedItems.slice(0, 5).map(item => (
                <div key={item.id} className="border rounded-lg p-2 opacity-60">
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                    <span className="text-sm">{item.sector}</span>
                    {item.pending_subject_title && <span className="text-xs text-muted-foreground">- {item.pending_subject_title}</span>}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pendência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Setor *</Label>
              <Select value={newItem.sector || ''} onValueChange={v => setNewItem({ ...newItem, sector: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                <SelectContent>
                  {SECTOR_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título / Assunto</Label>
              <Input
                value={newItem.pending_subject_title || ''}
                onChange={e => setNewItem({ ...newItem, pending_subject_title: e.target.value })}
                placeholder="Ex: Envio de comprovante de pagamento"
              />
            </div>
            <div>
              <Label>Motivo / Detalhe</Label>
              <Textarea
                value={newItem.pending_reason || ''}
                onChange={e => setNewItem({ ...newItem, pending_reason: e.target.value })}
                placeholder="Detalhe da pendência"
                rows={2}
              />
            </div>
            <div>
              <Label>Última pergunta ao cliente</Label>
              <Textarea
                value={newItem.last_question_to_customer || ''}
                onChange={e => setNewItem({ ...newItem, last_question_to_customer: e.target.value })}
                placeholder="Ex: Pode enviar o comprovante do pagamento?"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={newItem.awaiting_customer_reply || false}
                onCheckedChange={v => setNewItem({ ...newItem, awaiting_customer_reply: !!v })}
              />
              <Label className="text-sm">Aguardando resposta do cliente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createPendingItem.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
