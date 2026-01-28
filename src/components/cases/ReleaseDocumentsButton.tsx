import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { FileText, Loader2, AlertCircle } from 'lucide-react';
import { useDocuments } from '@/hooks/useDocuments';
import { Database } from '@/integrations/supabase/types';

type ServiceInterest = Database['public']['Enums']['service_interest'];

interface ReleaseDocumentsButtonProps {
  serviceCaseId: string;
  serviceType: ServiceInterest;
  onSuccess?: () => void;
}

export function ReleaseDocumentsButton({
  serviceCaseId,
  serviceType,
  onSuccess,
}: ReleaseDocumentsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { provisionDocuments, documentTypesForService, isLoadingDocumentTypes } = useDocuments(serviceCaseId);

  const availableDocTypes = documentTypesForService(serviceType);
  const hasDocTypes = availableDocTypes.length > 0;

  const handleRelease = async () => {
    await provisionDocuments.mutateAsync({ serviceCaseId, serviceType });
    setIsOpen(false);
    onSuccess?.();
  };

  if (isLoadingDocumentTypes) {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Carregando...
      </Button>
    );
  }

  if (!hasDocTypes) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
        <AlertCircle className="h-5 w-5" />
        <div>
          <p className="font-medium">Nenhum tipo de documento cadastrado</p>
          <p className="text-sm">Configure os tipos de documento para este serviço em Configurações &gt; Tipos de Documento</p>
        </div>
      </div>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <FileText className="h-4 w-4 mr-2" />
          Liberar Documentos ({availableDocTypes.length} itens)
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Liberar Lista de Documentos</AlertDialogTitle>
          <AlertDialogDescription>
            Serão criados {availableDocTypes.length} documentos para o cliente enviar:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-2 my-4">
          {availableDocTypes.map((docType) => (
            <div 
              key={docType.id} 
              className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>{docType.name}</span>
              {docType.is_required && (
                <span className="text-amber-600 text-xs">(Obrigatório)</span>
              )}
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleRelease}
            disabled={provisionDocuments.isPending}
          >
            {provisionDocuments.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Liberando...
              </>
            ) : (
              'Confirmar Liberação'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
