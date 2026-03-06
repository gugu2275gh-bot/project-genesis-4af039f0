import { useAuth } from '@/contexts/AuthContext';
import { useClientContracts } from '@/hooks/useClientContracts';
import { useContracts } from '@/hooks/useContracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock,
  PenTool,
  ExternalLink,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  SERVICE_INTEREST_LABELS, 
  CONTRACT_STATUS_LABELS,
  LANGUAGE_LABELS 
} from '@/types/database';
import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  EM_ELABORACAO: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
  APROVADO: { icon: CheckCircle2, color: 'text-info', bg: 'bg-info/10' },
  REPROVADO: { icon: FileText, color: 'text-warning', bg: 'bg-warning/10' },
  ASSINADO: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  CANCELADO: { icon: FileText, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function PortalContracts() {
  const { user } = useAuth();
  const { data: contracts = [], isLoading } = useClientContracts();
  const { markAsSigned } = useContracts();
  const { toast } = useToast();

  const handleSignContract = async (contractId: string) => {
    try {
      await markAsSigned.mutateAsync(contractId);
      toast({
        title: 'Contrato assinado!',
        description: 'Seu contrato foi assinado digitalmente com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao assinar',
        description: 'Não foi possível assinar o contrato. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const buildContractContent = (contract: typeof contracts[0]) => {
    const lines: { text: string; bold?: boolean; heading?: boolean }[] = [];
    
    lines.push({ text: 'CB ASESORIA', heading: true });
    lines.push({ text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS', heading: true });
    lines.push({ text: '' });
    lines.push({ text: `Serviço: ${SERVICE_INTEREST_LABELS[contract.service_type]}` });
    lines.push({ text: `Data: ${format(new Date(contract.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}` });
    
    if (contract.total_fee) {
      lines.push({ text: `Valor Total: ${contract.currency || 'EUR'} ${contract.total_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` });
    }
    if (contract.installment_conditions) {
      lines.push({ text: `Condições: ${contract.installment_conditions}` });
    }
    if (contract.language) {
      lines.push({ text: `Idioma: ${LANGUAGE_LABELS[contract.language]}` });
    }
    if (contract.scope_summary) {
      lines.push({ text: '' });
      lines.push({ text: 'Escopo do Serviço:', bold: true });
      lines.push({ text: contract.scope_summary });
    }
    if (contract.refund_policy_text) {
      lines.push({ text: '' });
      lines.push({ text: 'Política de Reembolso:', bold: true });
      lines.push({ text: contract.refund_policy_text });
    }
    if (contract.signed_at) {
      lines.push({ text: '' });
      lines.push({ text: 'ASSINADO DIGITALMENTE', bold: true });
      lines.push({ text: `Data da assinatura: ${format(new Date(contract.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` });
    }
    
    return lines;
  };

  const handleDownloadPDF = (contract: typeof contracts[0]) => {
    try {
      const doc = new jsPDF();
      const lines = buildContractContent(contract);
      let y = 20;
      
      for (const line of lines) {
        if (line.heading) {
          doc.setFontSize(line.text === 'CB ASESORIA' ? 20 : 16);
          doc.setFont('helvetica', 'bold');
          doc.text(line.text, 105, y, { align: 'center' });
          y += 12;
        } else if (line.text === '') {
          y += 6;
        } else {
          doc.setFontSize(12);
          doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
          const splitLines = doc.splitTextToSize(line.text, 170);
          doc.text(splitLines, 20, y);
          y += splitLines.length * 7 + 3;
        }
      }
      
      doc.setFontSize(10);
      doc.text('CB Asesoria - Serviços de Imigração', 105, 280, { align: 'center' });
      doc.save(`contrato-${contract.id.slice(0, 8)}.pdf`);
      
      toast({ title: 'Download iniciado', description: 'Contrato PDF baixado com sucesso.' });
    } catch {
      toast({ title: 'Erro ao baixar', description: 'Não foi possível gerar o PDF.', variant: 'destructive' });
    }
  };

  const handleDownloadWord = async (contract: typeof contracts[0]) => {
    try {
      const lines = buildContractContent(contract);
      const paragraphs: Paragraph[] = [];
      
      for (const line of lines) {
        if (line.heading) {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: line.text, bold: true, size: line.text === 'CB ASESORIA' ? 32 : 28, font: 'Calibri' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }));
        } else if (line.text === '') {
          paragraphs.push(new Paragraph({ children: [new TextRun({ text: '', size: 22 })], spacing: { after: 100 } }));
        } else {
          paragraphs.push(new Paragraph({
            children: [new TextRun({ text: line.text, bold: line.bold, size: 22, font: 'Calibri' })],
            spacing: { after: 100 },
            alignment: AlignmentType.JUSTIFIED,
          }));
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children: paragraphs }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `contrato-${contract.id.slice(0, 8)}.docx`);
      
      toast({ title: 'Download iniciado', description: 'Contrato Word baixado com sucesso.' });
    } catch {
      toast({ title: 'Erro ao baixar', description: 'Não foi possível gerar o Word.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Contratos</h1>
        <p className="text-muted-foreground">
          Visualize e acompanhe seus contratos
        </p>
      </div>

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Nenhum contrato encontrado</h2>
            <p className="text-muted-foreground">
              Você não possui contratos registrados no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {contracts.map((contract) => {
            const status = contract.status || 'EM_ELABORACAO';
            const config = statusConfig[status];
            const StatusIcon = config.icon;

            return (
              <Card key={contract.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${config.bg}`}>
                        <StatusIcon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {SERVICE_INTEREST_LABELS[contract.service_type]}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Criado em {format(new Date(contract.created_at!), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={`${config.bg} ${config.color} border-0`}>
                      {CONTRACT_STATUS_LABELS[status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Total</p>
                      <p className="font-semibold">
                        {contract.total_fee 
                          ? `${contract.currency || 'EUR'} ${contract.total_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '-'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Idioma</p>
                      <p className="font-semibold">
                        {contract.language ? LANGUAGE_LABELS[contract.language] : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Condições</p>
                      <p className="font-semibold truncate">
                        {contract.installment_conditions || '-'}
                      </p>
                    </div>
                    {contract.signed_at && (
                      <div>
                        <p className="text-sm text-muted-foreground">Assinado em</p>
                        <p className="font-semibold">
                          {format(new Date(contract.signed_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>

                  {contract.scope_summary && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Escopo do Serviço</p>
                      <p className="text-sm">{contract.scope_summary}</p>
                    </div>
                  )}

                  {contract.refund_policy_text && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Política de Reembolso</p>
                      <p className="text-sm">{contract.refund_policy_text}</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    {status === 'APROVADO' && (
                      <Button 
                        onClick={() => handleSignContract(contract.id)}
                        disabled={markAsSigned.isPending}
                      >
                        {markAsSigned.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <PenTool className="h-4 w-4 mr-2" />
                        )}
                        Assinar Contrato
                      </Button>
                    )}
                    {(status === 'ASSINADO' || status === 'APROVADO') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline">
                            <Download className="h-4 w-4 mr-2" />
                            Baixar Contrato
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleDownloadPDF(contract)}>
                            <FileText className="h-4 w-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadWord(contract)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Word (.docx)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
