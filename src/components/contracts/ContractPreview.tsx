import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, Edit, X, FileText, ChevronDown } from 'lucide-react';
import { getContractSections, generateContractDocument, generateContractWord, type ContractData, type ContractSection, type BeneficiaryData, type BankAccountData, type PaymentData } from '@/lib/generate-contract';

interface ContractPreviewProps {
  template: string;
  clientName: string;
  documentType?: string;
  documentNumber: string;
  contractNumber: string;
  canDownload?: boolean;
  contractStatus?: string;
  // Financial fields
  serviceDescription?: string;
  feeAmount?: number;
  vatRate?: number;
  totalAmount?: number;
  paymentConditions?: string;
  paymentMethod?: string;
  bankAccount?: BankAccountData;
  beneficiaries?: BeneficiaryData[];
  // Contact fields
  phone?: string;
  email?: string;
  address?: string;
  currency?: string;
  date?: Date;
  payments?: PaymentData[];
}

export function ContractPreview({ 
  template, clientName, documentType, documentNumber, contractNumber, canDownload = false,
  contractStatus,
  serviceDescription, feeAmount, vatRate, totalAmount, paymentConditions, paymentMethod,
  bankAccount, beneficiaries, phone, email, address, currency, date, payments,
}: ContractPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(clientName);
  const [editedDocument, setEditedDocument] = useState(documentNumber);
  const [editedContractNumber, setEditedContractNumber] = useState(contractNumber);

  const currentData: ContractData = {
    template,
    clientName: isEditing ? editedName : clientName,
    documentType,
    documentNumber: isEditing ? editedDocument : documentNumber,
    contractNumber: isEditing ? editedContractNumber : contractNumber,
    date,
    serviceDescription,
    feeAmount,
    vatRate,
    totalAmount,
    paymentConditions,
    paymentMethod,
    bankAccount,
    beneficiaries,
    phone,
    email,
    address,
    currency,
    payments,
  };

  const sections = getContractSections(currentData);

  const handleDownloadPDF = async () => {
    await generateContractDocument(currentData);
  };

  const handleDownloadWord = async () => {
    await generateContractWord(currentData);
  };

  const handleStartEditing = () => {
    setEditedName(clientName);
    setEditedDocument(documentNumber);
    setEditedContractNumber(contractNumber);
    setIsEditing(true);
  };

  const renderSection = (section: ContractSection, index: number) => {
    switch (section.type) {
      case 'heading':
        return (
          <h3 key={index} className="text-base font-bold mt-6 mb-2 text-foreground">
            {section.text}
          </h3>
        );
      case 'paragraph':
        return (
          <p
            key={index}
            className={`text-sm mb-2 text-foreground/90 text-justify ${section.bold ? 'font-semibold' : ''} ${section.italic ? 'italic' : ''}`}
          >
            {section.text}
          </p>
        );
      case 'bullet':
        return (
          <li key={index} className="text-sm mb-1 ml-6 list-disc text-foreground/90">
            {section.text}
          </li>
        );
      case 'numbered':
        return (
          <p key={index} className="text-sm mb-1 ml-4 text-foreground/90">
            {section.text}
          </p>
        );
      case 'empty':
        return <div key={index} className="h-3" />;
      case 'signature':
        return (
          <p key={index} className="text-sm font-bold mt-2 text-foreground">
            {section.text}
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Pré-visualização do Contrato</CardTitle>
        <div className="flex gap-2">
          {contractStatus !== 'ASSINADO' && (
            <>
              {isEditing ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar Edição
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleStartEditing}>
                  <Edit className="h-4 w-4 mr-1" />
                  Editar Pré-visualização
                </Button>
              )}
            </>
          )}
          {canDownload && contractStatus === 'ASSINADO' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Baixar Contrato
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleDownloadPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadWord}>
                  <FileText className="h-4 w-4 mr-2" />
                  Word (.docx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canDownload && contractStatus === 'APROVADO' && (
            <Button size="sm" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-1" />
              Baixar PDF
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing && (
          <div className="mb-6 p-4 border border-border rounded-lg bg-muted/50 space-y-3">
            <p className="text-sm font-medium text-foreground">Campos editáveis:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Nome do Cliente</label>
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nº Documento</label>
                <Input
                  value={editedDocument}
                  onChange={(e) => setEditedDocument(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nº Contrato</label>
                <Input
                  value={editedContractNumber}
                  onChange={(e) => setEditedContractNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        )}

        <div className="border border-border rounded-lg p-8 bg-background max-h-[70vh] overflow-y-auto">
          <div className="max-w-[700px] mx-auto">
            {sections.map((section, i) => renderSection(section, i))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
