import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Languages, Loader2 } from 'lucide-react';
import { AGENT_LANGUAGES, type AgentLanguage, type MultiLangText } from '@/types/ai-agents';
import { useAgentTranslate } from '@/hooks/useAgentTranslate';

interface Props {
  label: string;
  hint?: string;
  value: MultiLangText;
  onChange: (value: MultiLangText) => void;
  rows?: number;
  disabled?: boolean;
  baseLanguage?: AgentLanguage;
}

/**
 * Campo de texto com uma aba por idioma e botão de tradução automática
 * a partir do idioma base.
 */
export function MultiLangField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
  disabled,
  baseLanguage = 'pt-BR',
}: Props) {
  const [lang, setLang] = useState<AgentLanguage>(baseLanguage);
  const translate = useAgentTranslate();
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const handleTranslate = async () => {
    const source = value[baseLanguage] || '';
    if (!source.trim()) return;
    const targets = AGENT_LANGUAGES.map((l) => l.code).filter((c) => c !== baseLanguage);
    try {
      const result = await translate.mutateAsync({ text: source, source: baseLanguage, targets });
      // Falhas nunca podem derrubar a edição em andamento: mantemos o texto base.
      if (!mounted.current) return;
      onChange({ ...value, ...result });
    } catch {
      /* erro já exibido em toast pelo hook */
    }
  };


  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || translate.isPending || !String(value[baseLanguage] ?? '').trim()}
          onClick={handleTranslate}
        >
          {translate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Traduzir para os outros idiomas</span>
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Tabs value={lang} onValueChange={(v) => setLang(v as AgentLanguage)}>
        <TabsList className="h-8">
          {AGENT_LANGUAGES.map((l) => (
            <TabsTrigger key={l.code} value={l.code} className="text-xs">
              {l.label}
              {!String(value[l.code] ?? '').trim() && <span className="ml-1 text-muted-foreground">•</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        {AGENT_LANGUAGES.map((l) => (
          <TabsContent key={l.code} value={l.code} className="mt-2">
            <Textarea
              rows={rows}
              disabled={disabled}
              value={String(value[l.code] ?? '')}
              onChange={(e) => onChange({ ...value, [l.code]: e.target.value })}
              placeholder={l.code === baseLanguage ? 'Escreva o texto base aqui' : 'Traduza ou escreva manualmente'}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
