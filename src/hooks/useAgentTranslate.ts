import { useMutation } from '@tanstack/react-query';
import { supabase, ensureFreshSession } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AgentLanguage, MultiLangText } from '@/types/ai-agents';

interface TranslatePayload {
  text: string;
  source: AgentLanguage;
  targets: AgentLanguage[];
}

/** Mantém apenas chaves de idioma com texto — protege a UI de respostas fora do formato. */
function sanitizeTranslations(raw: unknown): MultiLangText {
  const out: MultiLangText = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw as Record<string, unknown>).forEach(([lang, value]) => {
    if (typeof value === 'string' && value.trim()) out[lang as AgentLanguage] = value;
  });
  return out;
}

/** Traduz um texto para os demais idiomas usando a cascata de LLM já configurada. */
export function useAgentTranslate() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ text, source, targets }: TranslatePayload): Promise<MultiLangText> => {
      if (!text.trim()) return {};
      // Renova o token só se estiver expirando: um refresh desnecessário
      // remonta a aplicação e derruba o editor aberto.
      await ensureFreshSession();
      const { data, error } = await supabase.functions.invoke('ai-agent-translate', {
        body: { text, source, targets },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const translations = sanitizeTranslations((data as any)?.translations);
      if (Object.keys(translations).length === 0) {
        throw new Error('O modelo não devolveu nenhuma tradução válida.');
      }
      return translations;
    },
    onError: (e: any) =>
      toast({ title: 'Erro ao traduzir', description: e.message, variant: 'destructive' }),
  });
}

