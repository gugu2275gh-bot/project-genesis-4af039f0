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
import { Plus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  useUserProfileDefinitions, 
  useCreateUserProfileDefinition, 
  useUpdateUserProfileDefinition,
  UserProfileDefinition,
  UserProfileDefinitionInsert 
} from '@/hooks/useUserProfileDefinitions';

export default function UserProfilesManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfileDefinition | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  const { data: profiles, isLoading } = useUserProfileDefinitions(showInactive);
  const createProfile = useCreateUserProfileDefinition();
  const updateProfile = useUpdateUserProfileDefinition();

  const [formData, setFormData] = useState<UserProfileDefinitionInsert>({
    role_code: '',
    display_name: '',
    detailed_description: '',
    is_active: true,
    display_order: null,
  });

  const resetForm = () => {
    setFormData({
      role_code: '',
      display_name: '',
      detailed_description: '',
      is_active: true,
      display_order: null,
    });
    setEditingProfile(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (profile: UserProfileDefinition) => {
    setEditingProfile(profile);
    setFormData({
      role_code: profile.role_code,
      display_name: profile.display_name,
      detailed_description: profile.detailed_description || '',
      is_active: profile.is_active,
      display_order: profile.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingProfile) {
      await updateProfile.mutateAsync({ id: editingProfile.id, ...formData });
    } else {
      await createProfile.mutateAsync(formData);
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const isSubmitting = createProfile.isPending || updateProfile.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Perfis de Usuário</CardTitle>
          <CardDescription>Gerencie as definições e descrições dos perfis do sistema</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="show-inactive-profiles" 
              checked={showInactive} 
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-profiles" className="text-sm">Mostrar inativos</Label>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Perfil
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProfile ? 'Editar Perfil' : 'Novo Perfil'}</DialogTitle>
                <DialogDescription>
                  {editingProfile ? 'Atualize as informações do perfil' : 'Preencha os dados do novo perfil'}
                </DialogDescription>
              </DialogHeader>
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O código do perfil deve corresponder a um papel válido no sistema (ADMIN, MANAGER, etc.) 
                  para que a atribuição de papéis funcione corretamente.
                </AlertDescription>
              </Alert>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role_code">Código do Perfil</Label>
                  <Input
                    id="role_code"
                    value={formData.role_code}
                    onChange={(e) => setFormData({ ...formData, role_code: e.target.value.toUpperCase().replace(/\s/g, '_') })}
                    placeholder="ADMIN"
                    required
                    disabled={!!editingProfile}
                  />
                  {editingProfile && (
                    <p className="text-xs text-muted-foreground">O código não pode ser alterado após a criação</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_name">Nome de Exibição</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="Administrador do Sistema"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detailed_description">Descrição Detalhada</Label>
                  <Textarea
                    id="detailed_description"
                    value={formData.detailed_description || ''}
                    onChange={(e) => setFormData({ ...formData, detailed_description: e.target.value })}
                    placeholder="Descreva as responsabilidades e permissões deste perfil..."
                    rows={4}
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
                    {editingProfile ? 'Salvar' : 'Criar'}
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
                <TableHead>Nome de Exibição</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>{profile.display_order ?? '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{profile.role_code}</TableCell>
                  <TableCell className="font-medium">{profile.display_name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px] truncate">
                    {profile.detailed_description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.is_active ? 'default' : 'secondary'}>
                      {profile.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(profile)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {profiles?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum perfil cadastrado
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
