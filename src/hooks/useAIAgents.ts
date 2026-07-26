import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  AIAgent,
  AgentFlow,
  AgentFlowStep,
  AgentTestMessage,
  AgentTestSession,
  AgentVersion,
} from '@/types/ai-agents';

const db = supabase as any;

/* ------------------------------- AGENTES ------------------------------- */

export function useAIAgents() {
  return useQuery({
    queryKey: ['ai_agents'],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AIAgent[];
    },
  });
}

async function snapshotVersion(agent: AIAgent, notes?: string) {
  const { data: userData } = await supabase.auth.getUser();
  const { config, ...rest } = agent as any;
  await db.from('ai_agent_versions').insert({
    agent_id: agent.id,
    version_number: agent.current_version,
    config: rest,
    status: 'ATIVA',
    notes: notes || null,
    created_by: userData?.user?.id ?? null,
  });
}

export function useSaveAgent() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: Partial<AIAgent> & { id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (payload.id) {
        const { data: current, error: curErr } = await db
          .from('ai_agents')
          .select('*')
          .eq('id', payload.id)
          .single();
        if (curErr) throw curErr;

        const nextVersion = (current.current_version || 1) + 1;
        const { data, error } = await db
          .from('ai_agents')
          .update({ ...payload, current_version: nextVersion, updated_by: userId })
          .eq('id', payload.id)
          .select('*')
          .single();
        if (error) throw error;
        await snapshotVersion(data as AIAgent, 'Atualização da configuração');
        return data as AIAgent;
      }

      const { data, error } = await db
        .from('ai_agents')
        .insert({ ...payload, created_by: userId, updated_by: userId })
        .select('*')
        .single();
      if (error) throw error;
      await snapshotVersion(data as AIAgent, 'Versão inicial');
      return data as AIAgent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_agents'] });
      qc.invalidateQueries({ queryKey: ['ai_agent_versions'] });
      toast({ title: 'Agente salvo com sucesso' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar agente', description: e.message, variant: 'destructive' }),
  });
}

export function useToggleAgentStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AIAgent['status'] }) => {
      const { error } = await db.from('ai_agents').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_agents'] });
      toast({ title: 'Status atualizado' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao atualizar status', description: e.message, variant: 'destructive' }),
  });
}

export function useDuplicateAgent() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (agent: AIAgent) => {
      const { data: userData } = await supabase.auth.getUser();
      const {
        id, created_at, updated_at, created_by, updated_by, current_version, ...rest
      } = agent as any;
      // O fluxo NÃO é duplicado: o novo agente aponta para o mesmo flow_id.
      const { data, error } = await db
        .from('ai_agents')
        .insert({
          ...rest,
          name: `${agent.name} (cópia)`,
          status: 'RASCUNHO',
          current_version: 1,
          created_by: userData?.user?.id ?? null,
          updated_by: userData?.user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      await snapshotVersion(data as AIAgent, 'Duplicado de outro agente');
      return data as AIAgent;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_agents'] });
      toast({ title: 'Agente duplicado' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao duplicar', description: e.message, variant: 'destructive' }),
  });
}

export function useAgentVersions(agentId?: string) {
  return useQuery({
    queryKey: ['ai_agent_versions', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_versions')
        .select('*')
        .eq('agent_id', agentId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return (data || []) as AgentVersion[];
    },
  });
}

/* -------------------------------- FLUXOS -------------------------------- */

export function useAgentFlows() {
  return useQuery({
    queryKey: ['ai_agent_flows'],
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_flows')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as AgentFlow[];
    },
  });
}

export function useSaveFlow() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: Partial<AgentFlow> & { id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      if (payload.id) {
        const { error } = await db
          .from('ai_agent_flows')
          .update({ ...payload, updated_by: userId })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('ai_agent_flows')
          .insert({ ...payload, created_by: userId, updated_by: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_agent_flows'] });
      toast({ title: 'Fluxo salvo' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar fluxo', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteFlow() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('ai_agent_flows').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_agent_flows'] });
      toast({ title: 'Fluxo excluído' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao excluir fluxo', description: e.message, variant: 'destructive' }),
  });
}

export function useFlowSteps(flowId?: string) {
  return useQuery({
    queryKey: ['ai_agent_flow_steps', flowId],
    enabled: !!flowId,
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_flow_steps')
        .select('*')
        .eq('flow_id', flowId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []) as AgentFlowStep[];
    },
  });
}

export function useSaveFlowStep() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: Partial<AgentFlowStep> & { id?: string; flow_id: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      if (payload.id) {
        const { error } = await db
          .from('ai_agent_flow_steps')
          .update({ ...payload, updated_by: userId })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from('ai_agent_flow_steps')
          .insert({ ...payload, created_by: userId, updated_by: userId });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_flow_steps', vars.flow_id] });
      toast({ title: 'Etapa salva' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar etapa', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteFlowStep() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id }: { id: string; flow_id: string }) => {
      const { error } = await db.from('ai_agent_flow_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_flow_steps', vars.flow_id] });
      toast({ title: 'Etapa excluída' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao excluir etapa', description: e.message, variant: 'destructive' }),
  });
}

/* ------------------------------- SANDBOX -------------------------------- */

export function useTestMessages(sessionId?: string) {
  return useQuery({
    queryKey: ['ai_agent_test_messages', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_test_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as AgentTestMessage[];
    },
  });
}

export function useCreateTestSession() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ agentId, versionId }: { agentId: string; versionId?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await db
        .from('ai_agent_test_sessions')
        .insert({
          agent_id: agentId,
          agent_version_id: versionId || null,
          title: `Teste ${new Date().toLocaleString('pt-BR')}`,
          created_by: userData?.user?.id ?? null,
          updated_by: userData?.user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as AgentTestSession;
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao iniciar teste', description: e.message, variant: 'destructive' }),
  });
}

export function useSendTestMessage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke('ai-agent-sandbox', {
        body: { session_id: sessionId, message },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { reply: string; provider: string; model: string; latency_ms: number };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_test_messages', vars.sessionId] });
    },
    onError: (e: any, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_test_messages', vars.sessionId] });
      toast({ title: 'Erro no teste', description: e.message, variant: 'destructive' });
    },
  });
}
