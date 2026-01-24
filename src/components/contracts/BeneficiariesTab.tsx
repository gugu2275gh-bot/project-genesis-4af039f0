import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, Column } from '@/components/ui/data-table';
import { Plus, Users, Trash2, Crown } from 'lucide-react';
import { useBeneficiaries, Beneficiary, BeneficiaryInsert } from '@/hooks/useBeneficiaries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BeneficiariesTabProps {
  contractId: string;
  clientName?: string;
}

const RELATIONSHIP_OPTIONS = [
  { value: 'TITULAR', label: 'Titular' },
  { value: 'CONJUGE', label: 'Cônjuge' },
  { value: 'FILHO', label: 'Filho(a)' },
  { value: 'DEPENDENTE', label: 'Dependente' },
  { value: 'OUTRO', label: 'Outro' },
];

export function BeneficiariesTab({ contractId, clientName }: BeneficiariesTabProps) {
  const { 
    beneficiaries, 
    isLoading, 
    createBeneficiary, 
    deleteBeneficiary,
    primaryBeneficiary,
    dependents,
  } = useBeneficiaries(contractId);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<BeneficiaryInsert>({
    contract_id: contractId,
    full_name: '',
    document_type: '',
    document_number: '',
    relationship: '',
    nationality: '',
    birth_date: '',
    is_primary: false,
  });

  const handleSubmit = () => {
    createBeneficiary.mutate(formData, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setFormData({
          contract_id: contractId,
          full_name: '',
          document_type: '',
          document_number: '',
          relationship: '',
          nationality: '',
          birth_date: '',
          is_primary: false,
        });
      },
    });
  };

  const columns: Column<Beneficiary>[] = [
    {
      key: 'full_name',
      header: 'Nome',
      cell: (item) => (
        <div className="flex items-center gap-2">
          {item.is_primary && <Crown className="h-4 w-4 text-amber-500" />}
          <span className="font-medium">{item.full_name}</span>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Relação',
      cell: (item) => {
        const rel = RELATIONSHIP_OPTIONS.find(r => r.value === item.relationship);
        return (
          <Badge variant={item.is_primary ? 'default' : 'outline'}>
            {rel?.label || item.relationship || '-'}
          </Badge>
        );
      },
    },
    {
      key: 'document',
      header: 'Documento',
      cell: (item) => (
        <div>
          <p className="text-sm">{item.document_type || '-'}</p>
          <p className="text-xs text-muted-foreground">{item.document_number || '-'}</p>
        </div>
      ),
    },
    {
      key: 'nationality',
      header: 'Nacionalidade',
      cell: (item) => item.nationality || '-',
    },
    {
      key: 'birth_date',
      header: 'Data Nasc.',
      cell: (item) => item.birth_date 
        ? format(new Date(item.birth_date), 'dd/MM/yyyy', { locale: ptBR })
        : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (item) => !item.is_primary && (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            deleteBeneficiary.mutate(item.id);
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Beneficiários do Contrato</h3>
          <Badge variant="secondary">{beneficiaries.length}</Badge>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Beneficiário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Beneficiário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label>Relação com Titular *</Label>
                <Select 
                  value={formData.relationship} 
                  onValueChange={(v) => setFormData({ ...formData, relationship: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.filter(r => r.value !== 'TITULAR' || !primaryBeneficiary).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select 
                    value={formData.document_type || ''} 
                    onValueChange={(v) => setFormData({ ...formData, document_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PASSAPORTE">Passaporte</SelectItem>
                      <SelectItem value="NIE">NIE</SelectItem>
                      <SelectItem value="DNI">DNI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Número do Documento</Label>
                  <Input
                    value={formData.document_number || ''}
                    onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nacionalidade</Label>
                  <Input
                    value={formData.nationality || ''}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                    placeholder="Ex: Brasileira"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <Input
                    type="date"
                    value={formData.birth_date || ''}
                    onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                  />
                </div>
              </div>

              {!primaryBeneficiary && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_primary"
                    checked={formData.is_primary}
                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="is_primary">Este é o titular principal</Label>
                </div>
              )}

              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createBeneficiary.isPending || !formData.full_name || !formData.relationship}
              >
                {createBeneficiary.isPending ? 'Salvando...' : 'Adicionar Beneficiário'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Resumo */}
      {primaryBeneficiary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-amber-500" />
              <div>
                <p className="font-semibold">{primaryBeneficiary.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  Titular + {dependents.length} dependente{dependents.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <DataTable 
        columns={columns} 
        data={beneficiaries} 
        loading={isLoading}
        emptyMessage="Nenhum beneficiário cadastrado" 
      />
    </div>
  );
}
