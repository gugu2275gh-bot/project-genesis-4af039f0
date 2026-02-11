// Users Management v1.1
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceSectors } from '@/hooks/useServiceSectors';
import { useAllUsersSectors, useUpdateUserSectors } from '@/hooks/useUserSectors';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { 
  Search, 
  UserPlus, 
  Shield, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Pencil,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AppRole } from '@/types/database';

const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  ATENCAO_CLIENTE: 'Atenção ao Cliente',
  JURIDICO: 'Jurídico',
  FINANCEIRO: 'Financeiro',
  TECNICO: 'Técnico',
  CLIENTE: 'Cliente',
};

const ROLE_COLORS: Record<AppRole, string> = {
  ADMIN: 'bg-destructive/10 text-destructive',
  MANAGER: 'bg-primary/10 text-primary',
  ATENCAO_CLIENTE: 'bg-info/10 text-info',
  JURIDICO: 'bg-accent/10 text-accent',
  FINANCEIRO: 'bg-success/10 text-success',
  TECNICO: 'bg-warning/10 text-warning',
  CLIENTE: 'bg-muted text-muted-foreground',
};

interface UserWithRoles {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  roles: AppRole[];
  sectors: { id: string; code: string; name: string }[];
}

export default function UsersManagement() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [newRole, setNewRole] = useState<AppRole | ''>('');
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  
  // Create user dialog state
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({
    email: '',
    full_name: '',
    password: '',
    role: '' as AppRole | '',
    sectorIds: [] as string[],
  });

  // Edit user dialog state
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editUserForm, setEditUserForm] = useState({
    id: '',
    full_name: '',
    phone: '',
    sectorIds: [] as string[],
  });

  const isAdmin = hasRole('ADMIN');

  // Fetch sectors
  const { data: sectors = [] } = useServiceSectors();
  const { data: usersSectors = {} } = useAllUsersSectors();
  const updateUserSectors = useUpdateUserSectors();

  // Fetch users with their roles
  const { data: users, isLoading } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRoles[] = profiles.map(profile => ({
        ...profile,
        roles: userRoles
          .filter(r => r.user_id === profile.id)
          .map(r => r.role as AppRole),
        sectors: [],
      }));

      return usersWithRoles;
    },
  });

  // Merge sectors into users
  const usersWithSectors = users?.map(user => ({
    ...user,
    sectors: usersSectors[user.id] || [],
  })) || [];

  // Add role mutation
  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Papel adicionado com sucesso' });
      setIsAddRoleOpen(false);
      setNewRole('');
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao adicionar papel', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Remove role mutation
  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Papel removido com sucesso' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao remover papel', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao atualizar status', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-sectors'] });
      toast({ title: 'Usuário excluído com sucesso' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir usuário',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { id: string; full_name: string; phone: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name, phone: data.phone || null })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao atualizar perfil', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; full_name: string; role?: AppRole; sector_ids?: string[] }) => {
      const { data: result, error } = await supabase.functions.invoke('admin-create-user', {
        body: data,
      });
      
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-sectors'] });
      toast({ title: 'Usuário criado com sucesso' });
      setIsCreateUserOpen(false);
      setCreateUserForm({ email: '', full_name: '', password: '', role: '', sectorIds: [] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao criar usuário', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleCreateUser = () => {
    if (!createUserForm.email || !createUserForm.password || !createUserForm.full_name) {
      toast({ 
        title: 'Preencha todos os campos obrigatórios',
        variant: 'destructive' 
      });
      return;
    }
    if (createUserForm.password.length < 6) {
      toast({ 
        title: 'A senha deve ter pelo menos 6 caracteres',
        variant: 'destructive' 
      });
      return;
    }
    createUserMutation.mutate({
      email: createUserForm.email,
      password: createUserForm.password,
      full_name: createUserForm.full_name,
      role: createUserForm.role || undefined,
      sector_ids: createUserForm.sectorIds.length > 0 ? createUserForm.sectorIds : undefined,
    });
  };

  const handleEditUser = async () => {
    if (!editUserForm.full_name) {
      toast({ 
        title: 'Nome completo é obrigatório',
        variant: 'destructive' 
      });
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        id: editUserForm.id,
        full_name: editUserForm.full_name,
        phone: editUserForm.phone,
      });

      await updateUserSectors.mutateAsync({
        userId: editUserForm.id,
        sectorIds: editUserForm.sectorIds,
      });

      setIsEditUserOpen(false);
      toast({ title: 'Usuário atualizado com sucesso' });
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const openEditDialog = (user: UserWithRoles) => {
    setEditUserForm({
      id: user.id,
      full_name: user.full_name,
      phone: user.phone || '',
      sectorIds: user.sectors.map(s => s.id),
    });
    setIsEditUserOpen(true);
  };

  const toggleSectorInCreate = (sectorId: string) => {
    setCreateUserForm(prev => ({
      ...prev,
      sectorIds: prev.sectorIds.includes(sectorId)
        ? prev.sectorIds.filter(id => id !== sectorId)
        : [...prev.sectorIds, sectorId],
    }));
  };

  const toggleSectorInEdit = (sectorId: string) => {
    setEditUserForm(prev => ({
      ...prev,
      sectorIds: prev.sectorIds.includes(sectorId)
        ? prev.sectorIds.filter(id => id !== sectorId)
        : [...prev.sectorIds, sectorId],
    }));
  };

  const filteredUsers = usersWithSectors.filter(user =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const usersWithoutRoles = usersWithSectors.filter(user => user.roles.length === 0);

  const availableRoles = Object.keys(ROLE_LABELS) as AppRole[];

  // Quick role assignment for test users
  const quickAssignRole = (userId: string, role: AppRole) => {
    addRoleMutation.mutate({ userId, role });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Assignment for Users Without Roles */}
      {isAdmin && usersWithoutRoles.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <UserPlus className="h-5 w-5" />
              Usuários Sem Papéis ({usersWithoutRoles.length})
            </CardTitle>
            <CardDescription>
              Atribua papéis rapidamente aos novos usuários de teste
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {usersWithoutRoles.map((user) => (
                <div 
                  key={user.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-background border"
                >
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableRoles.map((role) => (
                      <Button
                        key={role}
                        variant="outline"
                        size="sm"
                        onClick={() => quickAssignRole(user.id, role)}
                        disabled={addRoleMutation.isPending}
                        className={`${ROLE_COLORS[role]} border hover:opacity-80`}
                      >
                        {ROLE_LABELS[role]}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Users Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Gestão de Usuários
              </CardTitle>
              <CardDescription>
                Gerencie usuários e seus papéis no sistema
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {isAdmin && (
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Criar Usuário
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-background max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Criar Novo Usuário</DialogTitle>
                      <DialogDescription>
                        Crie um novo usuário no sistema
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@exemplo.com"
                          value={createUserForm.email}
                          onChange={(e) => setCreateUserForm(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Nome completo *</Label>
                        <Input
                          id="full_name"
                          placeholder="Nome do usuário"
                          value={createUserForm.full_name}
                          onChange={(e) => setCreateUserForm(prev => ({ ...prev, full_name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Senha *</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={createUserForm.password}
                          onChange={(e) => setCreateUserForm(prev => ({ ...prev, password: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Papel inicial (opcional)</Label>
                        <Select
                          value={createUserForm.role}
                          onValueChange={(value) => setCreateUserForm(prev => ({ ...prev, role: value as AppRole }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um papel" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            {availableRoles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Setores (opcional)</Label>
                        <div className="space-y-2 border rounded-md p-3">
                          {sectors.filter(s => s.is_active).map((sector) => (
                            <div key={sector.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`create-sector-${sector.id}`}
                                checked={createUserForm.sectorIds.includes(sector.id)}
                                onCheckedChange={() => toggleSectorInCreate(sector.id)}
                              />
                              <label
                                htmlFor={`create-sector-${sector.id}`}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {sector.name}
                              </label>
                            </div>
                          ))}
                          {sectors.filter(s => s.is_active).length === 0 && (
                            <p className="text-sm text-muted-foreground">Nenhum setor disponível</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateUserOpen(false)}>
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleCreateUser}
                        disabled={createUserMutation.isPending}
                      >
                        {createUserMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Criar Usuário
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuários..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Papéis</TableHead>
                  <TableHead>Setores</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Sem papéis</span>
                          ) : (
                            user.roles.map((role) => (
                              <Badge
                                key={role}
                                variant="outline"
                                className={`${ROLE_COLORS[role]} border-0 gap-1`}
                              >
                                {ROLE_LABELS[role]}
                                {isAdmin && (
                                  <button
                                    onClick={() => removeRoleMutation.mutate({ userId: user.id, role })}
                                    className="ml-1 hover:text-destructive"
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </button>
                                )}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.sectors.length === 0 ? (
                            <span className="text-sm text-muted-foreground">-</span>
                          ) : (
                            user.sectors.map((sector) => (
                              <Badge
                                key={sector.id}
                                variant="secondary"
                                className="text-xs"
                              >
                                {sector.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={user.is_active 
                            ? 'bg-success/10 text-success border-0' 
                            : 'bg-muted text-muted-foreground border-0'
                          }
                        >
                          {user.is_active ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(user)}
                              title="Editar usuário"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            
                            <Dialog 
                              open={isAddRoleOpen && selectedUser?.id === user.id}
                              onOpenChange={(open) => {
                                setIsAddRoleOpen(open);
                                if (open) setSelectedUser(user);
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" title="Adicionar papel">
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-background">
                                <DialogHeader>
                                  <DialogTitle>Adicionar Papel</DialogTitle>
                                  <DialogDescription>
                                    Adicionar novo papel para {user.full_name}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  <Select
                                    value={newRole}
                                    onValueChange={(value) => setNewRole(value as AppRole)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecione um papel" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover">
                                      {availableRoles
                                        .filter(role => !user.roles.includes(role))
                                        .map((role) => (
                                          <SelectItem key={role} value={role}>
                                            {ROLE_LABELS[role]}
                                          </SelectItem>
                                        ))
                                      }
                                    </SelectContent>
                                  </Select>
                                </div>
                                <DialogFooter>
                                  <Button
                                    variant="outline"
                                    onClick={() => setIsAddRoleOpen(false)}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      if (newRole) {
                                        addRoleMutation.mutate({ userId: user.id, role: newRole });
                                      }
                                    }}
                                    disabled={!newRole || addRoleMutation.isPending}
                                  >
                                    Adicionar
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActiveMutation.mutate({ 
                                userId: user.id, 
                                isActive: !user.is_active 
                              })}
                              title={user.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                            >
                              {user.is_active ? (
                                <XCircle className="h-4 w-4 text-destructive" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              )}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title="Excluir usuário"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir <strong>{user.full_name}</strong> ({user.email})?
                                    Esta ação é irreversível e removerá todos os dados do usuário.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deleteUserMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4 mr-2" />
                                    )}
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Edite as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={usersWithSectors.find(u => u.id === editUserForm.id)?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">O email não pode ser alterado</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Nome completo *</Label>
              <Input
                id="edit_full_name"
                placeholder="Nome do usuário"
                value={editUserForm.full_name}
                onChange={(e) => setEditUserForm(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Telefone</Label>
              <Input
                id="edit_phone"
                placeholder="+351 912 345 678"
                value={editUserForm.phone}
                onChange={(e) => setEditUserForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Setores</Label>
              <div className="space-y-2 border rounded-md p-3">
                {sectors.filter(s => s.is_active).map((sector) => (
                  <div key={sector.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-sector-${sector.id}`}
                      checked={editUserForm.sectorIds.includes(sector.id)}
                      onCheckedChange={() => toggleSectorInEdit(sector.id)}
                    />
                    <label
                      htmlFor={`edit-sector-${sector.id}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {sector.name}
                    </label>
                  </div>
                ))}
                {sectors.filter(s => s.is_active).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum setor disponível</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleEditUser}
              disabled={updateProfileMutation.isPending || updateUserSectors.isPending}
            >
              {(updateProfileMutation.isPending || updateUserSectors.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
