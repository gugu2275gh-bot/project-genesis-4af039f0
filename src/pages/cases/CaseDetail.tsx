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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, FileText, AlertTriangle, Check, X, Plus, Send, User, Scale, Fingerprint, CreditCard, MessageSquare, CalendarIcon } from 'lucide-react';
import { 
  TECHNICAL_STATUS_LABELS, 
  SERVICE_INTEREST_LABELS, 
  SERVICE_SECTOR_LABELS,
  DOCUMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_LABELS 
} from '@/types/database';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { HuellasSection } from '@/components/cases/HuellasSection';
import { TiePickupSection } from '@/components/cases/TiePickupSection';
import { ResguardoUploadSection } from '@/components/cases/ResguardoUploadSection';
import { Switch } from '@/components/ui/switch';
import { CaseStatusTimeline } from '@/components/cases/CaseStatusTimeline';
import { TechnicalNotesSection } from '@/components/cases/TechnicalNotesSection';
import { DocumentProgressCard } from '@/components/cases/DocumentProgressCard';
import { SendWhatsAppButton } from '@/components/cases/SendWhatsAppButton';
import { InitialContactSLABadge } from '@/components/cases/InitialContactSLABadge';
import { ReleaseDocumentsButton } from '@/components/cases/ReleaseDocumentsButton';
import { ProtocolReceiptUpload } from '@/components/cases/ProtocolReceiptUpload';
import { ExpedienteNumberInput } from '@/components/cases/ExpedienteNumberInput';
import { RequirementActionsPanel } from '@/components/cases/RequirementActionsPanel';
import { ApprovalSection } from '@/components/cases/ApprovalSection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: serviceCase, isLoading } = useCase(id);
  const { updateStatus, assignCase, submitCase, closeCase, updateCase, approveDocumentation, sendToLegal, registerApproval, confirmClientContact, registerTieAvailable, scheduleTiePickupAppointment, confirmTiePickup, notifyTieReady } = useCases();
  const { documents, approveDocument, rejectDocument, markPostProtocolPending } = useDocuments(id);
  const { requirements, createRequirement, updateRequirement, requestExtension, sendToLegal: sendRequirementToLegal } = useRequirements(id);
  const { data: profiles } = useProfiles();

  const [protocolNumber, setProtocolNumber] = useState('');
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeResult, setCloseResult] = useState<'APROVADO' | 'NEGADO'>('APROVADO');
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRecursoDialog, setShowRecursoDialog] = useState(false);
  const [recursoDeadline, setRecursoDeadline] = useState('');
  const [recursoNotes, setRecursoNotes] = useState('');

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
    const currentStatus = serviceCase.technical_status;
    await updateStatus.mutateAsync({ id: serviceCase.id, status, fromStatus: currentStatus || undefined });
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


  const handleSendToJuridico = async () => {
    await sendToLegal.mutateAsync(serviceCase.id);
  };

  const handleApproveDocumentation = async (partial: boolean = false) => {
    await approveDocumentation.mutateAsync({ id: serviceCase.id, partial });
  };

  const handleMarkProtocolado = async () => {
    await updateStatus.mutateAsync({ id: serviceCase.id, status: 'PROTOCOLADO' });
  };

  const handleStartRecurso = async () => {
    await updateCase.mutateAsync({
      id: serviceCase.id,
      technical_status: 'EM_RECURSO' as any,
      resource_deadline: recursoDeadline || null,
      resource_notes: recursoNotes || null,
    });
    setShowRecursoDialog(false);
  };

  const handleSetPriority = async (priority: string) => {
    await updateCase.mutateAsync({
      id: serviceCase.id,
      case_priority: priority,
    });
  };

  const handleToggleUrgent = async (isUrgent: boolean) => {
    await updateCase.mutateAsync({
      id: serviceCase.id,
      is_urgent: isUrgent,
      case_priority: isUrgent ? 'URGENTE' : 'NORMAL',
    });
  };

  const isEncerrado = serviceCase.technical_status?.startsWith('ENCERRADO') || serviceCase.technical_status === 'TIE_RETIRADO';
  const showHuellasSection = ['AGENDAR_HUELLAS', 'AGUARDANDO_CITA_HUELLAS', 'HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '');
  const showTieSection = ['HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '');

  // Client data for templates
  const clientPhone = serviceCase.opportunities?.leads?.contacts?.phone ?? null;
  const clientName = serviceCase.opportunities?.leads?.contacts?.full_name || 'Cliente';
  const clientEmail = serviceCase.opportunities?.leads?.contacts?.email;
  const leadId = serviceCase.opportunities?.leads?.id;

  // Fluxo de ações baseado no status
  const getAvailableActions = () => {
    const status = serviceCase.technical_status;
    const actions = [];

    // Botão de Contato Inicial sempre visível nas primeiras fases
    if (status === 'CONTATO_INICIAL') {
      actions.push({ 
        label: 'Iniciar Contato', 
        action: () => {}, // Handled by SendWhatsAppButton
        icon: MessageSquare,
        isWhatsApp: true 
      });
    }

    if (status === 'DOCUMENTOS_EM_CONFERENCIA') {
      actions.push({ label: 'Aprovar Documentação', action: () => handleApproveDocumentation(false), icon: Check });
      actions.push({ label: 'Aprovar Parcial', action: () => handleApproveDocumentation(true), icon: Check });
    }
    if (status === 'DOCUMENTACAO_PARCIAL_APROVADA' || status === 'EM_ORGANIZACAO' || status === 'PRONTO_PARA_SUBMISSAO') {
      actions.push({ label: 'Enviar ao Jurídico', action: handleSendToJuridico, icon: Scale });
    }
    if (status === 'ENVIADO_JURIDICO') {
      actions.push({ label: 'Marcar Protocolado', action: handleMarkProtocolado, icon: Send });
    }
    // Removed - handled by ApprovalSection now
    if (status === 'DENEGADO') {
      actions.push({ label: 'Entrar com Recurso', action: () => setShowRecursoDialog(true), icon: Scale });
    }
    
    return actions;
  };

  const availableActions = getAvailableActions();

  const caseData = serviceCase as any;
  const isSuspended = caseData.is_suspended === true;

  return (
    <div className="space-y-6">
      {/* Suspension Alert */}
      {isSuspended && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Caso Suspenso por Inadimplência</AlertTitle>
          <AlertDescription>
            Este caso foi suspenso em {caseData.suspended_at ? format(new Date(caseData.suspended_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'}.
            <br />
            <strong>Motivo:</strong> {caseData.suspension_reason || 'Não informado'}
            <br />
            <span className="text-sm">Aguarde a regularização financeira para continuar o processo.</span>
          </AlertDescription>
        </Alert>
      )}
      
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
          <div className="flex gap-2 flex-wrap">
            {/* WhatsApp button - always available */}
            <SendWhatsAppButton
              phone={clientPhone}
              clientName={clientName}
              leadId={leadId}
              serviceType={SERVICE_INTEREST_LABELS[serviceCase.service_type]}
              protocolNumber={serviceCase.protocol_number}
              expedienteNumber={(serviceCase as any).expediente_number}
              huellasDate={serviceCase.huellas_date}
              huellasTime={serviceCase.huellas_time}
              huellasLocation={serviceCase.huellas_location}
              residenciaValidityDate={(serviceCase as any).residencia_validity_date}
              serviceCaseId={serviceCase.id}
              onStatusUpdate={(status) => handleStatusChange(status)}
            />

            {/* Ações disponíveis baseadas no status */}
            {availableActions.filter(a => !(a as any).isWhatsApp).map((action, idx) => (
              <Button key={idx} variant="outline" onClick={action.action}>
                <action.icon className="h-4 w-4 mr-2" />
                {action.label}
              </Button>
            ))}

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
            {!isEncerrado && (serviceCase.technical_status === 'EM_ACOMPANHAMENTO' || serviceCase.technical_status === 'TIE_RETIRADO') && (
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
            {/* SLA Badge for Initial Contact */}
            <InitialContactSLABadge 
              createdAt={serviceCase.created_at || new Date().toISOString()}
              firstContactAt={(serviceCase as any).first_contact_at}
              technicalStatus={serviceCase.technical_status}
            />

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

            {/* Prioridade / Urgência */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Caso Urgente</p>
                <p className="text-xs text-muted-foreground">Ativa lembretes a cada 24h</p>
              </div>
              <Switch
                checked={serviceCase.is_urgent || false}
                onCheckedChange={handleToggleUrgent}
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Prioridade</p>
              <Select 
                value={serviceCase.case_priority || 'NORMAL'} 
                onValueChange={handleSetPriority}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="URGENTE">Urgente</SelectItem>
                  <SelectItem value="EM_ESPERA">Em Espera</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Data Prevista de Protocolo</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !serviceCase.expected_protocol_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {serviceCase.expected_protocol_date 
                      ? format(new Date(serviceCase.expected_protocol_date), 'dd/MM/yyyy', { locale: ptBR })
                      : "Definir data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={serviceCase.expected_protocol_date ? new Date(serviceCase.expected_protocol_date) : undefined}
                    onSelect={async (date) => {
                      if (date) {
                        await updateCase.mutateAsync({
                          id: serviceCase.id,
                          expected_protocol_date: format(date, 'yyyy-MM-dd'),
                        });
                      }
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {serviceCase.expected_protocol_date && (() => {
                const daysUntil = differenceInDays(new Date(serviceCase.expected_protocol_date), new Date());
                if (daysUntil < 0) {
                  return (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      ⚠️ Prazo expirado há {Math.abs(daysUntil)} dias
                    </p>
                  );
                } else if (daysUntil <= 7) {
                  return (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      ⏰ Faltam apenas {daysUntil} dias!
                    </p>
                  );
                } else if (daysUntil <= 14) {
                  return (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ Faltam {daysUntil} dias para o prazo
                    </p>
                  );
                }
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    Faltam {daysUntil} dias para o prazo
                  </p>
                );
              })()}
            </div>

            {serviceCase.protocol_number && (
              <div>
                <p className="text-sm text-muted-foreground">Protocolo</p>
                <p className="font-medium">{serviceCase.protocol_number}</p>
              </div>
            )}

            {/* Número de Expediente - visível após protocolo */}
            {(serviceCase as any).expediente_number && (
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground">Expediente (ID do Processo)</p>
                <p className="font-mono font-bold text-primary">{(serviceCase as any).expediente_number}</p>
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

            {/* Info de Recurso */}
            {serviceCase.resource_status && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm font-medium text-amber-800">Em Recurso</p>
                {serviceCase.resource_deadline && (
                  <p className="text-xs text-amber-600">
                    Prazo: {format(new Date(serviceCase.resource_deadline), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                )}
                {serviceCase.resource_notes && (
                  <p className="text-xs text-amber-600 mt-1">{serviceCase.resource_notes}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right side panels - Timeline, Notes, Document Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top row - Timeline, Progress, Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CaseStatusTimeline 
              serviceCaseId={serviceCase.id} 
              currentStatus={serviceCase.technical_status || 'CONTATO_INICIAL'} 
            />
            <DocumentProgressCard documents={documents} />
            <TechnicalNotesSection serviceCaseId={serviceCase.id} />
          </div>

          {/* Approval Section - visible for relevant statuses */}
          {['PROTOCOLADO', 'EM_ACOMPANHAMENTO', 'APROVADO_INTERNAMENTE', 'AGENDAR_HUELLAS', 'AGUARDANDO_CITA_HUELLAS', 'HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '') && (
            <ApprovalSection
              serviceCase={serviceCase}
              onRegisterApproval={async (approvalDate, residenciaValidityDate) => {
                await registerApproval.mutateAsync({ 
                  id: serviceCase.id, 
                  approvalDate, 
                  residenciaValidityDate 
                });
              }}
              onConfirmClientContact={async () => {
                await confirmClientContact.mutateAsync(serviceCase.id);
              }}
              isLoading={registerApproval.isPending || confirmClientContact.isPending}
            />
          )}

          {/* Seção de Protocolo - visível após ENVIADO_JURIDICO */}
          {['ENVIADO_JURIDICO', 'PROTOCOLADO', 'EM_ACOMPANHAMENTO', 'APROVADO_INTERNAMENTE', 'AGENDAR_HUELLAS', 'AGUARDANDO_CITA_HUELLAS', 'HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProtocolReceiptUpload
                serviceCaseId={serviceCase.id}
                protocolReceiptUrl={(serviceCase as any).protocol_receipt_url}
                protocolReceiptApproved={(serviceCase as any).protocol_receipt_approved || false}
                protocolReceiptApprovedAt={(serviceCase as any).protocol_receipt_approved_at}
                protocolReceiptApprovedBy={(serviceCase as any).protocol_receipt_approved_by}
                assignedToUserId={serviceCase.assigned_to_user_id}
              />
              <ExpedienteNumberInput
                serviceCaseId={serviceCase.id}
                expedienteNumber={(serviceCase as any).expediente_number}
                clientName={clientName}
                clientPhone={clientPhone}
                clientUserId={serviceCase.client_user_id}
                serviceType={SERVICE_INTEREST_LABELS[serviceCase.service_type]}
              />
            </div>
          )}

          {/* Tabs for Documents, Requirements, Huellas, TIE */}
          <Card>
          <Tabs defaultValue="documents">
            <CardHeader>
              <TabsList className="flex-wrap">
                <TabsTrigger value="documents">
                  <FileText className="h-4 w-4 mr-2" />
                  Documentos ({documents.length})
                </TabsTrigger>
                <TabsTrigger value="requirements">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Exigências ({requirements.length})
                </TabsTrigger>
                {showHuellasSection && (
                  <TabsTrigger value="huellas">
                    <Fingerprint className="h-4 w-4 mr-2" />
                    Huellas
                  </TabsTrigger>
                )}
                {showTieSection && (
                  <TabsTrigger value="tie">
                    <CreditCard className="h-4 w-4 mr-2" />
                    TIE
                  </TabsTrigger>
                )}
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="documents" className="m-0">
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <div className="text-center py-8 space-y-4">
                      <div className="text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">Nenhum documento vinculado a este caso</p>
                        <p className="text-sm mt-1">
                          Os documentos serão liberados após o contato inicial com o cliente.
                        </p>
                      </div>
                      <ReleaseDocumentsButton
                        serviceCaseId={serviceCase.id}
                        serviceType={serviceCase.service_type}
                        onSuccess={() => handleStatusChange('AGUARDANDO_DOCUMENTOS')}
                      />
                    </div>
                  ) : (
                    documents.map((doc) => {
                      const isProtocolado = ['PROTOCOLADO', 'EM_ACOMPANHAMENTO', 'AGENDAR_HUELLAS', 'AGUARDANDO_CITA_HUELLAS', 'HUELLAS_REALIZADO', 'DISPONIVEL_RETIRADA_TIE', 'AGUARDANDO_CITA_RETIRADA', 'TIE_RETIRADO', 'ENCERRADO_APROVADO'].includes(serviceCase.technical_status || '');
                      const docData = doc as any;
                      
                      return (
                        <div 
                          key={doc.id}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-lg bg-muted/50",
                            docData.is_post_protocol_pending && "border-l-4 border-amber-500"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{doc.service_document_types.name}</p>
                                {docData.is_post_protocol_pending && (
                                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                                    Pós-Protocolo
                                  </span>
                                )}
                              </div>
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
                          <div className="flex gap-2 items-center">
                            {/* Toggle pós-protocolo - apenas visível após PROTOCOLADO e para docs não aprovados */}
                            {isProtocolado && doc.status !== 'APROVADO' && (
                              <Button
                                size="sm"
                                variant={docData.is_post_protocol_pending ? "secondary" : "outline"}
                                onClick={() => markPostProtocolPending.mutateAsync({ 
                                  docId: doc.id, 
                                  isPending: !docData.is_post_protocol_pending 
                                })}
                                title={docData.is_post_protocol_pending ? "Remover marcação pós-protocolo" : "Marcar como pendente pós-protocolo"}
                              >
                                {docData.is_post_protocol_pending ? "Pendente" : "Pós-Proto"}
                              </Button>
                            )}
                            {doc.status === 'EM_CONFERENCIA' && (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </TabsContent>

              <TabsContent value="requirements" className="m-0">
                <RequirementActionsPanel
                  requirements={requirements}
                  serviceCaseId={serviceCase.id}
                  onCreateRequirement={async (data) => {
                    await createRequirement.mutateAsync(data);
                  }}
                  onUpdateRequirement={async (data) => {
                    await updateRequirement.mutateAsync(data);
                  }}
                  onRequestExtension={async (reqId, newDeadline) => {
                    await requestExtension.mutateAsync({ id: reqId, newDeadline });
                  }}
                  onSendToLegal={async (reqId) => {
                    await sendRequirementToLegal.mutateAsync(reqId);
                  }}
                  isLoading={createRequirement.isPending || updateRequirement.isPending}
                />
              </TabsContent>

              {showHuellasSection && (
                <TabsContent value="huellas" className="m-0">
                  <HuellasSection 
                    serviceCase={serviceCase} 
                    onUpdate={(data) => updateCase.mutateAsync({ id: serviceCase.id, ...data })}
                    isUpdating={updateCase.isPending}
                  />
                </TabsContent>
              )}

              {showTieSection && (
                <TabsContent value="tie" className="m-0">
                  <div className="space-y-4">
                    <ResguardoUploadSection
                      serviceCase={serviceCase}
                      clientName={clientName}
                      clientPhone={clientPhone}
                      onRegisterTieAvailable={(data) => registerTieAvailable.mutateAsync({ 
                        id: serviceCase.id, 
                        lotNumber: data.tie_lot_number,
                        validityDate: data.tie_validity_date,
                        estimatedReadyDate: data.tie_estimated_ready_date,
                        requiresAppointment: data.tie_pickup_requires_appointment,
                      })}
                      onNotifyClient={() => notifyTieReady.mutateAsync(serviceCase.id)}
                      isUpdating={registerTieAvailable.isPending || notifyTieReady.isPending}
                    />
                    <TiePickupSection 
                      serviceCase={serviceCase} 
                      onUpdate={(data) => updateCase.mutateAsync({ id: serviceCase.id, ...data })}
                      onScheduleAppointment={(data) => scheduleTiePickupAppointment.mutateAsync({ 
                        id: serviceCase.id, 
                        date: data.date, 
                        time: data.time, 
                        location: data.location 
                      })}
                      isUpdating={updateCase.isPending || scheduleTiePickupAppointment.isPending}
                    />
                  </div>
                </TabsContent>
              )}
            </CardContent>
          </Tabs>
        </Card>
        </div>
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

      {/* Recurso Dialog */}
      <Dialog open={showRecursoDialog} onOpenChange={setShowRecursoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar Recurso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prazo do Recurso</Label>
              <Input
                type="date"
                value={recursoDeadline}
                onChange={(e) => setRecursoDeadline(e.target.value)}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                value={recursoNotes}
                onChange={(e) => setRecursoNotes(e.target.value)}
                placeholder="Detalhes sobre o recurso..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRecursoDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleStartRecurso}>
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}