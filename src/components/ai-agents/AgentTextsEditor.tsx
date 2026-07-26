import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAgentTexts, useSaveAgentTexts } from '@/hooks/useAIAgents';
import { AGENT_TEXT_LANGUAGES } from '@/types/ai-agents';

interface Props {
  agentId: string;
  readOnly?: boolean;
}

/**
 * Editor dos textos do roteiro do agente em produção.
 * Cada chave possui uma versão por idioma; salvar altera o atendimento real.
 */
export function AgentTextsEditor({ agentId, readOnly }: Props) {
  const { data: texts, isLoading } = useAgentTexts(agentId);
  const saveTexts = useSaveAgentTexts();

  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!texts) return;
    const next: Record<string, Record<string, string>> = {};
    for (const t of texts) next[t.text_key] = { ...(t.translations || {}) };
    setDraft(next);
  }, [texts]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (texts || []).filter((t) => {
      if (!term) return true;
      const values = Object.values(draft[t.text_key] || t.translations || {}).join(' ').toLowerCase();
      return (
        t.text_key.toLowerCase().includes(term) ||
        (t.label || '').toLowerCase().includes(term) ||
        values.includes(term)
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const g = t.description || 'Outros';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    }
    return Array.from(map.entries());
  }, [texts, draft, search]);

  const setValue = (key: string, lang: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...(d[key] || {}), [lang]: value } }));

  const handleSave = async () => {
    const payload = Object.entries(draft).map(([text_key, translations]) => ({ text_key, translations }));
    await saveTexts.mutateAsync({ agentId, texts: payload });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando textos…</p>;

  if (!texts || texts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum texto importado ainda. Use "Sincronizar com produção" na listagem de agentes para
        trazer o roteiro que está sendo executado hoje.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Buscar texto…"
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!readOnly && (
          <Button size="sm" onClick={handleSave} disabled={saveTexts.isPending}>
            Salvar textos
          </Button>
        )}
      </div>

      <Accordion type="multiple" className="w-full">
        {groups.map(([group, items]) => (
          <AccordionItem key={group} value={group}>
            <AccordionTrigger className="text-sm">
              {group} <span className="ml-2 text-xs text-muted-foreground">({items.length})</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              {items.map((t) => (
                <div key={t.id} className="rounded-md border p-3 space-y-2">
                  <div>
                    <Label className="text-sm">{t.label || t.text_key}</Label>
                    <p className="font-mono text-[11px] text-muted-foreground">{t.text_key}</p>
                  </div>
                  <Tabs defaultValue={AGENT_TEXT_LANGUAGES[0].code}>
                    <TabsList className="h-8">
                      {AGENT_TEXT_LANGUAGES.map((l) => (
                        <TabsTrigger key={l.code} value={l.code} className="text-xs">
                          {l.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {AGENT_TEXT_LANGUAGES.map((l) => (
                      <TabsContent key={l.code} value={l.code} className="mt-2">
                        <Textarea
                          rows={3}
                          disabled={readOnly}
                          value={draft[t.text_key]?.[l.code] ?? ''}
                          onChange={(e) => setValue(t.text_key, l.code, e.target.value)}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
