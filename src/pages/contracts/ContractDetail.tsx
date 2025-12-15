import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContract, useContracts } from '@/hooks/useContracts';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { ArrowLeft, Send, Check, Save } from 'lucide-react';
import { CONTRACT_STATUS_LABELS, SERVICE_INTEREST_LABELS, LANGUAGE_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contract, isLoading } = useContract(id);
  const { updateContract, sendForSignature, markAsSigned } = useContracts();
  
  const [formData, setFormData] = useState({
    scope_summary: '',
    total_fee: '',
    installment_conditions: '',
    refund_policy_text: '',
    language: 'pt',
  });
  const [isEditing, setIsEditing] = useState(false);

  // Initialize form data when contract loads
  useState(() => {
    if (contract) {
      setFormData({
        scope_summary: contract.scope_summary || '',
        total_fee: contract.total_fee?.toString() || '',
        installment_conditions: contract.installment_conditions || '',
        refund_policy_text: contract.refund_policy_text || '',
        language: contract.language || 'pt',
      });
    }
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
    await updateContract.mutateAsync({
      id: contract.id,
      scope_summary: formData.scope_summary,
      total_fee: formData.total_fee ? parseFloat(formData.total_fee) : null,
      installment_conditions: formData.installment_conditions,
      refund_policy_text: formData.refund_policy_text,
      language: formData.language as any,
      status: 'EM_REVISAO',
    });
    setIsEditing(false);
  };

  const handleSendForSignature = async () => {
    await sendForSignature.mutateAsync(contract.id);
  };

  const handleMarkAsSigned = async () => {
    await markAsSigned.mutateAsync(contract.id);
  };

  const canEdit = contract.status === 'EM_ELABORACAO' || contract.status === 'EM_REVISAO';
  const canSend = contract.status === 'EM_REVISAO' && 
    contract.scope_summary && 
    contract.total_fee && 
    contract.installment_conditions;
  const canSign = contract.status === 'ENVIADO';

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
              <Button onClick={handleMarkAsSigned} disabled={markAsSigned.isPending}>
                <Check className="h-4 w-4 mr-2" />
                {markAsSigned.isPending ? 'Marcando...' : 'Marcar como Assinado'}
              </Button>
            )}
          </div>
        }
      />

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
              <p className="text-sm text-muted-foreground">Status</p>
              <StatusBadge 
                status={contract.status || 'EM_ELABORACAO'} 
                label={CONTRACT_STATUS_LABELS[contract.status || 'EM_ELABORACAO']} 
              />
            </div>
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
          </CardContent>
        </Card>

        {/* Contract Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Detalhes do Contrato</CardTitle>
            <CardDescription>
              {isEditing ? 'Edite os campos abaixo' : 'Visualize os detalhes do contrato'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <div>
                  <Label>Condições de Parcelamento *</Label>
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
                  <Button onClick={handleSave} disabled={updateContract.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    {updateContract.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Resumo do Escopo</p>
                  <p className="text-sm whitespace-pre-wrap">{contract.scope_summary || 'Não definido'}</p>
                </div>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
