import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import {
  UNKNOWN_ANSWER_MODES,
  normalizeUnknownAnswer,
  type UnknownAnswerConfig,
} from '@/types/ai-agent-flow-builder';

interface Props {
  value: unknown;
  /** Etapa de fallback configurada na aba Validação (só para exibir aviso). */
  fallbackStepCode?: string;
  onChange: (next: UnknownAnswerConfig) => void;
}

/**
 * Configuração POR ETAPA do que o agente faz quando o cliente responde
 * "não sei / não lembro". Não altera a sequência do fluxo: quando o modo
 * aceita ou pula, o agente segue para a mesma próxima etapa de sempre.
 */
export function StepUnknownAnswerEditor({ value, fallbackStepCode, onChange }: Props) {
  const cfg = normalizeUnknownAnswer(value);
  const [newPhrase, setNewPhrase] = useState('');

  const patch = (p: Partial<UnknownAnswerConfig>) => onChange({ ...cfg, ...p });

  const addPhrase = () => {
    const text = newPhrase.trim();
    if (!text || cfg.phrases.includes(text)) return;
    patch({ phrases: [...cfg.phrases, text] });
    setNewPhrase('');
  };

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Define o que o agente faz quando o cliente diz que não sabe ou não lembra a resposta
        <strong> desta etapa</strong>. A sequência do fluxo não muda: ao aceitar ou pular, o agente
        segue para a mesma próxima etapa configurada.
      </p>

      <div className="space-y-2">
        <Label>Comportamento</Label>
        <Select value={cfg.mode} onValueChange={(v) => patch({ mode: v as UnknownAnswerConfig['mode'] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNKNOWN_ANSWER_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {UNKNOWN_ANSWER_MODES.find((m) => m.value === cfg.mode)?.hint}
        </p>
        {cfg.mode === 'ENCAMINHAR' && !fallbackStepCode?.trim() && (
          <p className="text-xs text-amber-600">
            Nenhuma etapa de fallback definida na aba Validação — o agente vai apenas repetir a pergunta.
          </p>
        )}
      </div>

      <MultiLangField
        label="Mensagem de acolhimento"
        hint='Ex.: "Sem problema! Uma data aproximada já me ajuda — só o mês e o ano servem."'
        value={cfg.messages}
        onChange={(v) => patch({ messages: v })}
        rows={3}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tentativas antes de aplicar</Label>
          <Input
            type="number"
            min={0}
            value={cfg.attempts}
            onChange={(e) => patch({ attempts: Math.max(0, Number(e.target.value) || 0) })}
          />
          <p className="text-[11px] text-muted-foreground">
            Quantas vezes o agente envia a mensagem de acolhimento antes de aceitar/pular.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Valor gravado ao pular</Label>
          <Input
            value={cfg.fallback_value}
            placeholder="NÃO INFORMADO"
            onChange={(e) => patch({ fallback_value: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Gravado na resposta e no campo do CRM escolhido em "Salvar resposta em".
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Frases extras que indicam "não sei"</Label>
        <p className="text-[11px] text-muted-foreground">
          Já são reconhecidas automaticamente as variações comuns em português, espanhol, inglês e
          francês (não sei, no sé, I don't know, je ne sais pas…). Adicione apenas frases específicas
          do seu atendimento.
        </p>
        <div className="flex gap-2">
          <Input
            value={newPhrase}
            placeholder="ex.: não tenho esse documento"
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPhrase();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addPhrase}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {cfg.phrases.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {cfg.phrases.map((p) => (
              <Badge key={p} variant="secondary" className="gap-1">
                {p}
                <button
                  type="button"
                  aria-label={`Remover ${p}`}
                  onClick={() => patch({ phrases: cfg.phrases.filter((x) => x !== p) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
