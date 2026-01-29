import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  Clock, 
  Plus, 
  Send, 
  Scale, 
  RefreshCw, 
  Check,
  CalendarClock,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { REQUIREMENT_STATUS_LABELS } from '@/types/database';
import type { Requirement, RequirementInsert } from '@/hooks/useRequirements';
import { cn } from '@/lib/utils';

interface RequirementActionsPanelProps {
  requirements: Requirement[];
  serviceCaseId: string;
  onCreateRequirement: (data: RequirementInsert) => Promise<void>;
  onUpdateRequirement: (data: { id: string } & Partial<Requirement>) => Promise<void>;
  onRequestExtension: (requirementId: string, newDeadline: string) => Promise<void>;
  onSendToLegal: (requirementId: string) => Promise<void>;
  isLoading?: boolean;
}

export function RequirementActionsPanel({
  requirements,
  serviceCaseId,
  onCreateRequirement,
  onUpdateRequirement,
  onRequestExtension,
  onSendToLegal,
  isLoading
}: RequirementActionsPanelProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  const [newRequirement, setNewRequirement] = useState({
    description: '',
    official_deadline_date: '',
    internal_deadline_date: '',
    notes: '',
  });
  const [extensionNotes, setExtensionNotes] = useState('');
  const [responseNotes, setResponseNotes] = useState('');
  const [showExtensionDialog, setShowExtensionDialog] = useState<string | null>(null);
  const [showRespondDialog, setShowRespondDialog] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newRequirement.description) return;
    await onCreateRequirement({
      service_case_id: serviceCaseId,
      description: newRequirement.description,
      official_deadline_date: newRequirement.official_deadline_date || null,
      internal_deadline_date: newRequirement.internal_deadline_date || null,
      notes: newRequirement.notes || null,
      status: 'ABERTA',
    });
    setShowNewDialog(false);
    setNewRequirement({ description: '', official_deadline_date: '', internal_deadline_date: '', notes: '' });
  };

  const handleRequestExtension = async (reqId: string, currentDeadline: string | null) => {
    if (!currentDeadline) return;
    const current = new Date(currentDeadline);
    const newDeadline = addDays(current, 5);
    await onRequestExtension(reqId, format(newDeadline, 'yyyy-MM-dd'));
    setShowExtensionDialog(null);
    setExtensionNotes('');
  };

  const handleRespond = async (reqId: string) => {
    await onUpdateRequirement({ 
      id: reqId, 
      status: 'RESPONDIDA', 
      responded_at: new Date().toISOString(),
      notes: responseNotes || undefined
    });
    setShowRespondDialog(null);
    setResponseNotes('');
  };

  const getUrgencyLevel = (deadline: string | null): 'critical' | 'warning' | 'normal' | null => {
    if (!deadline) return null;
    const daysRemaining = differenceInDays(new Date(deadline), new Date());
    if (daysRemaining <= 2) return 'critical';
    if (daysRemaining <= 3) return 'warning';
    return 'normal';
  };

  const getUrgencyBadge = (deadline: string | null) => {
    const level = getUrgencyLevel(deadline);
    if (!deadline) return null;
    
    const daysRemaining = differenceInDays(new Date(deadline), new Date());
    
    if (level === 'critical') {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {daysRemaining <= 0 ? 'VENCIDO' : `${daysRemaining}d restantes`}
        </Badge>
      );
    }
    if (level === 'warning') {
      return (
        <Badge className="bg-warning text-warning-foreground gap-1">
          <Clock className="h-3 w-3" />
          {daysRemaining}d restantes
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <CalendarClock className="h-3 w-3" />
        {daysRemaining}d restantes
      </Badge>
    );
  };

  const openRequirements = requirements.filter(r => r.status === 'ABERTA' || r.status === 'EM_PRORROGACAO' || r.status === 'PRORROGADA');
  const closedRequirements = requirements.filter(r => r.status === 'RESPONDIDA' || r.status === 'ENCERRADA');

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Exigências do Órgão</h3>
          {openRequirements.length > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
              {openRequirements.length} pendente(s)
            </Badge>
          )}
        </div>
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Exigência
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Registrar Nova Exigência</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Descrição da Exigência *</Label>
                <Textarea
                  value={newRequirement.description}
                  onChange={(e) => setNewRequirement({ ...newRequirement, description: e.target.value })}
                  placeholder="Descreva o que foi solicitado pelo órgão..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prazo Oficial (10 dias padrão)</Label>
                  <Input
                    type="date"
                    value={newRequirement.official_deadline_date}
                    onChange={(e) => setNewRequirement({ ...newRequirement, official_deadline_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Prazo Interno (antecipado)</Label>
                  <Input
                    type="date"
                    value={newRequirement.internal_deadline_date}
                    onChange={(e) => setNewRequirement({ ...newRequirement, internal_deadline_date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={newRequirement.notes}
                  onChange={(e) => setNewRequirement({ ...newRequirement, notes: e.target.value })}
                  placeholder="Informações adicionais..."
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={!newRequirement.description || isLoading}>
                  Registrar Exigência
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Open Requirements */}
      {openRequirements.length === 0 && closedRequirements.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma exigência registrada</p>
        </div>
      ) : (
        <>
          {openRequirements.map((req) => {
            const urgency = getUrgencyLevel(req.official_deadline_date);
            const isExpanded = expandedReq === req.id;
            const extensionCount = (req as any).extension_count || 0;
            const maxExtensions = 3;
            
            return (
              <Card 
                key={req.id}
                className={cn(
                  "transition-all",
                  urgency === 'critical' && "border-destructive/50 bg-destructive/5",
                  urgency === 'warning' && "border-warning/50 bg-warning/5"
                )}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge 
                          status={req.status || 'ABERTA'} 
                          label={REQUIREMENT_STATUS_LABELS[req.status as keyof typeof REQUIREMENT_STATUS_LABELS || 'ABERTA']} 
                        />
                        {req.official_deadline_date && getUrgencyBadge(req.official_deadline_date)}
                        {extensionCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            {extensionCount}ª prorrogação
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{req.description}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setExpandedReq(isExpanded ? null : req.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-4 space-y-4">
                    <Separator />
                    
                    {/* Deadline Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Prazo Oficial:</span>
                        <p className="font-medium">
                          {req.official_deadline_date 
                            ? format(new Date(req.official_deadline_date), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Não definido'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Prazo Interno:</span>
                        <p className="font-medium">
                          {req.internal_deadline_date 
                            ? format(new Date(req.internal_deadline_date), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Não definido'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Notes */}
                    {(req as any).notes && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Observações:</span>
                        <p className="mt-1">{(req as any).notes}</p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      {/* Respond Button */}
                      <Dialog open={showRespondDialog === req.id} onOpenChange={(open) => setShowRespondDialog(open ? req.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="default">
                            <Check className="h-4 w-4 mr-2" />
                            Marcar Respondida
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Confirmar Resposta da Exigência</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              A documentação foi reunida e enviada? O coordenador será notificado.
                            </p>
                            <div>
                              <Label>Observações da resposta</Label>
                              <Textarea
                                value={responseNotes}
                                onChange={(e) => setResponseNotes(e.target.value)}
                                placeholder="Descreva o que foi enviado..."
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setShowRespondDialog(null)}>
                                Cancelar
                              </Button>
                              <Button onClick={() => handleRespond(req.id)}>
                                Confirmar Resposta
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Request Extension Button */}
                      {extensionCount < maxExtensions && (
                        <Dialog open={showExtensionDialog === req.id} onOpenChange={(open) => setShowExtensionDialog(open ? req.id : null)}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Solicitar Prorrogação
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Solicitar Prorrogação (+5 dias)</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="p-3 bg-muted rounded-lg text-sm">
                                <p><strong>Prazo atual:</strong> {req.official_deadline_date ? format(new Date(req.official_deadline_date), 'dd/MM/yyyy', { locale: ptBR }) : 'Não definido'}</p>
                                <p><strong>Novo prazo:</strong> {req.official_deadline_date ? format(addDays(new Date(req.official_deadline_date), 5), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</p>
                                <p className="text-muted-foreground mt-2">
                                  Esta será a {extensionCount + 1}ª prorrogação (máximo: {maxExtensions})
                                </p>
                              </div>
                              <div>
                                <Label>Motivo da prorrogação</Label>
                                <Textarea
                                  value={extensionNotes}
                                  onChange={(e) => setExtensionNotes(e.target.value)}
                                  placeholder="Por que a prorrogação é necessária?"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowExtensionDialog(null)}>
                                  Cancelar
                                </Button>
                                <Button onClick={() => handleRequestExtension(req.id, req.official_deadline_date)}>
                                  Solicitar Prorrogação
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {/* Send to Legal Button */}
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => onSendToLegal(req.id)}
                      >
                        <Scale className="h-4 w-4 mr-2" />
                        Enviar ao Jurídico
                      </Button>
                    </div>

                    {/* Extension Limit Warning */}
                    {extensionCount >= maxExtensions && (
                      <div className="p-2 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Limite de prorrogações atingido. Risco de arquivamento!
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Closed Requirements */}
          {closedRequirements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Exigências Encerradas</h4>
              {closedRequirements.map((req) => (
                <div 
                  key={req.id}
                  className="p-3 rounded-lg bg-muted/30 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge 
                      status={req.status || 'ENCERRADA'} 
                      label={REQUIREMENT_STATUS_LABELS[req.status as keyof typeof REQUIREMENT_STATUS_LABELS || 'ENCERRADA']} 
                    />
                    {(req as any).responded_at && (
                      <span className="text-xs text-muted-foreground">
                        Respondida em {format(new Date((req as any).responded_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{req.description}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
