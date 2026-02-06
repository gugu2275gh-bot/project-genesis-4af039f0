import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type Task = Tables<'tasks'>;
export type TaskInsert = TablesInsert<'tasks'>;
export type TaskUpdate = TablesUpdate<'tasks'>;

export type TaskWithAssignee = Task & {
  assigned_profile?: Tables<'profiles'> | null;
};

export type TaskWithClient = Task & {
  related_lead?: {
    contact?: { full_name: string } | null;
  } | null;
  related_opportunity?: {
    lead?: {
      contact?: { full_name: string } | null;
    } | null;
  } | null;
  related_service_case?: {
    opportunity?: {
      lead?: {
        contact?: { full_name: string } | null;
      } | null;
    } | null;
  } | null;
};

export function getClientName(task: TaskWithClient): string | null {
  return task.related_lead?.contact?.full_name
    || task.related_opportunity?.lead?.contact?.full_name
    || task.related_service_case?.opportunity?.lead?.contact?.full_name
    || null;
}

export function useTasks() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          related_lead:leads(contact:contacts(full_name)),
          related_opportunity:opportunities(lead:leads(contact:contacts(full_name))),
          related_service_case:service_cases(opportunity:opportunities(lead:leads(contact:contacts(full_name))))
        `)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TaskWithClient[];
    },
  });

  const myTasksQuery = useQuery({
    queryKey: ['my-tasks', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          related_lead:leads(contact:contacts(full_name)),
          related_opportunity:opportunities(lead:leads(contact:contacts(full_name))),
          related_service_case:service_cases(opportunity:opportunities(lead:leads(contact:contacts(full_name))))
        `)
        .eq('assigned_to_user_id', user.id)
        .neq('status', 'CONCLUIDA')
        .neq('status', 'CANCELADA')
        .order('due_date', { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data as TaskWithClient[];
    },
    enabled: !!user?.id,
  });

  const createTask = useMutation({
    mutationFn: async (task: TaskInsert) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...task,
          created_by_user_id: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast({ title: 'Tarefa criada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar tarefa', description: error.message, variant: 'destructive' });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: TaskUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast({ title: 'Tarefa atualizada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar tarefa', description: error.message, variant: 'destructive' });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({ status: 'CONCLUIDA' })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast({ title: 'Tarefa concluída' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao concluir tarefa', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast({ title: 'Tarefa removida' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover tarefa', description: error.message, variant: 'destructive' });
    },
  });

  return {
    tasks: tasksQuery.data ?? [],
    myTasks: myTasksQuery.data ?? [],
    isLoading: tasksQuery.isLoading,
    error: tasksQuery.error,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
  };
}
