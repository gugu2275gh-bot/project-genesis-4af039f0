import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AgentLanguage, MultiLangText } from '@/types/ai-agents';

interface TranslatePayload {
  text: string;
  source: AgentLanguage;
  targets: AgentLanguage[];
}

/** Traduz um texto para os demais idiomas usando a cascata de LLM já configurada. */
export function useAgentTranslate() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ text, source, targets }: TranslatePayload): Promise<MultiLangText> => {
      if (!text.trim()) return {};
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.functions.invoke('ai-agent-translate', {
        body: { text, source, targets },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.translations || {}) as MultiLangText;
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao traduzir', description: e.message, variant: 'destructive' }),
  });
}
