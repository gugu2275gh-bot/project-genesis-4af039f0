import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import { 
  useServiceTypes, 
  useCreateServiceType, 
  useUpdateServiceType,
  ServiceTypeWithSector,
  ServiceTypeInsert 
} from '@/hooks/useServiceTypes';
import { useServiceSectors } from '@/hooks/useServiceSectors';

export default function ServiceTypesManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ServiceTypeWithSector | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const { data: serviceTypes, isLoading } = useServiceTypes(showInactive);
  const { data: sectors } = useServiceSectors();
  const createType = useCreateServiceType();
  const updateType = useUpdateServiceType();

  const [formData, setFormData] = useState<ServiceTypeInsert>({
    code: '',
    name: '',
    description: '',
    sector_id: null,
    is_active: true,
    display_order: null,
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      sector_id: null,
      is_active: true,
      display_order: null,
    });
    setEditingType(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (type: ServiceTypeWithSector) => {
    setEditingType(type);
    setFormData({
      code: type.code,
      name: type.name,
      description: type.description || '',
      sector_id: type.sector_id,
      is_active: type.is_active,
      display_order: type.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingType) {
      await updateType.mutateAsync({ id: editingType.id, ...formData });
    } else {
      await createType.mutateAsync(formData);
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const isSubmitting = createType.isPending || updateType.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tipos de Serviço</CardTitle>
          <CardDescription>Gerencie os tipos de serviço oferecidos</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="show-inactive-types" 
              checked={showInactive} 
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-types" className="text-sm">Mostrar inativos</Label>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Tipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingType ? 'Editar Tipo de Serviço' : 'Novo Tipo de Serviço'}</DialogTitle>
                <DialogDescription>
                  {editingType ? 'Atualize as informações do tipo de serviço' : 'Preencha os dados do novo tipo de serviço'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                    placeholder="VISTO_ESTUDANTE"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Visto de Estudante"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sector">Setor</Label>
                  <Select
                    value={formData.sector_id || ''}
                    onValueChange={(value) => setFormData({ ...formData, sector_id: value || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors?.map((sector) => (
                        <SelectItem key={sector.id} value={sector.id}>
                          {sector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição do tipo de serviço..."
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
                    {editingType ? 'Salvar' : 'Criar'}
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
                <TableHead>Setor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceTypes?.map((type) => (
                <TableRow key={type.id}>
                  <TableCell>{type.display_order ?? '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{type.code}</TableCell>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell>
                    {type.service_sectors ? (
                      <Badge variant="outline">{type.service_sectors.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={type.is_active ? 'default' : 'secondary'}>
                      {type.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {serviceTypes?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum tipo de serviço cadastrado
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
