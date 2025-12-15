import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useProfiles } from '@/hooks/useProfiles';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Check, Calendar, User } from 'lucide-react';
import { TASK_STATUS_LABELS } from '@/types/database';
import { StatusBadge } from '@/components/ui/status-badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TasksList() {
  const { tasks, myTasks, isLoading, createTask, completeTask, updateTask } = useTasks();
  const { data: profiles } = useProfiles();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('mine');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    due_date: '',
    assigned_to_user_id: '',
  });

  const displayTasks = activeTab === 'mine' ? myTasks : tasks;

  const filteredTasks = displayTasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreate = async () => {
    if (!newTask.title) return;
    await createTask.mutateAsync({
      title: newTask.title,
      description: newTask.description || null,
      due_date: newTask.due_date || null,
      assigned_to_user_id: newTask.assigned_to_user_id || user?.id || null,
      status: 'PENDENTE',
    });
    setIsDialogOpen(false);
    setNewTask({ title: '', description: '', due_date: '', assigned_to_user_id: '' });
  };

  const handleComplete = async (id: string) => {
    await completeTask.mutateAsync(id);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateTask.mutateAsync({ id, status: status as any });
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const columns: Column<typeof tasks[0]>[] = [
    {
      key: 'title',
      header: 'Tarefa',
      cell: (task) => (
        <div>
          <div className="font-medium">{task.title}</div>
          {task.description && (
            <div className="text-sm text-muted-foreground line-clamp-1">{task.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (task) => (
        <Select 
          value={task.status || 'PENDENTE'} 
          onValueChange={(v) => handleStatusChange(task.id, v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'due_date',
      header: 'Prazo',
      cell: (task) => task.due_date ? (
        <div className={`flex items-center gap-2 ${isOverdue(task.due_date) && task.status !== 'CONCLUIDA' ? 'text-destructive' : ''}`}>
          <Calendar className="h-4 w-4" />
          {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: ptBR })}
        </div>
      ) : '-',
    },
    {
      key: 'actions',
      header: '',
      cell: (task) => task.status !== 'CONCLUIDA' && task.status !== 'CANCELADA' && (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleComplete(task.id);
          }}
        >
          <Check className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Gerenciar tarefas e atividades pendentes"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Tarefa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Tarefa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="Descreva a tarefa"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="Detalhes adicionais..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prazo</Label>
                    <Input
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Responsável</Label>
                    <Select 
                      value={newTask.assigned_to_user_id} 
                      onValueChange={(v) => setNewTask({ ...newTask, assigned_to_user_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles?.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {profile.full_name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreate} disabled={!newTask.title || createTask.isPending}>
                    {createTask.isPending ? 'Criando...' : 'Criar Tarefa'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="mine">Minhas Tarefas</TabsTrigger>
          <TabsTrigger value="all">Todas as Tarefas</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredTasks}
        loading={isLoading}
        emptyMessage="Nenhuma tarefa encontrada"
      />
    </div>
  );
}
