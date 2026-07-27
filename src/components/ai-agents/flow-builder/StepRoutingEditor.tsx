import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowDown, ArrowUp, Languages, Plus, Trash2, X } from 'lucide-react';
import { useAgentTranslate } from '@/hooks/useAgentTranslate';
import { AGENT_LANGUAGES } from '@/types/ai-agents';
import {
  BRANCH_MATCH_TYPES,
  normalizeBranches,
  type FlowBranch,
  type StepValidation,
} from '@/types/ai-agent-flow-builder';

/** Tipos de resposta que oferecem opções fechadas ao cliente. */
export const OPTION_ANSWER_TYPES = ['SELECAO', 'BOTOES', 'MULTIPLA_ESCOLHA'];

/** Limite de botões suportado pelo WhatsApp em uma única mensagem. */
const WHATSAPP_BUTTON_LIMIT = 3;

/** Valor gravado pelo motor para respostas Sim/Não. */
const YES_NO_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sim', value: 'sim' },
  { label: 'Não', value: 'nao' },
];

export interface RoutingPatch {
  validation?: StepValidation;
  branches?: FlowBranch[];
  next_step_code?: string | null;
}

interface Props {
  answerType: string;
  validation: StepValidation;
  branches: unknown;
  nextStepCode?: string | null;
  /** Códigos das demais etapas do fluxo (destinos possíveis). */
  stepCodes: string[];
  onChange: (patch: RoutingPatch) => void;
}

/**
 * Editor de tudo que muda a direção do fluxo: opções/botões oferecidos,
 * caminhos (ramificações) por resposta, saída padrão e saída de fallback.
 * Compartilhado pelo editor visual e pelo formulário simples de etapa.
 */
export function StepRoutingEditor({
  answerType,
  validation,
  branches: rawBranches,
  nextStepCode,
  stepCodes,
  onChange,
}: Props) {
  const branches = normalizeBranches(rawBranches);
  const options = Array.isArray(validation.options) ? validation.options : [];
  const [optionInput, setOptionInput] = useState('');
  const translate = useAgentTranslate();
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const branchesRef = useRef<FlowBranch[]>(branches);
  const mounted = useRef(true);
  const [translatingOptions, setTranslatingOptions] = useState(false);

  /** Traduções dos rótulos das opções, por idioma (mesma ordem de `options`). */
  const optionsI18n = (validation.options_i18n || {}) as Partial<Record<'pt' | 'es' | 'en' | 'fr', string[]>>;

  useEffect(() => {
    branchesRef.current = branches;
  });
  useEffect(() => () => { mounted.current = false; }, []);

  const setValidation = (patch: Partial<StepValidation>) =>
    onChange({ validation: { ...validation, ...patch } });
  const setBranches = (next: FlowBranch[]) => onChange({ branches: next });

  const usesOptions = OPTION_ANSWER_TYPES.includes(answerType);
  const isYesNo = answerType === 'SIM_NAO';

  /** Opções esperadas para o tipo de resposta atual, já no formato do caminho. */
  const expected: { label: string; value: string }[] = isYesNo
    ? YES_NO_OPTIONS
    : usesOptions
      ? options.map((o) => ({ label: o, value: o }))
      : [];

  const missing = expected.filter(
    (o) => !branches.some((b) => b.value.trim().toLowerCase() === o.value.toLowerCase()),
  );
  /** Caminhos que não correspondem a nenhuma opção oferecida. */
  const orphanIds = new Set(
    expected.length === 0
      ? []
      : branches
          .filter(
            (b) =>
              b.match_type !== 'QUALQUER' &&
              !expected.some((o) => o.value.toLowerCase() === b.value.trim().toLowerCase()),
          )
          .map((b) => b.id),
  );

  const syncOptions = () => {
    if (missing.length === 0) return;
    setBranches([
      ...branches,
      ...missing.map((o, i) => ({
        id: `b_${Date.now()}_${i}`,
        label: o.label,
        match_type: 'IGUAL' as const,
        value: o.value,
        synonyms: [],
        next_step_code: null,
      })),
    ]);
  };

  const addBranch = () =>
    setBranches([
      ...branches,
      { id: `b_${Date.now()}`, label: '', match_type: 'IGUAL', value: '', synonyms: [], next_step_code: null },
    ]);

  const patchBranch = (id: string, patch: Partial<FlowBranch>) =>
    setBranches(branches.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const moveOption = (i: number, dir: -1 | 1) => {
    const next = options.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setValidation({ options: next });
  };

  /** Traduz o valor do caminho e guarda como equivalentes aceitos. */
  const translateBranch = async (b: FlowBranch) => {
    const source = (b.value || b.label || '').trim();
    if (!source) return;
    setTranslatingId(b.id);
    try {
      const result = await translate.mutateAsync({
        text: source,
        source: 'pt-BR',
        targets: AGENT_LANGUAGES.map((l) => l.code).filter((c) => c !== 'pt-BR'),
      });
      const extra = Object.values(result)
        .map((v) => String(v ?? '').trim())
        .filter((v) => v && v.toLowerCase() !== source.toLowerCase());
      if (!mounted.current || extra.length === 0) return;
      const latest = branchesRef.current;
      const current = latest.find((x) => x.id === b.id);
      if (!current) return;
      const merged = Array.from(new Set([...(current.synonyms || []), ...extra]));
      setBranches(latest.map((x) => (x.id === b.id ? { ...x, synonyms: merged } : x)));
    } catch {
      /* toast já exibido pelo hook */
    } finally {
      if (mounted.current) setTranslatingId(null);
    }
  };

  /** Traduz TODOS os rótulos das opções para os demais idiomas do agente. */
  const translateOptions = async () => {
    if (options.length === 0) return;
    setTranslatingOptions(true);
    try {
      const targets = AGENT_LANGUAGES.map((l) => l.code).filter((c) => c !== 'pt-BR');
      const results = await Promise.all(
        options.map((o) => translate.mutateAsync({ text: o, source: 'pt-BR', targets })),
      );
      if (!mounted.current) return;
      const next: Partial<Record<'pt' | 'es' | 'en' | 'fr', string[]>> = { pt: options.slice() };
      for (const code of targets) {
        const key = code === 'es' ? 'es' : code === 'en' ? 'en' : 'fr';
        next[key] = results.map((r, i) => String((r as Record<string, string>)[code] ?? '').trim() || options[i]);
      }
      setValidation({ options_i18n: next });
    } catch {
      /* toast já exibido pelo hook */
    } finally {
      if (mounted.current) setTranslatingOptions(false);
    }
  };

  const destinationSelect = (
    value: string | null | undefined,
    onValue: (v: string | null) => void,
    placeholder: string,
  ) => (
    <Select value={value || '__none__'} onValueChange={(v) => onValue(v === '__none__' ? null : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder}</SelectItem>
        {stepCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      {usesOptions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Opções oferecidas ao cliente</Label>
            <Button
              size="sm"
              variant="outline"
              disabled={translatingOptions || options.length === 0}
              onClick={translateOptions}
            >
              <Languages className="h-4 w-4 mr-1" />
              {translatingOptions ? 'Traduzindo…' : 'Traduzir opções'}
            </Button>
          </div>
          <div className="space-y-1">
            {options.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma opção cadastrada.</p>
            )}
            {options.map((o, i) => (
              <div key={`${o}-${i}`} className="flex items-center gap-1">
                <Input
                  value={o}
                  onChange={(e) => {
                    const next = options.slice();
                    next[i] = e.target.value;
                    setValidation({ options: next });
                  }}
                />
                <Button size="icon" variant="ghost" title="Subir" onClick={() => moveOption(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Descer" onClick={() => moveOption(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Excluir opção"
                  onClick={() =>
                    setValidation({
                      options: options.filter((_, x) => x !== i),
                      options_i18n: Object.fromEntries(
                        Object.entries(optionsI18n).map(([k, arr]) => [
                          k,
                          (Array.isArray(arr) ? arr : []).filter((_, x) => x !== i),
                        ]),
                      ),
                    })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {options.length > 0 && (optionsI18n.es || optionsI18n.en || optionsI18n.fr) && (
              <p className="text-[11px] text-muted-foreground">
                ES: {(optionsI18n.es || []).join(' / ') || '—'} · EN:{' '}
                {(optionsI18n.en || []).join(' / ') || '—'} · FR: {(optionsI18n.fr || []).join(' / ') || '—'}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={optionInput}
              placeholder="Nova opção"
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const v = optionInput.trim();
                if (!v || options.includes(v)) return;
                setValidation({ options: [...options, v] });
                setOptionInput('');
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const v = optionInput.trim();
                if (!v || options.includes(v)) return;
                setValidation({ options: [...options, v] });
                setOptionInput('');
              }}
            >
              Adicionar
            </Button>
          </div>
          {answerType === 'BOTOES' && options.length > WHATSAPP_BUTTON_LIMIT && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              O WhatsApp aceita no máximo {WHATSAPP_BUTTON_LIMIT} botões por mensagem.
            </p>
          )}
        </div>
      )}

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <Label>Caminhos (para onde cada resposta leva)</Label>
        <div className="flex items-center gap-1">
          {missing.length > 0 && (
            <Button size="sm" variant="secondary" onClick={syncOptions}>
              Sincronizar opções ({missing.length})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={addBranch}>
            <Plus className="h-4 w-4 mr-1" /> Caminho
          </Button>
        </div>
      </div>

      {isYesNo && (
        <p className="text-[11px] text-muted-foreground">
          Em respostas Sim/Não use os valores <code>sim</code> e <code>nao</code> — é assim que a
          resposta do cliente é registrada antes da comparação.
        </p>
      )}

      {branches.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sem caminhos: o fluxo segue sempre para a próxima etapa padrão.
        </p>
      )}

      {branches.map((b, i) => (
        <div key={b.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Caminho {i + 1}</span>
            <Button size="icon" variant="ghost" onClick={() => setBranches(branches.filter((x) => x.id !== b.id))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {orphanIds.has(b.id) && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" /> Este valor não corresponde a nenhuma opção oferecida.
            </p>
          )}

          <Input
            placeholder="Rótulo"
            value={b.label}
            onChange={(e) => patchBranch(b.id, { label: e.target.value })}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={b.match_type} onValueChange={(v) => patchBranch(b.id, { match_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BRANCH_MATCH_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Valor"
              disabled={b.match_type === 'QUALQUER'}
              value={b.value}
              onChange={(e) => patchBranch(b.id, { value: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal text-muted-foreground">
                Equivalentes aceitos (outros idiomas), separados por vírgula
              </Label>
              <Button
                size="sm"
                variant="ghost"
                disabled={b.match_type === 'QUALQUER' || translatingId === b.id}
                onClick={() => translateBranch(b)}
              >
                {translatingId === b.id ? 'Traduzindo…' : 'Traduzir'}
              </Button>
            </div>
            <Input
              placeholder="ex.: sí, yes, oui"
              disabled={b.match_type === 'QUALQUER'}
              value={(b.synonyms || []).join(', ')}
              onChange={(e) =>
                patchBranch(b.id, {
                  synonyms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>

          {destinationSelect(b.next_step_code, (v) => patchBranch(b.id, { next_step_code: v }), 'Vai para…')}
          {!b.next_step_code && (
            <p className="text-[11px] text-muted-foreground">
              Sem destino: usa a próxima etapa padrão.
            </p>
          )}
        </div>
      ))}

      <Separator />

      <div className="space-y-2">
        <Label>Próxima etapa padrão (senão)</Label>
        {destinationSelect(nextStepCode, (v) => onChange({ next_step_code: v }), 'Nenhuma')}
      </div>

      <div className="space-y-2">
        <Label>Etapa após esgotar as reperguntas</Label>
        {destinationSelect(
          validation.fallback_step_code as string | undefined,
          (v) => setValidation({ fallback_step_code: v || '' }),
          'Nenhuma (apenas repergunta)',
        )}
        <p className="text-[11px] text-muted-foreground">
          Usada quando o cliente erra a resposta mais de {validation.max_reasks ?? 1} vez(es).
        </p>
      </div>
    </div>
  );
}
