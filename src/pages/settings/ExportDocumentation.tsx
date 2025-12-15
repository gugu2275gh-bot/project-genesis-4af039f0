import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2, CheckCircle } from 'lucide-react';
import { generateCustomerJourneyDocument } from '@/lib/generate-journey-document';
import { toast } from 'sonner';

export default function ExportDocumentation() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleExport = async () => {
    setIsGenerating(true);
    setIsComplete(false);
    
    try {
      await generateCustomerJourneyDocument();
      setIsComplete(true);
      toast.success('Documento gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar documento:', error);
      toast.error('Erro ao gerar documento. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exportar Documentação"
        description="Gere documentação completa do sistema em formato Word"
      />

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Esteira da Jornada do Cliente
            </CardTitle>
            <CardDescription>
              Documentação completa do fluxo end-to-end do sistema CB Asesoria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Este documento inclui:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Visão geral do sistema e tipos de serviço</li>
                <li>Fase 1: Captação de Leads</li>
                <li>Fase 2: Qualificação do Lead</li>
                <li>Fase 3: Oportunidade Comercial</li>
                <li>Fase 4: Elaboração e Assinatura de Contrato</li>
                <li>Fase 5: Gestão de Pagamentos</li>
                <li>Fase 6: Execução Técnica do Caso</li>
                <li>Fase 7: Encerramento e Pós-Venda</li>
                <li>Sistema de SLAs e Automações</li>
                <li>Portal do Cliente</li>
                <li>Integrações Externas</li>
                <li>Relatórios e Métricas</li>
              </ul>
            </div>

            <Button 
              onClick={handleExport} 
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando documento...
                </>
              ) : isComplete ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Documento gerado! Clique para gerar novamente
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Documento Word (.docx)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
