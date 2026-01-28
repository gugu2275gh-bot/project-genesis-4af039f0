import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, Clock, XCircle, Upload } from 'lucide-react';
import { DocumentWithType } from '@/hooks/useDocuments';

interface DocumentProgressCardProps {
  documents: DocumentWithType[];
}

export function DocumentProgressCard({ documents }: DocumentProgressCardProps) {
  const stats = {
    total: documents.length,
    approved: documents.filter(d => d.status === 'APROVADO').length,
    pending: documents.filter(d => d.status === 'EM_CONFERENCIA').length,
    rejected: documents.filter(d => d.status === 'REJEITADO').length,
    notSent: documents.filter(d => d.status === 'NAO_ENVIADO' || !d.status).length,
    required: documents.filter(d => d.service_document_types?.is_required).length,
    requiredApproved: documents.filter(d => d.service_document_types?.is_required && d.status === 'APROVADO').length,
  };

  const progressPercentage = stats.total > 0 
    ? Math.round((stats.approved / stats.total) * 100) 
    : 0;

  const requiredProgressPercentage = stats.required > 0
    ? Math.round((stats.requiredApproved / stats.required) * 100)
    : 100;

  const isComplete = stats.approved === stats.total && stats.total > 0;
  const requiredComplete = stats.requiredApproved === stats.required;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Progresso de Documentos
          </div>
          {isComplete && (
            <Badge className="bg-green-100 text-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Completo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{stats.approved}/{stats.total} aprovados</span>
          </div>
          <Progress 
            value={progressPercentage} 
            className="h-2"
          />
        </div>

        {/* Required Documents Progress */}
        {stats.required > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Obrigatórios</span>
              <span className={`font-medium ${requiredComplete ? 'text-green-600' : 'text-amber-600'}`}>
                {stats.requiredApproved}/{stats.required}
              </span>
            </div>
            <Progress 
              value={requiredProgressPercentage} 
              className={`h-2 ${requiredComplete ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-500'}`}
            />
          </div>
        )}

        {/* Status Summary */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Aprovados</span>
            <span className="font-medium ml-auto">{stats.approved}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Em Conferência</span>
            <span className="font-medium ml-auto">{stats.pending}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Rejeitados</span>
            <span className="font-medium ml-auto">{stats.rejected}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-2 w-2 rounded-full bg-gray-300" />
            <span className="text-muted-foreground">Não Enviados</span>
            <span className="font-medium ml-auto">{stats.notSent}</span>
          </div>
        </div>

        {/* Quick Status Icons */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{stats.approved}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">{stats.pending}</span>
          </div>
          <div className="flex items-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-xs font-medium">{stats.rejected}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Upload className="h-4 w-4" />
            <span className="text-xs font-medium">{stats.notSent}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
