import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import { 
  useServiceSectors, 
  useCreateServiceSector, 
  useUpdateServiceSector,
  ServiceSector,
  ServiceSectorInsert 
} from '@/hooks/useServiceSectors';

export default function SectorsManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSector, setEditingSector] = useState<ServiceSector | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const { data: sectors, isLoading } = useServiceSectors(showInactive);
  const createSector = useCreateServiceSector();
  const updateSector = useUpdateServiceSector();

  const [formData, setFormData] = useState<ServiceSectorInsert>({
    code: '',
    name: '',
    description: '',
    is_active: true,
    display_order: null,
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      is_active: true,
      display_order: null,
    });
    setEditingSector(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (sector: ServiceSector) => {
    setEditingSector(sector);
    setFormData({
      code: sector.code,
      name: sector.name,
      description: sector.description || '',
      is_active: sector.is_active,
      display_order: sector.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingSector) {
      await updateSector.mutateAsync({ id: editingSector.id, ...formData });
    } else {
      await createSector.mutateAsync(formData);
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const isSubmitting = createSector.isPending || updateSector.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Setores</CardTitle>
          <CardDescription>Gerencie os setores de serviço do sistema</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="show-inactive" 
              checked={showInactive} 
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="text-sm">Mostrar inativos</Label>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Setor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSector ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
                <DialogDescription>
                  {editingSector ? 'Atualize as informações do setor' : 'Preencha os dados do novo setor'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="ESTUDANTE"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Estudante"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição do setor..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_order">Ordem de Exibição</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order ?? ''}
                    onChange={(e) => setFormData({ ...formData, display_order: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Ativo</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingSector ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors?.map((sector) => (
                <TableRow key={sector.id}>
                  <TableCell>{sector.display_order ?? '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{sector.code}</TableCell>
                  <TableCell className="font-medium">{sector.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">
                    {sector.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sector.is_active ? 'default' : 'secondary'}>
                      {sector.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(sector)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sectors?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum setor cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
