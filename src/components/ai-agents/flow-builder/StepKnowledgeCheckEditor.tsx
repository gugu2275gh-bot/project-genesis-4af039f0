import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import {
  KB_CHECK_ON_INVALID,
  normalizeKbCheck,
  type StepKbCheck,
} from '@/types/ai-agent-flow-builder';

interface Props {
  value: unknown;
  isQuestion: boolean;
  onChange: (next: StepKbCheck) => void;
}

export function StepKnowledgeCheckEditor({ value, isQuestion, onChange }: Props) {
  const cfg = normalizeKbCheck(value);
  const patch = (p: Partial<StepKbCheck>) => onChange({ ...cfg, ...p });

  if (!isQuestion) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        A checagem na base de conhecimento só se aplica a etapas do tipo "Pergunta".
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-md border p-3">
        <div className="space-y-1">
          <Label className="font-normal">Validar a resposta na base de conhecimento</Label>
          <p className="text-[11px] text-muted-foreground">
            Antes de avançar, o agente pesquisa a resposta do cliente na base. Exemplo: o cliente diz
            "quero fazer uma regularização" — se for um serviço atendido, o valor é gravado e o fluxo
            segue; se não for, o agente explica e repergunta, sem sair do fluxo.
          </p>
        </div>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      {cfg.enabled && (
        <>
          <div className="space-y-2">
            <Label>O que considerar válido nesta etapa</Label>
            <Textarea
              rows={3}
              placeholder="Ex.: a resposta deve ser um serviço de estrangeria oferecido pela CB Asesoria."
              value={cfg.instruction}
              onChange={(e) => patch({ instruction: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Instrução usada pela IA junto com os trechos encontrados na base de conhecimento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Se não for válido</Label>
              <Select value={cfg.on_invalid} onValueChange={(v) => patch({ on_invalid: v as StepKbCheck['on_invalid'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KB_CHECK_ON_INVALID.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {KB_CHECK_ON_INVALID.find((o) => o.value === cfg.on_invalid)?.hint}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tentativas antes de aplicar a regra</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={String(cfg.attempts)}
                onChange={(e) => patch({ attempts: Number(e.target.value.replace(/\D+/g, '')) || 0 })}
              />
              <p className="text-[11px] text-muted-foreground">
                Quantas vezes o agente explica e repergunta antes de seguir/encaminhar.
              </p>
            </div>
          </div>

          <MultiLangField
            label="Mensagem quando a resposta não é válida"
            hint="Deixe em branco para a IA escrever a explicação com base no que existe na base de conhecimento."
            value={cfg.messages}
            onChange={(v) => patch({ messages: v as Record<string, string> })}
            rows={3}
          />

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-1">
              <Label className="font-normal">Gravar o nome oficial encontrado na base</Label>
              <p className="text-[11px] text-muted-foreground">
                Normaliza a resposta (ex.: "regularização" → nome oficial do serviço) antes de salvar.
              </p>
            </div>
            <Switch checked={cfg.normalize} onCheckedChange={(v) => patch({ normalize: v })} />
          </div>
        </>
      )}
    </div>
  );
}
