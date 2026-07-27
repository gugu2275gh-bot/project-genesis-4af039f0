import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ANSWER_FORMATS, SKIP_MODES, type StepValidation } from '@/types/ai-agent-flow-builder';

interface Props {
  validation: StepValidation;
  /** Códigos das demais etapas (para "pular se etapa concluída"). */
  stepCodes: string[];
  /** Tipo de resposta da etapa — habilita opções específicas (ex.: botões Sim/Não). */
  answerType?: string | null;
  onChange: (patch: Partial<StepValidation>) => void;
}

/** Campos de validação e comportamento da resposta, sem exigir JSON. */
export function StepValidationEditor({ validation, stepCodes, answerType, onChange }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState<string | null>(null);
  const isYesNo = String(answerType || '').toUpperCase() === 'SIM_NAO';
  const isName = String(answerType || '').toUpperCase() === 'NOME';


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label className="font-normal">Resposta obrigatória</Label>
        <Switch
          checked={validation.required !== false}
          onCheckedChange={(v) => onChange({ required: v })}
        />
      </div>

      {isName && (
        <div className="space-y-2 rounded-md border p-3">
          <Label>Como aceitar o nome</Label>
          <Select
            value={validation.name_mode || 'COMPLETO'}
            onValueChange={(v) => onChange({ name_mode: v as 'COMPLETO' | 'SIMPLES' })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPLETO">Exigir nome completo (nome e sobrenome)</SelectItem>
              <SelectItem value="SIMPLES">Aceitar nome simples (só o primeiro nome)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Vale também para a análise da primeira mensagem: se o nome capturado já atender a esta
            regra, a pergunta não é repetida.
          </p>
        </div>
      )}

      {isYesNo && (
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="font-normal">Enviar como botões (Sim/Não)</Label>
            <p className="text-xs text-muted-foreground">
              Desligado: a pergunta vai como texto puro. Nenhuma regra fora do fluxo cria botões.
            </p>
          </div>
          <Switch
            checked={validation.quick_reply === true}
            onCheckedChange={(v) => onChange({ quick_reply: v })}
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="font-normal">Enviar reconhecimento antes da próxima pergunta</Label>
          <p className="text-xs text-muted-foreground">
            Frase humana curta (ex.: “Perfeito, obrigada!”) configurada na aba “Primeira mensagem”.
            Padrão: desligado em todas as etapas.
          </p>
        </div>
        <Switch
          checked={validation.ack_enabled === true}
          onCheckedChange={(v) => onChange({ ack_enabled: v })}
        />
      </div>


      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="font-normal">Resposta humanizada gerada pela IA</Label>
          <p className="text-xs text-muted-foreground">
            Em vez da frase fixa, a IA escreve um comentário curto e contextual sobre a resposta que o
            cliente acabou de dar (no idioma travado), antes da próxima pergunta.
          </p>
        </div>
        <Switch
          checked={validation.ack_ai === true}
          onCheckedChange={(v) => onChange({ ack_ai: v, ...(v ? { ack_enabled: true } : {}) })}
        />
      </div>




      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Formato esperado</Label>
          <Select value={validation.format || 'NENHUM'} onValueChange={(v) => onChange({ format: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANSWER_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Reperguntas antes do fallback</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={validation.max_reasks ?? 1}
            onChange={(e) => onChange({ max_reasks: Number(e.target.value.replace(/\D/g, '')) || 0 })}
          />
        </div>
      </div>

      {validation.format === 'REGEX' && (
        <div className="space-y-2">
          <Label>Expressão regular</Label>
          <Input value={validation.regex || ''} onChange={(e) => onChange({ regex: e.target.value })} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Mínimo</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={validation.min ?? ''}
            onChange={(e) =>
              onChange({ min: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Máximo</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={validation.max ?? ''}
            onChange={(e) =>
              onChange({ max: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Salvar resposta no campo</Label>
        <Input
          placeholder="ex.: nome_completo"
          value={validation.save_to_field || ''}
          onChange={(e) => onChange({ save_to_field: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Não repetir esta etapa</Label>
        <Select value={validation.skip_mode || 'NUNCA'} onValueChange={(v) => onChange({ skip_mode: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SKIP_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {validation.skip_mode === 'CAMPO_PREENCHIDO' && (
        <div className="space-y-2">
          <Label>Campo verificado</Label>
          <Input value={validation.skip_field || ''} onChange={(e) => onChange({ skip_field: e.target.value })} />
        </div>
      )}

      {validation.skip_mode === 'ETAPA_CONCLUIDA' && (
        <div className="space-y-2">
          <Label>Etapa já concluída</Label>
          <Select
            value={validation.skip_step_code || '__none__'}
            onValueChange={(v) => onChange({ skip_step_code: v === '__none__' ? '' : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Selecione</SelectItem>
              {stepCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Ocultar' : 'Avançado'}: validação em JSON
        </Button>
        {showRaw && (
          <Textarea
            rows={3}
            className="font-mono text-xs"
            value={rawDraft ?? JSON.stringify(validation || {})}
            onChange={(e) => {
              setRawDraft(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value || '{}');
                if (parsed && typeof parsed === 'object') onChange(parsed);
              } catch {
                /* ignora JSON inválido enquanto digita */
              }
            }}
            onBlur={() => setRawDraft(null)}
          />
        )}
      </div>
    </div>
  );
}
