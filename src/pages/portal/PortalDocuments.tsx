import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCases } from '@/hooks/useCases';
import { useDocuments } from '@/hooks/useDocuments';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSearchParams } from 'react-router-dom';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertTriangle,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { SERVICE_INTEREST_LABELS, DOCUMENT_STATUS_LABELS } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  NAO_ENVIADO: { icon: Upload, color: 'text-muted-foreground', bg: 'bg-muted' },
  ENVIADO: { icon: Clock, color: 'text-info', bg: 'bg-info/10' },
  EM_CONFERENCIA: { icon: Clock, color: 'text-accent', bg: 'bg-accent/10' },
  APROVADO: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  REJEITADO: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

export default function PortalDocuments() {
  const { user } = useAuth();
  const { cases, isLoading: casesLoading } = useCases();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Filter cases for current client
  const myCases = cases.filter(c => c.client_user_id === user?.id);
  
  const selectedCaseId = searchParams.get('case') || myCases[0]?.id;
  const { documents, documentTypes, isLoading: docsLoading, updateDocument } = useDocuments(selectedCaseId);

  const selectedCase = myCases.find(c => c.id === selectedCaseId);

  const handleFileUpload = async (documentId: string, file: File) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: 'Tipo de arquivo não permitido',
        description: 'Por favor, envie apenas arquivos PDF, JPG ou PNG.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo permitido é 10MB.',
        variant: 'destructive',
      });
      return;
    }

    setUploadingId(documentId);
    setUploadProgress(0);

    try {
      // Create unique file path: userId/caseId/documentId/filename
      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/${selectedCaseId}/${documentId}/${Date.now()}.${fileExt}`;
      
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('client-documents')
        .getPublicUrl(filePath);

      setUploadProgress(100);

      // Update document record with file URL
      await updateDocument.mutateAsync({
        id: documentId,
        file_url: urlData.publicUrl,
        status: 'ENVIADO',
      });

      toast({
        title: 'Documento enviado!',
        description: 'Seu documento foi enviado e está aguardando conferência.',
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Não foi possível enviar o documento. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setUploadingId(null);
      setUploadProgress(0);
    }
  };

  if (casesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (myCases.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Nenhum caso encontrado</h2>
        <p className="text-muted-foreground">Você não possui casos ativos no momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Documentos</h1>
        <p className="text-muted-foreground">
          Envie e acompanhe os documentos necessários para seus processos
        </p>
      </div>

      {/* Case Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <label className="text-sm font-medium whitespace-nowrap">
              Selecione o caso:
            </label>
            <Select
              value={selectedCaseId}
              onValueChange={(value) => setSearchParams({ case: value })}
            >
              <SelectTrigger className="w-full sm:w-96">
                <SelectValue placeholder="Selecione um caso" />
              </SelectTrigger>
              <SelectContent>
                {myCases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {SERVICE_INTEREST_LABELS[c.service_type]} - {c.protocol_number || 'Sem protocolo'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {selectedCase && (
        <Card>
          <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos - {SERVICE_INTEREST_LABELS[selectedCase.service_type]}
          </CardTitle>
            <CardDescription>
              Envie todos os documentos obrigatórios para dar andamento ao seu processo.
              <br />
              <span className="text-xs">Formatos aceitos: PDF, JPG, PNG (máx. 10MB)</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>Nenhum documento configurado para este tipo de caso.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => {
                  const docType = doc.service_document_types;
                  const status = doc.status || 'NAO_ENVIADO';
                  const config = statusConfig[status];
                  const StatusIcon = config.icon;
                  const isUploading = uploadingId === doc.id;

                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border"
                    >
                      <div className={`p-3 rounded-lg ${config.bg} self-start`}>
                        <StatusIcon className={`h-5 w-5 ${config.color}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-medium flex items-center gap-2">
                              {docType.name}
                              {docType.is_required && (
                                <Badge variant="outline" className="text-xs">
                                  Obrigatório
                                </Badge>
                              )}
                            </h4>
                            {docType.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {docType.description}
                              </p>
                            )}
                          </div>
                          <Badge className={config.bg + ' ' + config.color + ' border-0'}>
                            {DOCUMENT_STATUS_LABELS[status]}
                          </Badge>
                        </div>

                        {(docType.needs_apostille || docType.needs_translation) && (
                          <div className="flex gap-2 mt-2">
                            {docType.needs_apostille && (
                              <Badge variant="secondary" className="text-xs">
                                Requer Apostilamento
                              </Badge>
                            )}
                            {docType.needs_translation && (
                              <Badge variant="secondary" className="text-xs">
                                Requer Tradução
                              </Badge>
                            )}
                          </div>
                        )}

                        {status === 'REJEITADO' && doc.rejection_reason && (
                          <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
                            <strong>Motivo da rejeição:</strong> {doc.rejection_reason}
                          </div>
                        )}

                        {isUploading && (
                          <div className="mt-3">
                            <Progress value={uploadProgress} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              Enviando... {uploadProgress}%
                            </p>
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          {doc.file_url ? (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Ver documento
                              </a>
                            </Button>
                          ) : null}

                          {(status === 'NAO_ENVIADO' || status === 'REJEITADO') && !isUploading && (
                            <div className="relative">
                              <Input
                                type="file"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleFileUpload(doc.id, file);
                                  }
                                }}
                              />
                              <Button variant="default" size="sm">
                                <Upload className="h-4 w-4 mr-1" />
                                {doc.file_url ? 'Reenviar' : 'Enviar'}
                              </Button>
                            </div>
                          )}

                          {isUploading && (
                            <Button variant="default" size="sm" disabled>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Enviando...
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
