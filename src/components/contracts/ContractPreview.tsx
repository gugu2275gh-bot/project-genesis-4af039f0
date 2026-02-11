import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Edit, X } from 'lucide-react';
import { getContractSections, generateContractDocument, type ContractData, type ContractSection } from '@/lib/generate-contract';

interface ContractPreviewProps {
  template: string;
  clientName: string;
  documentNumber: string;
  contractNumber: string;
}

export function ContractPreview({ template, clientName, documentNumber, contractNumber }: ContractPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(clientName);
  const [editedDocument, setEditedDocument] = useState(documentNumber);
  const [editedContractNumber, setEditedContractNumber] = useState(contractNumber);

  const currentData: ContractData = {
    template,
    clientName: isEditing ? editedName : clientName,
    documentNumber: isEditing ? editedDocument : documentNumber,
    contractNumber: isEditing ? editedContractNumber : contractNumber,
  };

  const sections = getContractSections(currentData);

  const handleDownload = async () => {
    await generateContractDocument(currentData);
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
          <Button size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1" />
            Baixar Contrato Word
          </Button>
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
