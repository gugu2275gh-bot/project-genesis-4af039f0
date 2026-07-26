import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LLMModelOption {
  provider: 'gemini' | 'openai' | 'lovable';
  model: string;
  label: string;
  value: string;
}

function providerLabel(provider: string) {
  if (provider === 'lovable') return 'Lovable AI';
  if (provider === 'openai') return 'OpenAI';
  return 'Gemini';
}

/**
 * Modelos que estão ATIVOS na cascata configurada em Configurações → LLM.
 * É a única fonte de verdade para os selects de modelo dos Agentes de IA.
 */
export function useLLMModels() {
  return useQuery({
    queryKey: ['llm_models_enabled'],
    queryFn: async (): Promise<LLMModelOption[]> => {
      const { data, error } = await supabase
        .from('llm_settings' as any)
        .select('cascade')
        .limit(1)
        .single();
      if (error) throw error;
      const cascade = ((data as any)?.cascade || []) as { provider: string; model: string; enabled: boolean }[];
      const seen = new Set<string>();
      const out: LLMModelOption[] = [];
      for (const item of cascade) {
        if (!item?.enabled || !item?.model) continue;
        const value = `${item.provider}::${item.model}`;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push({
          provider: item.provider as LLMModelOption['provider'],
          model: item.model,
          label: `${providerLabel(item.provider)} · ${item.model}`,
          value,
        });
      }
      return out;
    },
  });
}
