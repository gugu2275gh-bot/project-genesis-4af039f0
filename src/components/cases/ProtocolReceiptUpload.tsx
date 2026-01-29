import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileCheck, Loader2, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProtocolReceiptUploadProps {
  serviceCaseId: string;
  protocolReceiptUrl: string | null;
  protocolReceiptApproved: boolean;
  protocolReceiptApprovedAt: string | null;
  protocolReceiptApprovedBy: string | null;
  assignedToUserId: string | null;
  onUploadSuccess?: () => void;
}

export function ProtocolReceiptUpload({
  serviceCaseId,
  protocolReceiptUrl,
  protocolReceiptApproved,
  protocolReceiptApprovedAt,
  protocolReceiptApprovedBy,
  assignedToUserId,
  onUploadSuccess,
}: ProtocolReceiptUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Tipo de arquivo inválido',
        description: 'Por favor, envie um arquivo PDF, JPG ou PNG.',
        variant: 'destructive',
      });
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O arquivo deve ter no máximo 10MB.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload to signed-contracts bucket (private)
      const fileName = `protocol-receipts/${serviceCaseId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('signed-contracts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get the signed URL
      const { data: urlData } = await supabase.storage
        .from('signed-contracts')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year validity

      // Update service case with receipt URL
      const { error: updateError } = await supabase
        .from('service_cases')
        .update({
          protocol_receipt_url: urlData?.signedUrl || fileName,
          protocol_receipt_approved: false,
        })
        .eq('id', serviceCaseId);

      if (updateError) throw updateError;

      // Create notification for the assigned technician
      if (assignedToUserId) {
        await supabase.from('notifications').insert({
          user_id: assignedToUserId,
          type: 'protocol_receipt_uploaded',
          title: 'Comprovante de Protocolo Inserido',
          message: `O jurídico inseriu o comprovante de protocolo para um caso. Por favor, revise e aprove.`,
        });
      }

      toast({
        title: 'Comprovante enviado!',
        description: 'O técnico será notificado para aprovar o documento.',
      });

      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
      onUploadSuccess?.();
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: 'Erro ao enviar comprovante',
        description: error.message || 'Ocorreu um erro ao enviar o arquivo.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);

    try {
      const { error } = await supabase
        .from('service_cases')
        .update({
          protocol_receipt_approved: true,
          protocol_receipt_approved_by: user?.id,
          protocol_receipt_approved_at: new Date().toISOString(),
        })
        .eq('id', serviceCaseId);

      if (error) throw error;

      toast({
        title: 'Comprovante aprovado!',
        description: 'O comprovante agora está visível no portal do cliente.',
      });

      queryClient.invalidateQueries({ queryKey: ['service-cases'] });
    } catch (error: any) {
      console.error('Erro ao aprovar:', error);
      toast({
        title: 'Erro ao aprovar comprovante',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck className="h-4 w-4" />
          Comprovante de Protocolo
        </CardTitle>
        <CardDescription>
          Documento privado - visível ao cliente apenas após aprovação do técnico
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!protocolReceiptUrl ? (
          // Upload form
          <div className="space-y-3">
            <Label htmlFor="protocol-receipt">Selecionar arquivo (PDF, JPG ou PNG)</Label>
            <div className="flex gap-2">
              <Input
                id="protocol-receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleUpload}
                disabled={isUploading}
                className="flex-1"
              />
            </div>
            {isUploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </div>
            )}
          </div>
        ) : (
          // Receipt uploaded - show status
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Comprovante enviado</p>
                  {protocolReceiptApproved ? (
                    <Badge variant="outline" className="bg-success/10 text-success mt-1">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Aprovado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-warning/10 text-warning mt-1">
                      <Clock className="h-3 w-3 mr-1" />
                      Aguardando aprovação do técnico
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a href={protocolReceiptUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Ver
                </a>
              </Button>
            </div>

            {protocolReceiptApprovedAt && (
              <p className="text-xs text-muted-foreground">
                Aprovado em {format(new Date(protocolReceiptApprovedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}

            {/* Approve button - only for technicians */}
            {!protocolReceiptApproved && (
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                className="w-full"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aprovando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Aprovar Comprovante (Técnico)
                  </>
                )}
              </Button>
            )}

            {/* Allow re-upload */}
            {!protocolReceiptApproved && (
              <div className="pt-2 border-t">
                <Label htmlFor="protocol-receipt-replace" className="text-xs text-muted-foreground">
                  Substituir arquivo
                </Label>
                <Input
                  id="protocol-receipt-replace"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleUpload}
                  disabled={isUploading}
                  className="mt-1"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
