import { useState } from 'react';
import { useContractCosts } from '@/hooks/useContractCosts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContractCostsSectionProps {
  contractId: string;
  canEdit: boolean;
  currency?: string;
}

export function ContractCostsSection({ contractId, canEdit, currency = 'EUR' }: ContractCostsSectionProps) {
  const { costs, isLoading, addCost, deleteCost, totalCosts } = useContractCosts(contractId);
  const [isAdding, setIsAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);

  const handleAdd = async () => {
    if (!description.trim() || !amount) return;
    await addCost.mutateAsync({ description: description.trim(), amount: parseFloat(amount) });
    setDescription('');
    setAmount('');
    setIsAdding(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setDescription('');
    setAmount('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Custos do Caso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Custos do Caso
        </CardTitle>
        {canEdit && !isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar Custo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label>Descrição *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Taxa de tradução juramentada, Taxa 790, etc."
                />
              </div>
              <div>
                <Label>Valor ({currency}) *</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="150.00"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button 
                size="sm" 
                onClick={handleAdd} 
                disabled={!description.trim() || !amount || addCost.isPending}
              >
                {addCost.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}

        {costs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Data</TableHead>
                {canEdit && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costs.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell>{cost.description}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(cost.amount))}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {format(new Date(cost.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteCost.mutate(cost.id)}
                        disabled={deleteCost.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell>Total de Custos</TableCell>
                <TableCell className="text-right text-primary">
                  {formatCurrency(totalCosts)}
                </TableCell>
                <TableCell></TableCell>
                {canEdit && <TableCell></TableCell>}
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          !isAdding && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum custo registrado para este caso.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
