import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCase, useCases } from '@/hooks/useCases';
import { useDocuments } from '@/hooks/useDocuments';
import { useRequirements } from '@/hooks/useRequirements';
import { useProfiles } from '@/hooks/useProfiles';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, FileText, AlertTriangle, Check, X, Plus, Send, User } from 'lucide-react';
import { 
  TECHNICAL_STATUS_LABELS, 
  SERVICE_INTEREST_LABELS, 
  SERVICE_SECTOR_LABELS,
  DOCUMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_LABELS 
} from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: serviceCase, isLoading } = useCase(id);
  const { updateStatus, assignCase, submitCase, closeCase } = useCases();
  const { documents, approveDocument, rejectDocument } = useDocuments(id);
  const { requirements, createRequirement, updateRequirement } = useRequirements(id);
  const { data: profiles } = useProfiles();

  const [protocolNumber, setProtocolNumber] = useState('');
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeResult, setCloseResult] = useState<'APROVADO' | 'NEGADO'>('APROVADO');
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRequirementDialog, setShowRequirementDialog] = useState(false);
  const [newRequirement, setNewRequirement] = useState({
    description: '',
    official_deadline_date: '',
    internal_deadline_date: '',
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 col-span-2" />
        </div>
      </div>
    );
  }

  if (!serviceCase) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Caso não encontrado</p>
        <Button variant="link" onClick={() => navigate('/cases')}>
          Voltar para casos
        </Button>
      </div>
    );
  }

  const handleStatusChange = async (status: string) => {
    await updateStatus.mutateAsync({ id: serviceCase.id, status });
  };

  const handleAssign = async (userId: string) => {
    await assignCase.mutateAsync({ id: serviceCase.id, userId });
  };

  const handleSubmit = async () => {
    if (!protocolNumber) return;
    await submitCase.mutateAsync({ id: serviceCase.id, protocolNumber });
    setShowSubmitDialog(false);
  };

  const handleClose = async () => {
    await closeCase.mutateAsync({ id: serviceCase.id, result: closeResult });
    setShowCloseDialog(false);
  };

  const handleApproveDoc = async (docId: string) => {
    await approveDocument.mutateAsync(docId);
  };

  const handleRejectDoc = async () => {
    if (!showRejectDialog || !rejectReason) return;
    await rejectDocument.mutateAsync({ id: showRejectDialog, reason: rejectReason });
    setShowRejectDialog(null);
    setRejectReason('');
  };

  const handleAddRequirement = async () => {
    if (!newRequirement.description) return;
    await createRequirement.mutateAsync({
      service_case_id: serviceCase.id,
      description: newRequirement.description,
      official_deadline_date: newRequirement.official_deadline_date || null,
      internal_deadline_date: newRequirement.internal_deadline_date || null,
      status: 'ABERTA',
    });
    setShowRequirementDialog(false);
    setNewRequirement({ description: '', official_deadline_date: '', internal_deadline_date: '' });
  };

  const isEncerrado = serviceCase.technical_status?.startsWith('ENCERRADO');

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/cases')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Caso - {serviceCase.opportunities?.leads?.contacts?.full_name}
          </div>
        }
        description={`${SERVICE_INTEREST_LABELS[serviceCase.service_type]} • ${SERVICE_SECTOR_LABELS[serviceCase.sector]}`}
        actions={
          <div className="flex gap-2">
            {!isEncerrado && serviceCase.technical_status === 'PRONTO_PARA_SUBMISSAO' && (
              <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Send className="h-4 w-4 mr-2" />
                    Submeter
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Submeter Caso</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Número do Protocolo *</Label>
                      <Input
                        value={protocolNumber}
                        onChange={(e) => setProtocolNumber(e.target.value)}
                        placeholder="Ex: 2024/123456"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSubmit} disabled={!protocolNumber || submitCase.isPending}>
                        {submitCase.isPending ? 'Submetendo...' : 'Confirmar Submissão'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {!isEncerrado && serviceCase.technical_status === 'EM_ACOMPANHAMENTO' && (
              <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                <DialogTrigger asChild>
                  <Button>Encerrar Caso</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Encerrar Caso</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Resultado</Label>
                      <Select value={closeResult} onValueChange={(v: any) => setCloseResult(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="APROVADO">Aprovado</SelectItem>
                          <SelectItem value="NEGADO">Negado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleClose} disabled={closeCase.isPending}>
                        {closeCase.isPending ? 'Encerrando...' : 'Confirmar Encerramento'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informações do Caso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="font-medium">{serviceCase.opportunities?.leads?.contacts?.full_name}</p>
              <p className="text-sm text-muted-foreground">{serviceCase.opportunities?.leads?.contacts?.email}</p>
            </div>
            
            <div>
              <p className="text-sm text-muted-foreground mb-2">Status Técnico</p>
              {isEncerrado ? (
                <StatusBadge 
                  status={serviceCase.technical_status!} 
                  label={TECHNICAL_STATUS_LABELS[serviceCase.technical_status!]} 
                />
              ) : (
                <Select 
                  value={serviceCase.technical_status || 'CONTATO_INICIAL'} 
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TECHNICAL_STATUS_LABELS)
                      .filter(([key]) => !key.startsWith('ENCERRADO'))
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Responsável</p>
              <Select 
                value={serviceCase.assigned_to_user_id || ''} 
                onValueChange={handleAssign}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar responsável" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {profile.full_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {serviceCase.protocol_number && (
              <div>
                <p className="text-sm text-muted-foreground">Protocolo</p>
                <p className="font-medium">{serviceCase.protocol_number}</p>
              </div>
            )}

            {serviceCase.submission_date && (
              <div>
                <p className="text-sm text-muted-foreground">Data de Submissão</p>
                <p className="font-medium">
                  {format(new Date(serviceCase.submission_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            )}

            {serviceCase.decision_date && (
              <div>
                <p className="text-sm text-muted-foreground">Data da Decisão</p>
                <p className="font-medium">
                  {format(new Date(serviceCase.decision_date), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
            )}

            {serviceCase.decision_result && (
              <div>
                <p className="text-sm text-muted-foreground">Resultado</p>
                <StatusBadge 
                  status={serviceCase.decision_result} 
                  label={serviceCase.decision_result === 'APROVADO' ? 'Aprovado' : 'Negado'} 
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs for Documents and Requirements */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="documents">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="documents">
                  <FileText className="h-4 w-4 mr-2" />
                  Documentos ({documents.length})
                </TabsTrigger>
                <TabsTrigger value="requirements">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Exigências ({requirements.length})
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="documents" className="m-0">
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum documento vinculado a este caso
                    </p>
                  ) : (
                    documents.map((doc) => (
                      <div 
                        key={doc.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{doc.service_document_types.name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <StatusBadge 
                                status={doc.status || 'NAO_ENVIADO'} 
                                label={DOCUMENT_STATUS_LABELS[doc.status || 'NAO_ENVIADO']} 
                              />
                              {doc.service_document_types.is_required && (
                                <span className="text-amber-600">• Obrigatório</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {doc.status === 'EM_CONFERENCIA' && (
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleApproveDoc(doc.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setShowRejectDialog(doc.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="requirements" className="m-0">
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Dialog open={showRequirementDialog} onOpenChange={setShowRequirementDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Nova Exigência
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nova Exigência</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Descrição *</Label>
                            <Textarea
                              value={newRequirement.description}
                              onChange={(e) => setNewRequirement({ ...newRequirement, description: e.target.value })}
                              placeholder="Descreva a exigência do órgão..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Prazo Oficial</Label>
                              <Input
                                type="date"
                                value={newRequirement.official_deadline_date}
                                onChange={(e) => setNewRequirement({ ...newRequirement, official_deadline_date: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Prazo Interno</Label>
                              <Input
                                type="date"
                                value={newRequirement.internal_deadline_date}
                                onChange={(e) => setNewRequirement({ ...newRequirement, internal_deadline_date: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowRequirementDialog(false)}>
                              Cancelar
                            </Button>
                            <Button onClick={handleAddRequirement} disabled={!newRequirement.description}>
                              Adicionar
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {requirements.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma exigência registrada
                    </p>
                  ) : (
                    requirements.map((req) => (
                      <div 
                        key={req.id}
                        className="p-4 rounded-lg bg-muted/50 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <StatusBadge 
                            status={req.status || 'ABERTA'} 
                            label={REQUIREMENT_STATUS_LABELS[req.status || 'ABERTA']} 
                          />
                          {req.official_deadline_date && (
                            <span className="text-sm text-muted-foreground">
                              Prazo: {format(new Date(req.official_deadline_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{req.description}</p>
                        {req.status === 'ABERTA' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateRequirement.mutateAsync({ id: req.id, status: 'RESPONDIDA' })}
                          >
                            Marcar como Respondida
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* Reject Document Dialog */}
      <Dialog open={!!showRejectDialog} onOpenChange={(open) => !open && setShowRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo da Rejeição *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Descreva o motivo da rejeição..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(null)}>
                Cancelar
              </Button>
              <Button onClick={handleRejectDoc} disabled={!rejectReason}>
                Rejeitar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
