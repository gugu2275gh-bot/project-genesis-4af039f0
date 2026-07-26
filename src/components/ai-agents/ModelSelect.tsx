import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLLMModels } from '@/hooks/useLLMModels';
import type { AgentProvider } from '@/types/ai-agents';

interface Props {
  provider: AgentProvider;
  model: string;
  onChange: (provider: AgentProvider, model: string) => void;
  disabled?: boolean;
  label?: string;
}

/** Seleciona apenas modelos ativos na cascata de Configurações → LLM. */
export function ModelSelect({ provider, model, onChange, disabled, label = 'Modelo (LLM)' }: Props) {
  const { data: models, isLoading } = useLLMModels();
  const current = `${provider}::${model}`;
  const options = models || [];
  const hasCurrent = options.some((o) => o.value === current);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={current}
        disabled={disabled || isLoading}
        onValueChange={(v) => {
          const [p, m] = v.split('::');
          onChange(p as AgentProvider, m);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? 'Carregando modelos…' : 'Selecione um modelo'} />
        </SelectTrigger>
        <SelectContent>
          {!hasCurrent && model && (
            <SelectItem value={current}>{`${provider} · ${model} (fora da cascata)`}</SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        A lista vem dos modelos habilitados em Configurações → LLM.
      </p>
    </div>
  );
}
