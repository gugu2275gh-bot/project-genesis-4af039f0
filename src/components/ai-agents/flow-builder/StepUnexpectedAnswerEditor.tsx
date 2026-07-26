import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import {
  DEVIATION_KINDS,
  UNEXPECTED_ANSWER_MODES,
  normalizeUnexpectedAnswer,
  type DeviationKind,
  type UnexpectedAnswerConfig,
  type UnexpectedRule,
} from '@/types/ai-agent-flow-builder';

interface Props {
  /** Conteúdo de `validation.unexpected_answer`. */
  value: unknown;
  /** Formato antigo (`validation.unknown_answer`), lido só como retrocompatibilidade. */
  legacyValue?: unknown;
  /** Etapa de fallback configurada na aba Validação (só para exibir aviso). */
  fallbackStepCode?: string;
  onChange: (next: UnexpectedAnswerConfig) => void;
}

/**
 * Configuração POR ETAPA do que o agente faz quando a resposta do cliente é
 * diferente do esperado (não sabe, formato inválido, fora das opções, fora do
 * assunto). Não altera a sequência do fluxo: quando o modo aceita ou pula, o
 * agente segue para a mesma próxima etapa de sempre.
 */
export function StepUnexpectedAnswerEditor({ value, legacyValue, fallbackStepCode, onChange }: Props) {
  const cfg = normalizeUnexpectedAnswer(value, legacyValue);
  const [kind, setKind] = useState<DeviationKind>('unknown');
  const [newPhrase, setNewPhrase] = useState('');

  const rule = cfg[kind];
  const info = DEVIATION_KINDS.find((k) => k.value === kind);

  const patch = (p: Partial<UnexpectedRule>) =>
    onChange({ ...cfg, [kind]: { ...rule, ...p, enabled: kind === 'unknown' ? true : rule.enabled } });

  const setEnabled = (enabled: boolean) => onChange({ ...cfg, [kind]: { ...rule, enabled } });

  const addPhrase = () => {
    const text = newPhrase.trim();
    if (!text || rule.phrases.includes(text)) return;
    patch({ phrases: [...rule.phrases, text] });
    setNewPhrase('');
  };

  const usesDefault = kind !== 'unknown' && !rule.enabled;

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Define o que o agente faz quando a resposta do cliente é <strong>diferente do esperado</strong>{' '}
        nesta etapa. A sequência do fluxo não muda: ao aceitar ou pular, o agente segue para a mesma
        próxima etapa configurada.
      </p>

      <div className="space-y-2">
        <Label>Situação</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as DeviationKind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEVIATION_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
                {k.value !== 'unknown' && !cfg[k.value].enabled ? ' — regra padrão' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{info?.hint}</p>
      </div>

      {kind !== 'unknown' && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="font-normal">Tratativa específica para esta situação</Label>
            <p className="text-[11px] text-muted-foreground">
              Desligado: usa a regra de "Cliente não sabe / não lembra".
            </p>
          </div>
          <Switch checked={rule.enabled} onCheckedChange={setEnabled} />
        </div>
      )}

      {!usesDefault && (
        <>
          <div className="space-y-2">
            <Label>Comportamento</Label>
            <Select value={rule.mode} onValueChange={(v) => patch({ mode: v as UnexpectedRule['mode'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNEXPECTED_ANSWER_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {UNEXPECTED_ANSWER_MODES.find((m) => m.value === rule.mode)?.hint}
            </p>
            {rule.mode === 'ENCAMINHAR' && !fallbackStepCode?.trim() && (
              <p className="text-xs text-amber-600">
                Nenhuma etapa de fallback definida na aba Validação — o agente vai apenas repetir a pergunta.
              </p>
            )}
          </div>

          <MultiLangField
            label="Mensagem de acolhimento"
            hint='Ex.: "Sem problema! Uma data aproximada já me ajuda — só o mês e o ano servem."'
            value={rule.messages}
            onChange={(v) => patch({ messages: v })}
            rows={3}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tentativas antes de aplicar</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={rule.attempts}
                onChange={(e) => patch({ attempts: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })}
              />
              <p className="text-[11px] text-muted-foreground">
                Quantas vezes o agente envia a mensagem de acolhimento antes de aceitar/pular.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Valor gravado ao pular</Label>
              <Input
                value={rule.fallback_value}
                placeholder="NÃO INFORMADO"
                onChange={(e) => patch({ fallback_value: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Gravado na resposta e no campo do CRM escolhido em "Salvar resposta em".
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Frases extras que caracterizam esta situação</Label>
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
            {rule.phrases.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {rule.phrases.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1">
                    {p}
                    <button
                      type="button"
                      aria-label={`Remover ${p}`}
                      onClick={() => patch({ phrases: rule.phrases.filter((x) => x !== p) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
