import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ClipboardList,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Send,
  Printer,
} from 'lucide-react';
import { downloadEX17 } from '@/lib/generate-ex17';
import { downloadTaxa790 } from '@/lib/generate-taxa790';

interface HuellasPreparationChecklistProps {
  serviceCase: {
    id: string;
    huellas_date?: string | null;
    huellas_time?: string | null;
    huellas_location?: string | null;
    empadronamiento_valid?: boolean;
    service_type?: string;
    technical_status?: string;
  };
  clientData?: {
    fullName: string;
    nie?: string;
    nationality?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  onSendInstructions?: () => void;
}

const DOCUMENTS_TO_BRING = [
  { id: 'resolution', label: 'Resolução Favorável original (ou visto no passaporte)', required: true },
  { id: 'passport', label: 'Passaporte original válido', required: true },
  { id: 'photo', label: 'Foto 3x4 colorida (fundo branco, recente)', required: true },
  { id: 'empadronamiento', label: 'Certificado de Empadronamento (máx. 90 dias)', required: true },
  { id: 'taxa790', label: 'Comprovante de pagamento Taxa 790/012', required: true },
  { id: 'ex17', label: 'Formulário EX17 impresso e assinado', required: true },
  { id: 'cita', label: 'Comprovante da Cita (confirmação do agendamento)', required: true },
  { id: 'tie_anterior', label: 'TIE anterior (se renovação)', required: false },
];

export function HuellasPreparationChecklist({ 
  serviceCase, 
  clientData,
  onSendInstructions 
}: HuellasPreparationChecklistProps) {
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set());

  const toggleDoc = (docId: string) => {
    const newSet = new Set(checkedDocs);
    if (newSet.has(docId)) {
      newSet.delete(docId);
    } else {
      newSet.add(docId);
    }
    setCheckedDocs(newSet);
  };

  const hasAppointment = !!serviceCase.huellas_date;
  const isEmpadronamentoValid = serviceCase.empadronamiento_valid;
  const requiredDocs = DOCUMENTS_TO_BRING.filter(d => d.required);
  const allRequiredChecked = requiredDocs.every(d => checkedDocs.has(d.id));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          Preparação para Tomada de Huellas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prerequisites Section */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Pré-requisitos
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2">
              {isEmpadronamentoValid ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Empadronamento OK
                </Badge>
              ) : (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Empadronamento Pendente
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasAppointment ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Cita Agendada
                </Badge>
              ) : (
                <Badge variant="outline">
                  Cita Pendente
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Document Generation */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos a Gerar
          </h4>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (clientData) {
                  downloadEX17({
                    fullName: clientData.fullName,
                    nie: clientData.nie,
                    nationality: clientData.nationality,
                    address: clientData.address,
                    phone: clientData.phone,
                    email: clientData.email,
                    requestType: 'INICIAL',
                    serviceType: serviceCase.service_type || 'Residencia Temporal',
                  });
                }
              }}
              disabled={!clientData}
            >
              <Download className="h-4 w-4 mr-2" />
              Gerar EX17
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (clientData) {
                  downloadTaxa790({
                    fullName: clientData.fullName,
                    nie: clientData.nie,
                    address: clientData.address,
                    taxCode: '012',
                    taxAmount: 16.08,
                    concept: 'Expedición de Tarjeta de Identidad de Extranjero (TIE)',
                  });
                }
              }}
              disabled={!clientData}
            >
              <Download className="h-4 w-4 mr-2" />
              Gerar Taxa 790
            </Button>
          </div>
        </div>

        <Separator />

        {/* Documents Checklist */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Documentos que o Cliente Deve Levar
          </h4>
          <div className="space-y-2">
            {DOCUMENTS_TO_BRING.map((doc) => (
              <div key={doc.id} className="flex items-start gap-3">
                <Checkbox
                  id={doc.id}
                  checked={checkedDocs.has(doc.id)}
                  onCheckedChange={() => toggleDoc(doc.id)}
                />
                <Label 
                  htmlFor={doc.id} 
                  className="text-sm cursor-pointer leading-tight"
                >
                  {doc.label}
                  {doc.required && <span className="text-destructive ml-1">*</span>}
                </Label>
              </div>
            ))}
          </div>
          {allRequiredChecked && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Checklist Completo!</AlertTitle>
              <AlertDescription className="text-green-700">
                Todos os documentos obrigatórios foram verificados.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Payment Instructions */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Instruções de Pagamento da Taxa
          </h4>
          <div className="text-sm text-muted-foreground space-y-2 bg-muted/50 p-3 rounded-lg">
            <p className="font-medium text-foreground">Valor: €16,08 (Taxa 790/012)</p>
            <p>Pagar em agência CaixaBank ou terminal automático:</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Inserir cartão</li>
              <li>Selecionar idioma</li>
              <li>Navegar até "Pagos y Impuestos"</li>
              <li>Escolher "Pago con código de barras" ou inserir manualmente</li>
              <li>Confirmar valor (€16,08) e NIE</li>
              <li>Concluir e guardar comprovante carimbado</li>
            </ol>
          </div>
        </div>

        <Separator />

        {/* Day Instructions */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Instruções para o Dia da Cita
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc ml-5">
            <li>Verificar todos os dados pessoais nos formulários antes</li>
            <li>Chegar 15 minutos antes do horário marcado</li>
            <li>Levar caneta</li>
            <li>Após atendimento, tirar foto do resguardo e nos enviar</li>
            <li className="text-yellow-700 font-medium">
              Importante: CB Asesoria não acompanha presencialmente
            </li>
          </ul>
        </div>

        {/* Send Instructions Button */}
        {hasAppointment && onSendInstructions && (
          <Button onClick={onSendInstructions} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            Enviar Instruções ao Cliente via WhatsApp
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
