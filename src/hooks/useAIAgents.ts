import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { splitPromptIntoBlocks } from '@/lib/agent-prompt-blocks';

import type {
  AIAgent,
  AgentFlow,
  AgentFlowStep,
  AgentTestMessage,
  AgentTestSession,
  AgentText,
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
        id, created_at, updated_at, created_by, updated_by, current_version,
        is_production, production_synced_at, ...rest
      } = agent as any;
      // O fluxo NÃO é duplicado: o novo agente aponta para o mesmo flow_id.
      const { data, error } = await db
        .from('ai_agents')
        .insert({
          ...rest,
          name: `${agent.name} (cópia)`,
          status: 'RASCUNHO',
          is_production: false,
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

/** Salva em lote o desenho do fluxo: etapas, ramificações e posições no canvas. */
export function useSaveFlowCanvas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      flowId,
      steps,
      positions,
      removedIds,
    }: {
      flowId: string;
      steps: any[];
      positions: Record<string, { x: number; y: number }>;
      removedIds: string[];
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (removedIds.length) {
        const { error } = await db.from('ai_agent_flow_steps').delete().in('id', removedIds);
        if (error) throw error;
      }

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const { id, created_at, updated_at, created_by, ...rest } = s;
        const payload = {
          ...rest,
          flow_id: flowId,
          order_index: i + 1,
          message: s.messages?.['pt-BR'] || s.message || '',
          updated_by: userId,
        };
        if (String(id).startsWith('tmp_')) {
          const { error } = await db
            .from('ai_agent_flow_steps')
            .insert({ ...payload, created_by: userId });
          if (error) throw error;
        } else {
          const { error } = await db.from('ai_agent_flow_steps').update(payload).eq('id', id);
          if (error) throw error;
        }
      }

      const { error: flowError } = await db
        .from('ai_agent_flows')
        .update({ canvas: { positions }, updated_by: userId })
        .eq('id', flowId);
      if (flowError) throw flowError;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_flow_steps', vars.flowId] });
      qc.invalidateQueries({ queryKey: ['ai_agent_flows'] });
      toast({ title: 'Fluxo salvo' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar fluxo', description: e.message, variant: 'destructive' }),
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

/* --------------------- TEXTOS DO ROTEIRO (AGENTE 1.0) -------------------- */

export function useAgentTexts(agentId?: string) {
  return useQuery({
    queryKey: ['ai_agent_texts', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      const { data, error } = await db
        .from('ai_agent_texts')
        .select('*')
        .eq('agent_id', agentId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []) as AgentText[];
    },
  });
}

export function useSaveAgentTexts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      agentId,
      texts,
    }: {
      agentId: string;
      texts: { text_key: string; translations: Record<string, string> }[];
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      for (const t of texts) {
        const { error } = await db
          .from('ai_agent_texts')
          .update({ translations: t.translations, updated_by: userId })
          .eq('agent_id', agentId)
          .eq('text_key', t.text_key);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ai_agent_texts', vars.agentId] });
      toast({ title: 'Textos do agente atualizados' });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao salvar textos', description: e.message, variant: 'destructive' }),
  });
}

/* ------------- SINCRONIZAÇÃO COM A CONFIGURAÇÃO EM PRODUÇÃO -------------- */

/**
 * Importa a configuração que o agente de WhatsApp está realmente executando
 * (prompt do fluxo, textos por idioma e etapas) e cria/atualiza o "AGENTE 1.0".
 * O agente resultante é marcado como `is_production`, de modo que qualquer
 * alteração feita na tela passa a valer no atendimento real.
 */
export function useSyncAgentDefaults() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      await supabase.auth.refreshSession();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/whatsapp-webhook?action=agent_defaults`,
        { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY } },
      );
      if (!res.ok) throw new Error(`Falha ao ler a configuração atual (${res.status})`);
      const defaults = (await res.json()) as {
        prompt_flow: string;
        texts: { text_key: string; label: string; group: string; order_index: number; translations: Record<string, string> }[];
        steps: { step_code: string; name: string; description?: string | null; answer_type?: string; next_step_code?: string | null; order_index: number; messages: Record<string, string> }[];
      };

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      // 1) Agente de produção (cria na primeira vez)
      const { data: existing, error: exErr } = await db
        .from('ai_agents')
        .select('*')
        .eq('is_production', true)
        .maybeSingle();
      if (exErr) throw exErr;

      let agent = existing as AIAgent | null;
      if (!agent) {
        const { data, error } = await db
          .from('ai_agents')
          .insert({
            name: 'AGENTE 1.0',
            description: 'Agente que atende no WhatsApp hoje (configuração em produção).',
            provider: 'gemini',
            model: 'gemini-3-flash-preview',
            status: 'ATIVO',
            is_production: true,
            temperature: 0.7,
            max_tokens: 1024,
            default_language: 'pt',
            prompt_flow: defaults.prompt_flow,
            created_by: userId,
            updated_by: userId,
          })
          .select('*')
          .single();
        if (error) throw error;
        agent = data as AIAgent;
      } else {
        const { error } = await db
          .from('ai_agents')
          .update({ prompt_flow: agent.prompt_flow || defaults.prompt_flow, updated_by: userId })
          .eq('id', agent.id);
        if (error) throw error;
      }

      // 1b) Blocos editáveis do prompt — gerados na primeira sincronização
      const currentBlocks = (agent as any).prompt_blocks;
      if (!Array.isArray(currentBlocks) || currentBlocks.length === 0) {
        const blocks = splitPromptIntoBlocks(agent.prompt_flow || defaults.prompt_flow || '');
        if (blocks.length > 0) {
          const { error } = await db
            .from('ai_agents')
            .update({ prompt_blocks: blocks, updated_by: userId })
            .eq('id', agent.id);
          if (error) throw error;
        }
      }


      // 2) Textos por idioma — só insere os que ainda não existem (não sobrescreve edições)
      const { data: currentTexts, error: txErr } = await db
        .from('ai_agent_texts')
        .select('text_key')
        .eq('agent_id', agent.id);
      if (txErr) throw txErr;
      const known = new Set((currentTexts || []).map((t: any) => t.text_key));

      const missing = defaults.texts
        .filter((t) => !known.has(t.text_key))
        .map((t) => ({
          agent_id: agent!.id,
          text_key: t.text_key,
          label: t.label,
          description: t.group,
          translations: t.translations,
          order_index: t.order_index,
          created_by: userId,
          updated_by: userId,
        }));

      if (missing.length > 0) {
        const { error } = await db.from('ai_agent_texts').insert(missing);
        if (error) throw error;
      }

      return { agentId: agent.id, imported: missing.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ai_agents'] });
      qc.invalidateQueries({ queryKey: ['ai_agent_texts'] });
      toast({
        title: 'Configuração de produção sincronizada',
        description: r.imported > 0 ? `${r.imported} textos importados do agente ativo.` : 'Nenhum texto novo — já estava atualizado.',
      });
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao sincronizar', description: e.message, variant: 'destructive' }),
  });
}
