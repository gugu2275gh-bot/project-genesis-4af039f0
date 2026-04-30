import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Upload, Trash2, FileText, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface KnowledgeEntry {
  file_name: string;
  file_path: string;
  chunk_count: number;
  total_chars: number;
  created_at: string;
  is_active: boolean;
}

export default function KnowledgeBaseManager() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasRole('ADMIN');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  // Fetch knowledge base entries grouped by file
  const { data: entries, isLoading } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('knowledge_base')
        .select('file_name, file_path, content, chunk_index, created_at, is_active')
        .order('created_at', { ascending: false })
        .order('chunk_index');

      if (error) throw error;

      // Group by file
      const fileMap = new Map<string, KnowledgeEntry>();
      for (const row of data || []) {
        const existing = fileMap.get(row.file_path);
        if (existing) {
          existing.chunk_count++;
          existing.total_chars += (row.content?.length || 0);
        } else {
          fileMap.set(row.file_path, {
            file_name: row.file_name,
            file_path: row.file_path,
            chunk_count: 1,
            total_chars: row.content?.length || 0,
            created_at: row.created_at,
            is_active: row.is_active,
          });
        }
      }
      return Array.from(fileMap.values());
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast({ title: `"${file.name}" não é PDF — ignorado`, variant: 'destructive' });
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: `"${file.name}" excede 10MB — ignorado`, variant: 'destructive' });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setUploading(true);
    let success = 0;
    let failed = 0;

    for (const file of validFiles) {
      try {
        const sanitizedName = file.name
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `pdfs/${Date.now()}_${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
          .from('knowledge-base')
          .upload(filePath, file, { contentType: 'application/pdf' });

        if (uploadError) throw uploadError;

        setProcessing(file.name);
        const { data, error } = await supabase.functions.invoke('process-knowledge-pdf', {
          body: { filePath, fileName: file.name },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        success++;
      } catch (err: any) {
        failed++;
        console.error('Upload error for', file.name, err);
      }
    }

    setProcessing(null);
    setUploading(false);
    e.target.value = '';
    queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    toast({
      title: `Upload concluído`,
      description: `${success} PDF(s) processado(s)${failed > 0 ? `, ${failed} falharam` : ''}`,
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (filePath: string) => {
      // Delete from knowledge_base table
      const { error: dbError } = await (supabase as any)
        .from('knowledge_base')
        .delete()
        .eq('file_path', filePath);
      if (dbError) throw dbError;

      // Delete from storage
      await supabase.storage.from('knowledge-base').remove([filePath]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast({ title: 'Arquivo removido da base de conhecimento' });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao remover arquivo', description: err.message, variant: 'destructive' });
    },
  });

  const handleReprocessAll = async () => {
    setReprocessing(true);
    let success = 0;
    let failed = 0;
    
    // Get files from storage if entries list is empty (e.g. after cleanup)
    let filesToProcess: Array<{ file_name: string; file_path: string }> = [];
    
    if (entries?.length) {
      filesToProcess = entries.map(e => ({ file_name: e.file_name, file_path: e.file_path }));
    } else {
      // List from storage
      const { data: storageFiles } = await supabase.storage.from('knowledge-base').list('pdfs');
      if (storageFiles?.length) {
        filesToProcess = storageFiles
          .filter(f => f.name.toLowerCase().endsWith('.pdf'))
          .map(f => ({
            file_name: f.name.replace(/^\d+_/, '').replace(/_/g, ' '),
            file_path: `pdfs/${f.name}`,
          }));
      }
    }

    if (!filesToProcess.length) {
      setReprocessing(false);
      toast({ title: 'Nenhum PDF encontrado para reprocessar', variant: 'destructive' });
      return;
    }
    
    for (const file of filesToProcess) {
      try {
        setProcessing(file.file_name);
        const { data, error } = await supabase.functions.invoke('process-knowledge-pdf', {
          body: { filePath: file.file_path, fileName: file.file_name },
        });
        if (error || data?.error) {
          failed++;
          console.error('Reprocess error for', file.file_name, error || data?.error);
        } else {
          success++;
        }
      } catch (err) {
        failed++;
        console.error('Reprocess error for', file.file_name, err);
      }
    }
    
    setProcessing(null);
    setReprocessing(false);
    queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    toast({
      title: `Reprocessamento concluído`,
      description: `${success} PDFs reprocessados com sucesso${failed > 0 ? `, ${failed} falharam` : ''}`,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Base de Conhecimento (PDFs)
        </CardTitle>
        <CardDescription>
          Envie PDFs para que o agente de IA use como referência nas respostas do WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Upload button */}
          {isAdmin && (
            <div>
              <label htmlFor="pdf-upload">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  disabled={uploading}
                  asChild
                >
                  <span>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {processing ? `Processando ${processing}...` : 'Enviar PDF'}
                  </span>
                </Button>
              </label>
              <input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Máximo 10MB. O texto será extraído automaticamente.
              </p>
              {(
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReprocessAll}
                    disabled={reprocessing}
                  >
                    {reprocessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {reprocessing ? `Reprocessando ${processing || '...'}` : 'Reprocessar todos os PDFs'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={reprocessing}
                    onClick={async () => {
                      setReprocessing(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('backfill-kb-embeddings', { body: {} });
                        if (error || data?.error) {
                          toast({ title: 'Erro ao gerar embeddings', description: error?.message || data?.error, variant: 'destructive' });
                        } else {
                          toast({
                            title: 'Embeddings gerados',
                            description: `${data?.processed ?? 0} de ${data?.total ?? 0} chunks processados${data?.failed ? ` (${data.failed} falharam)` : ''}`,
                          });
                        }
                      } finally {
                        setReprocessing(false);
                      }
                    }}
                  >
                    Gerar embeddings (busca semântica)
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Files list */}
          {entries && entries.length > 0 ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.file_path}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{entry.file_name}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>{entry.chunk_count} blocos</span>
                        <span>•</span>
                        <span>{(entry.total_chars / 1000).toFixed(1)}k caracteres</span>
                        <span>•</span>
                        <span>{format(new Date(entry.created_at), 'dd/MM/yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.is_active ? 'default' : 'secondary'}>
                      {entry.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(entry.file_path)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum PDF na base de conhecimento. Envie um arquivo para começar.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
