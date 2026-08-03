import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STEP_FIELD_MAPPINGS } from '@/types/ai-agents';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import { CAPTURE_SOURCE_OPTIONS, type StepGeneralCapture } from '@/types/ai-agent-flow-builder';

interface Props {
  value?: StepGeneralCapture;
  onChange: (next: StepGeneralCapture) => void;
}

/**
 * Configuração da etapa "Pergunta geral": quais dados a IA pode interpretar da
 * resposta aberta do cliente e em qual campo do cadastro cada um é gravado.
 */
export function StepGeneralCaptureEditor({ value, onChange }: Props) {
  const cfg: StepGeneralCapture = {
    enabled: value?.enabled !== false,
    fields: Array.isArray(value?.fields) ? value!.fields! : [],
    min_confidence: typeof value?.min_confidence === 'number' ? value!.min_confidence! : 0.7,
    min_fields: typeof value?.min_fields === 'number' && value!.min_fields! > 0 ? value!.min_fields! : 2,
    non_blocking: value?.non_blocking === true,
  };


  const total = cfg.fields!.length;
  const minFields = Math.max(1, Math.min(cfg.min_fields!, total || 1));

  const requiredCount = cfg.fields!.filter((f) => f.required).length;

  const selected = new Map(cfg.fields!.map((f) => [f.source, f.target_field]));

  const toggle = (source: string, defaultTarget: string, checked: boolean) => {
    const previous = cfg.fields!.find((f) => f.source === source);
    const next = checked
      ? [
          ...cfg.fields!.filter((f) => f.source !== source),
          { ...(previous || {}), source, target_field: previous?.target_field || defaultTarget },
        ]
      : cfg.fields!.filter((f) => f.source !== source);
    onChange({ ...cfg, fields: next });
  };


  const setRequired = (source: string, required: boolean) =>
    onChange({
      ...cfg,
      fields: cfg.fields!.map((f) => (f.source === source ? { ...f, required } : f)),
    });

  const setPrompts = (source: string, prompts: Record<string, string>) =>
    onChange({
      ...cfg,
      fields: cfg.fields!.map((f) => (f.source === source ? { ...f, prompts } : f)),
    });

  const setTarget = (source: string, target: string) =>
    onChange({
      ...cfg,
      fields: cfg.fields!.map((f) => (f.source === source ? { ...f, target_field: target } : f)),
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div>
          <Label>Interpretar a resposta com IA</Label>
          <p className="text-xs text-muted-foreground">
            A resposta aberta é lida pela IA, os dados reconhecidos são gravados no cadastro e as
            próximas perguntas que pediriam esses mesmos dados são puladas automaticamente.
          </p>
        </div>
        <Switch checked={cfg.enabled} onCheckedChange={(v) => onChange({ ...cfg, enabled: v })} />
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div>
          <Label>Etapa não bloqueante (dados opcionais)</Label>
          <p className="text-xs text-muted-foreground">
            A pergunta é feita uma única vez. Depois da resposta do cliente — mesmo parcial ou
            recusada — o fluxo segue para a próxima etapa e nada aqui impede a transferência.
          </p>
        </div>
        <Switch
          checked={cfg.non_blocking === true}
          onCheckedChange={(v) => onChange({ ...cfg, non_blocking: v })}
        />
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <Label className="text-xs">Campos obrigatórios desta etapa</Label>
        <p className="text-xs text-muted-foreground mt-1">
          {requiredCount > 0
            ? cfg.fields!
                .filter((f) => f.required)
                .map((f) => CAPTURE_SOURCE_OPTIONS.find((o) => o.value === f.source)?.label || f.source)
                .join(', ')
            : 'Nenhum — o agente aproveita o que for dito e segue em frente.'}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Dados que podem ser interpretados</Label>

        <div className="space-y-2">
          {CAPTURE_SOURCE_OPTIONS.map((opt) => {
            const checked = selected.has(opt.value);
            return (
              <div key={opt.value} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`cap-${opt.value}`}
                    checked={checked}
                    onCheckedChange={(v) => toggle(opt.value, opt.default_target, !!v)}
                  />
                  <Label htmlFor={`cap-${opt.value}`} className="cursor-pointer text-sm font-normal">
                    {opt.label}
                  </Label>
                </div>
                {checked && (
                  <div className="pl-6 flex items-center gap-2">
                    <Checkbox
                      id={`req-${opt.value}`}
                      checked={cfg.fields!.find((f) => f.source === opt.value)?.required === true}
                      onCheckedChange={(v) => setRequired(opt.value, !!v)}
                    />
                    <Label htmlFor={`req-${opt.value}`} className="cursor-pointer text-xs font-normal">
                      Obrigatório — perguntar antes de seguir/transferir
                    </Label>
                  </div>
                )}
                {checked && cfg.fields!.find((f) => f.source === opt.value)?.required === true && (
                  <div className="pl-6">
                    <MultiLangField
                      label="Pergunta usada para cobrar este dado"
                      hint="Deixe em branco para usar a pergunta padrão. Ao traduzir, o agente usa a versão do idioma do atendimento."
                      value={(cfg.fields!.find((f) => f.source === opt.value)?.prompts || {}) as Record<string, string>}
                      onChange={(v) => setPrompts(opt.value, v as Record<string, string>)}
                      rows={2}
                    />
                  </div>
                )}
                {checked && (
                  <div className="pl-6 space-y-1">
                    <Label className="text-xs text-muted-foreground">Gravar em</Label>
                    <Select
                      value={selected.get(opt.value) || opt.default_target}
                      onValueChange={(v) => setTarget(opt.value, v)}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STEP_FIELD_MAPPINGS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Dados suficientes para pular esta etapa</Label>
        <Select
          value={String(minFields)}
          onValueChange={(v) => onChange({ ...cfg, min_fields: Number(v) })}
          disabled={!total}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 1 ? '1 dado entendido' : `${n} dados entendidos`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {requiredCount > 0
            ? `${requiredCount} dado(s) obrigatório(s): mesmo que a etapa seja pulada, o agente pergunta o que faltar antes de seguir.`
            : 'Nenhum dado obrigatório: o agente aproveita o que for dito e segue em frente.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Regra: o mínimo vale apenas para os campos opcionais. Todo campo marcado como
          obrigatório é sempre perguntado — a etapa só é encerrada quando nenhum obrigatório
          estiver em branco.

        </p>
      </div>

      <div className="space-y-2">
        <Label>Confiança mínima da IA</Label>
        <Select
          value={String(cfg.min_confidence)}
          onValueChange={(v) => onChange({ ...cfg, min_confidence: Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0.5">Baixa (aproveita mais, erra mais)</SelectItem>
            <SelectItem value="0.7">Média (recomendado)</SelectItem>
            <SelectItem value="0.9">Alta (só quando estiver claro)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
