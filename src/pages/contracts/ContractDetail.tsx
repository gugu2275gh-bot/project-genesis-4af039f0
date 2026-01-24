import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContract, useContracts } from '@/hooks/useContracts';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Send, Check, Save, X, Calendar, FileText, Users, Upload, FileCheck, Loader2 } from 'lucide-react';
import { CONTRACT_STATUS_LABELS, SERVICE_INTEREST_LABELS, LANGUAGE_LABELS, CONTRACT_TEMPLATE_LABELS, ContractTemplate } from '@/types/database';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BeneficiariesTab } from '@/components/contracts/BeneficiariesTab';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contract, isLoading } = useContract(id);
  const { updateContract, sendForSignature, markAsSigned, cancelContract } = useContracts();
  
  const [formData, setFormData] = useState({
    scope_summary: '',
    total_fee: '',
    installment_conditions: '',
    refund_policy_text: '',
    language: 'pt',
    installment_count: '1',
    installment_amount: '',
    first_due_date: '',
    contract_template: 'GENERICO',
    status: 'EM_ELABORACAO',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  
  // State for signed document upload
  const [signedDocumentFile, setSignedDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [signedDocumentUrl, setSignedDocumentUrl] = useState<string | null>(null);
  const { toast } = useToast();
  
  // State for sign with upload dialog
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signDialogFile, setSignDialogFile] = useState<File | null>(null);
  const [isSigningWithUpload, setIsSigningWithUpload] = useState(false);

  // Initialize form data when contract loads
  useEffect(() => {
    if (contract) {
      setFormData({
        scope_summary: contract.scope_summary || '',
        total_fee: contract.total_fee?.toString() || '',
        installment_conditions: contract.installment_conditions || '',
        refund_policy_text: contract.refund_policy_text || '',
        language: contract.language || 'pt',
        installment_count: contract.installment_count?.toString() || '1',
        installment_amount: contract.installment_amount?.toString() || '',
        first_due_date: contract.first_due_date || '',
        contract_template: (contract as any).contract_template || 'GENERICO',
        status: contract.status || 'EM_ELABORACAO',
      });
      setSignedDocumentUrl((contract as any).signed_document_url || null);
    }
  }, [contract]);

  // Auto-calculate installment amount when total or count changes
  useEffect(() => {
    const total = parseFloat(formData.total_fee);
    const count = parseInt(formData.installment_count);
    if (total > 0 && count > 0) {
      const amount = (total / count).toFixed(2);
      setFormData(prev => ({ ...prev, installment_amount: amount }));
    }
  }, [formData.total_fee, formData.installment_count]);

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

  if (!contract) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contrato não encontrado</p>
        <Button variant="link" onClick={() => navigate('/contracts')}>
          Voltar para contratos
        </Button>
      </div>
    );
  }

  const handleSave = async () => {
    // Validação: se status é ASSINADO, precisa ter documento
    if (formData.status === 'ASSINADO' && !signedDocumentFile && !signedDocumentUrl) {
      toast({
        title: 'Documento obrigatório',
        description: 'É necessário anexar o contrato assinado para marcar como "Assinado".',
        variant: 'destructive',
      });
      return;
    }

    let documentUrl = signedDocumentUrl;

    // Se tem arquivo novo para upload
    if (signedDocumentFile && formData.status === 'ASSINADO') {
      setIsUploading(true);
      try {
        const fileExt = signedDocumentFile.name.split('.').pop();
        const filePath = `contracts/${contract.id}/signed-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('signed-contracts')
          .upload(filePath, signedDocumentFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('signed-contracts')
          .getPublicUrl(filePath);

        documentUrl = urlData.publicUrl;
      } catch (error: any) {
        toast({
          title: 'Erro no upload',
          description: error.message || 'Não foi possível enviar o documento. Tente novamente.',
          variant: 'destructive',
        });
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    await updateContract.mutateAsync({
      id: contract.id,
      scope_summary: formData.scope_summary,
      total_fee: formData.total_fee ? parseFloat(formData.total_fee) : null,
      installment_conditions: formData.installment_conditions,
      refund_policy_text: formData.refund_policy_text,
      language: formData.language as any,
      installment_count: parseInt(formData.installment_count) || 1,
      installment_amount: formData.installment_amount ? parseFloat(formData.installment_amount) : null,
      first_due_date: formData.first_due_date || null,
      contract_template: formData.contract_template,
      status: formData.status,
      signed_document_url: documentUrl,
      signed_at: formData.status === 'ASSINADO' ? new Date().toISOString() : contract.signed_at,
    } as any);
    
    setSignedDocumentFile(null);
    setIsEditing(false);
  };

  const handleSendForSignature = async () => {
    await sendForSignature.mutateAsync(contract.id);
  };

  const handleMarkAsSignedWithUpload = async () => {
    if (!signDialogFile) {
      toast({
        title: 'Documento obrigatório',
        description: 'É necessário anexar o contrato assinado.',
        variant: 'destructive',
      });
      return;
    }

    setIsSigningWithUpload(true);
    
    try {
      // 1. Upload do documento
      const fileExt = signDialogFile.name.split('.').pop();
      const filePath = `contracts/${contract.id}/signed-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('signed-contracts')
        .upload(filePath, signDialogFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('signed-contracts')
        .getPublicUrl(filePath);

      // 2. Atualizar contrato com URL do documento
      await updateContract.mutateAsync({
        id: contract.id,
        signed_document_url: urlData.publicUrl,
      } as any);

      // 3. Marcar como assinado (gera pagamentos)
      await markAsSigned.mutateAsync(contract.id);
      
      setShowSignDialog(false);
      setSignDialogFile(null);
    } catch (error: any) {
      toast({
        title: 'Erro ao processar assinatura',
        description: error.message || 'Não foi possível completar a operação.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningWithUpload(false);
    }
  };

  const handleCancel = async () => {
    if (!cancellationReason.trim()) return;
    await cancelContract.mutateAsync({ 
      id: contract.id, 
      reason: cancellationReason 
    });
    setShowCancelDialog(false);
    setCancellationReason('');
  };

  const canEdit = contract.status === 'EM_ELABORACAO' || contract.status === 'EM_REVISAO';
  const canSend = contract.status === 'EM_REVISAO' && 
    contract.scope_summary && 
    contract.total_fee && 
    contract.installment_conditions &&
    contract.installment_count &&
    contract.first_due_date;
  const canSign = contract.status === 'ENVIADO';
  const canCancel = contract.status !== 'CANCELADO';

  // Generate preview of installments
  const installmentCount = parseInt(formData.installment_count) || 1;
  const installmentAmount = parseFloat(formData.installment_amount) || 0;
  const firstDueDate = formData.first_due_date ? new Date(formData.first_due_date) : null;
  
  const plannedInstallments = [];
  if (firstDueDate && installmentAmount > 0) {
    for (let i = 0; i < installmentCount; i++) {
      plannedInstallments.push({
        number: i + 1,
        amount: installmentAmount,
        dueDate: addMonths(firstDueDate, i),
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Contrato - {contract.opportunities?.leads?.contacts?.full_name}
          </div>
        }
        description={`Criado em ${format(new Date(contract.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`}
        actions={
          <div className="flex gap-2">
            {canCancel && (
              <Button variant="outline" onClick={() => setShowCancelDialog(true)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar Contrato
              </Button>
            )}
            {canEdit && !isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Editar
              </Button>
            )}
            {canSend && (
              <Button onClick={handleSendForSignature} disabled={sendForSignature.isPending}>
                <Send className="h-4 w-4 mr-2" />
                {sendForSignature.isPending ? 'Enviando...' : 'Enviar para Assinatura'}
              </Button>
            )}
            {canSign && (
              <Button onClick={() => setShowSignDialog(true)}>
                <Check className="h-4 w-4 mr-2" />
                Marcar como Assinado
              </Button>
            )}
          </div>
        }
      />

      {/* Cancel Contract Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>
              Esta ação irá cancelar o contrato e todos os pagamentos pendentes associados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Motivo do Cancelamento *</Label>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Voltar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancel}
              disabled={!cancellationReason.trim() || cancelContract.isPending}
            >
              {cancelContract.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Marcar como Assinado com Upload Obrigatório */}
      <Dialog open={showSignDialog} onOpenChange={(open) => {
        setShowSignDialog(open);
        if (!open) setSignDialogFile(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar Contrato como Assinado</DialogTitle>
            <DialogDescription>
              Para marcar o contrato como assinado, é obrigatório anexar o documento assinado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <Label className="text-primary font-medium">
                  Contrato Assinado (obrigatório)
                </Label>
              </div>
              
              {signDialogFile ? (
                <div className="flex items-center justify-between p-3 bg-background rounded-md border">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm">{signDialogFile.name}</span>
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSignDialogFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 10 * 1024 * 1024) {
                          toast({ 
                            title: 'Arquivo muito grande', 
                            description: 'Máximo 10MB', 
                            variant: 'destructive' 
                          });
                          return;
                        }
                        setSignDialogFile(file);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formatos aceitos: PDF, JPG, PNG (máx. 10MB)
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowSignDialog(false);
              setSignDialogFile(null);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleMarkAsSignedWithUpload}
              disabled={!signDialogFile || isSigningWithUpload}
            >
              {isSigningWithUpload ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Assinatura
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="font-medium">{contract.opportunities?.leads?.contacts?.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Serviço</p>
              <p className="font-medium">{SERVICE_INTEREST_LABELS[contract.service_type]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Modelo do Contrato</p>
              <p className="font-medium">{CONTRACT_TEMPLATE_LABELS[((contract as any).contract_template || 'GENERICO') as ContractTemplate]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <StatusBadge 
                status={contract.status || 'EM_ELABORACAO'} 
                label={CONTRACT_STATUS_LABELS[contract.status || 'EM_ELABORACAO']} 
              />
            </div>
            {contract.cancellation_reason && (
              <div>
                <p className="text-sm text-muted-foreground">Motivo do Cancelamento</p>
                <p className="text-sm text-destructive">{contract.cancellation_reason}</p>
              </div>
            )}
            {contract.signed_at && (
              <div>
                <p className="text-sm text-muted-foreground">Assinado em</p>
                <p className="font-medium">
                  {format(new Date(contract.signed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              </div>
            )}
            {contract.total_fee && (
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="font-medium text-lg">
                  {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: contract.currency || 'EUR' 
                  }).format(contract.total_fee)}
                </p>
              </div>
            )}
            {contract.installment_count && contract.installment_count > 1 && (
              <div>
                <p className="text-sm text-muted-foreground">Parcelamento</p>
                <p className="font-medium">
                  {contract.installment_count}x de {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: contract.currency || 'EUR' 
                  }).format(contract.installment_amount || 0)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract Details with Tabs */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="details">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="details">
                  <FileText className="h-4 w-4 mr-2" />
                  Detalhes
                </TabsTrigger>
                <TabsTrigger value="beneficiaries">
                  <Users className="h-4 w-4 mr-2" />
                  Beneficiários
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="details" className="m-0 space-y-4">
            {isEditing ? (
              <>
                <div>
                  <Label>Resumo do Escopo *</Label>
                  <Textarea
                    value={formData.scope_summary}
                    onChange={(e) => setFormData({ ...formData, scope_summary: e.target.value })}
                    placeholder="Descreva o escopo dos serviços..."
                    rows={4}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor Total (€) *</Label>
                    <Input
                      type="number"
                      value={formData.total_fee}
                      onChange={(e) => setFormData({ ...formData, total_fee: e.target.value })}
                      placeholder="1500.00"
                    />
                  </div>
                  <div>
                    <Label>Idioma do Contrato</Label>
                    <Select
                      value={formData.language}
                      onValueChange={(v) => setFormData({ ...formData, language: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Modelo do Contrato</Label>
                    <Select
                      value={formData.contract_template}
                      onValueChange={(v) => setFormData({ ...formData, contract_template: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTRACT_TEMPLATE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status do Contrato</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => {
                        // Se mudar de ASSINADO para outro status, limpar o arquivo
                        if (formData.status === 'ASSINADO' && v !== 'ASSINADO') {
                          setSignedDocumentFile(null);
                        }
                        setFormData({ ...formData, status: v });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EM_ELABORACAO">Em Elaboração</SelectItem>
                        <SelectItem value="EM_REVISAO">Em Revisão</SelectItem>
                        <SelectItem value="ENVIADO">Enviado</SelectItem>
                        {/* ASSINADO só aparece quando status original é ENVIADO */}
                        {contract.status === 'ENVIADO' && (
                          <SelectItem value="ASSINADO">Assinado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Upload de Contrato Assinado - aparece quando status é ASSINADO */}
                {formData.status === 'ASSINADO' && (
                  <div className="p-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Upload className="h-5 w-5 text-primary" />
                      <Label className="text-primary font-medium">Upload do Contrato Assinado *</Label>
                    </div>
                    
                    {signedDocumentUrl || signedDocumentFile ? (
                      <div className="flex items-center justify-between p-3 bg-background rounded-md border">
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-primary" />
                          <span className="text-sm">
                            {signedDocumentFile?.name || 'Documento anexado'}
                          </span>
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSignedDocumentFile(null);
                            setSignedDocumentUrl(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // Validar tamanho (10MB max)
                              if (file.size > 10 * 1024 * 1024) {
                                toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
                                return;
                              }
                              setSignedDocumentFile(file);
                            }
                          }}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Formatos aceitos: PDF, JPG, PNG (máx. 10MB)
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Installment Configuration */}
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Configuração de Parcelamento
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Número de Parcelas *</Label>
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        value={formData.installment_count}
                        onChange={(e) => setFormData({ ...formData, installment_count: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Valor da Parcela (€)</Label>
                      <Input
                        type="number"
                        value={formData.installment_amount}
                        onChange={(e) => setFormData({ ...formData, installment_amount: e.target.value })}
                        placeholder="Calculado automaticamente"
                      />
                    </div>
                    <div>
                      <Label>Data 1º Vencimento *</Label>
                      <Input
                        type="date"
                        value={formData.first_due_date}
                        onChange={(e) => setFormData({ ...formData, first_due_date: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Installment Preview */}
                  {plannedInstallments.length > 0 && (
                    <div className="mt-4">
                      <Label className="text-sm text-muted-foreground mb-2 block">
                        Prévia das Parcelas
                      </Label>
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="w-20">Parcela</TableHead>
                              <TableHead>Valor</TableHead>
                              <TableHead>Vencimento</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {plannedInstallments.map((inst) => (
                              <TableRow key={inst.number} className="hover:bg-transparent">
                                <TableCell className="font-medium">{inst.number}/{installmentCount}</TableCell>
                                <TableCell>
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: contract.currency || 'EUR' 
                                  }).format(inst.amount)}
                                </TableCell>
                                <TableCell>
                                  {format(inst.dueDate, 'dd/MM/yyyy', { locale: ptBR })}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Condições de Parcelamento (texto adicional)</Label>
                  <Textarea
                    value={formData.installment_conditions}
                    onChange={(e) => setFormData({ ...formData, installment_conditions: e.target.value })}
                    placeholder="Ex: 50% no ato da contratação, 50% na conclusão..."
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Política de Reembolso</Label>
                  <Textarea
                    value={formData.refund_policy_text}
                    onChange={(e) => setFormData({ ...formData, refund_policy_text: e.target.value })}
                    placeholder="Descreva a política de cancelamento e reembolso..."
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={
                      updateContract.isPending || 
                      isUploading ||
                      (formData.status === 'ASSINADO' && !signedDocumentFile && !signedDocumentUrl)
                    }
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {updateContract.isPending ? 'Salvando...' : 'Salvar'}
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Resumo do Escopo</p>
                  <p className="text-sm whitespace-pre-wrap">{contract.scope_summary || 'Não definido'}</p>
                </div>
                
                {/* Show installments when not editing */}
                {contract.installment_count && contract.installment_count > 0 && contract.first_due_date && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Parcelas Programadas</p>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-20">Parcela</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Vencimento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Array.from({ length: contract.installment_count }, (_, i) => (
                            <TableRow key={i} className="hover:bg-transparent">
                              <TableCell className="font-medium">{i + 1}/{contract.installment_count}</TableCell>
                              <TableCell>
                                {new Intl.NumberFormat('pt-BR', { 
                                  style: 'currency', 
                                  currency: contract.currency || 'EUR' 
                                }).format(contract.installment_amount || 0)}
                              </TableCell>
                              <TableCell>
                                {format(addMonths(new Date(contract.first_due_date), i), 'dd/MM/yyyy', { locale: ptBR })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Condições de Parcelamento</p>
                  <p className="text-sm whitespace-pre-wrap">{contract.installment_conditions || 'Não definido'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Política de Reembolso</p>
                  <p className="text-sm whitespace-pre-wrap">{contract.refund_policy_text || 'Não definido'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Idioma</p>
                  <p className="text-sm">{LANGUAGE_LABELS[contract.language || 'pt']}</p>
                </div>
              </>
            )}
              </TabsContent>
              
              <TabsContent value="beneficiaries" className="m-0">
                <BeneficiariesTab contractId={contract.id} />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
