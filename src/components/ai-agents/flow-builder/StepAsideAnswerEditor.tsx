import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import {
  ASIDE_ANSWER_MODES,
  normalizeAsideAnswer,
  type AsideAnswerMode,
  type StepAsideAnswer,
} from '@/types/ai-agent-flow-builder';

interface Props {
  value: unknown;
  onChange: (next: StepAsideAnswer) => void;
}

export function StepAsideAnswerEditor({ value, onChange }: Props) {
  const cfg = normalizeAsideAnswer(value);
  const patch = (p: Partial<StepAsideAnswer>) => onChange({ ...cfg, ...p });

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="space-y-1">
        <Label>Dúvidas do cliente durante a etapa</Label>
        <p className="text-[11px] text-muted-foreground">
          O que o agente faz quando, no lugar da resposta, o cliente manda uma pergunta ou muda de
          assunto. Em todos os modos a pergunta da etapa é repetida na mesma mensagem — o fluxo nunca
          é abandonado.
        </p>
      </div>

      <div className="space-y-2">
        <Select value={cfg.mode} onValueChange={(v) => patch({ mode: v as AsideAnswerMode })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASIDE_ANSWER_MODES.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {ASIDE_ANSWER_MODES.find((o) => o.value === cfg.mode)?.hint}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tamanho mínimo da dúvida</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={String(cfg.min_chars)}
            onChange={(e) => patch({ min_chars: Number(e.target.value.replace(/\D+/g, '')) || 0 })}
          />
          <p className="text-[11px] text-muted-foreground">
            Mensagens menores que isso (ex.: "?", "como assim?") nunca são tratadas como dúvida: o
            agente apenas repete a pergunta da etapa.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Quantas vezes responder por etapa</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={String(cfg.attempts)}
            onChange={(e) => patch({ attempts: Number(e.target.value.replace(/\D+/g, '')) || 0 })}
          />
          <p className="text-[11px] text-muted-foreground">
            Depois desse limite o agente só retoma a pergunta.
          </p>
        </div>
      </div>

      {cfg.mode === 'MENSAGEM_FIXA' && (
        <MultiLangField
          label="Mensagem enviada antes de retomar a pergunta"
          hint="Texto fixo, sem consultar a base de conhecimento."
          value={cfg.messages}
          onChange={(v) => patch({ messages: v as Record<string, string> })}
          rows={3}
        />
      )}
    </div>
  );
}
