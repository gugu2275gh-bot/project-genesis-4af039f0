import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { BookOpen, Upload, Trash2, FileText, Loader2 } from 'lucide-react';
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

  // Fetch knowledge base entries grouped by file
  const { data: entries, isLoading } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('knowledge_base')
        .select('file_name, file_path, content, chunk_index, created_at, is_active')
        .order('file_name')
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
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: 'Apenas arquivos PDF são aceitos', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande (máx. 10MB)', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const filePath = `pdfs/${Date.now()}_${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('knowledge-base')
        .upload(filePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Process the PDF
      setProcessing(file.name);
      const { data, error } = await supabase.functions.invoke('process-knowledge-pdf', {
        body: { filePath, fileName: file.name },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: `PDF processado: ${data.chunks} blocos extraídos (${data.totalChars} caracteres)` });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    } catch (err: any) {
      toast({ title: 'Erro ao processar PDF', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProcessing(null);
      e.target.value = '';
    }
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
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Máximo 10MB. O texto será extraído automaticamente.
              </p>
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
