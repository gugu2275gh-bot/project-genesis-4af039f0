import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { MultiLangField } from '@/components/ai-agents/MultiLangField';
import { useSaveFlow } from '@/hooks/useAIAgents';
import { Save, Sparkles } from 'lucide-react';
import type { AgentFlow } from '@/types/ai-agents';

/** Campos que podem ser aproveitados da primeira frase do cliente. */
export const INTAKE_FIELDS: { value: string; label: string }[] = [
  { value: 'contact.full_name', label: 'Nome' },
  { value: 'contact.email', label: 'E-mail' },
  { value: 'funnel.location_known', label: 'Está na Espanha? (Sim/Não)' },
  { value: 'funnel.interest_confirmed', label: 'Intenção / serviço buscado' },
  { value: 'lead.service_interest', label: 'Interesse do lead' },
  { value: 'funnel.entry_date_confirmed', label: 'Data de entrada na Espanha' },
  { value: 'contact.spain_arrival_date', label: 'Data de chegada (contato)' },
  { value: 'funnel.empadronado_confirmed', label: 'Está empadronado? (Sim/Não)' },
  { value: 'funnel.empadronado_city', label: 'Cidade de empadronamento' },
];

const DEFAULT_PERSONALIZED: Record<string, string> = {
  'pt-BR': 'Olá, {nome}! 😊 Sou a assistente virtual da CB Asesoria. {resumo} Vou continuar de onde você parou.',
  es: '¡Hola, {nome}! 😊 Soy la asistente virtual de CB Asesoria. {resumo} Sigo desde donde te quedaste.',
  en: 'Hi, {nome}! 😊 I am CB Asesoria’s virtual assistant. {resumo} Let’s continue from there.',
  fr: 'Bonjour, {nome} ! 😊 Je suis l’assistante virtuelle de CB Asesoria. {resumo} Continuons à partir de là.',
};

const DEFAULT_ACK: Record<string, string> = {
  'pt-BR': 'Perfeito, obrigada!',
  es: '¡Perfecto, gracias!',
  en: 'Perfect, thank you!',
  fr: 'Parfait, merci !',
};

interface IntakeConfigDraft {
  enabled: boolean;
  fields: string[];
  min_confidence: number;
  greeting_default: Record<string, string>;
  greeting_personalized: Record<string, string>;
  ack_message: Record<string, string>;
}

function normalize(raw: any): IntakeConfigDraft {
  const v = raw && typeof raw === 'object' ? raw : {};
  const conf = Number(v.min_confidence);
  return {
    enabled: v.enabled === true,
    fields: Array.isArray(v.fields) && v.fields.length ? v.fields : INTAKE_FIELDS.map((f) => f.value),
    min_confidence: Number.isFinite(conf) ? conf : 0.7,
    greeting_default: v.greeting_default && typeof v.greeting_default === 'object' ? v.greeting_default : {},
    greeting_personalized:
      v.greeting_personalized && typeof v.greeting_personalized === 'object' && Object.keys(v.greeting_personalized).length
        ? v.greeting_personalized
        : DEFAULT_PERSONALIZED,
    ack_message:
      v.ack_message && typeof v.ack_message === 'object' && Object.keys(v.ack_message).length
        ? v.ack_message
        : DEFAULT_ACK,
  };
}

export function FlowIntakeSettings({ flow }: { flow: AgentFlow }) {
  const save = useSaveFlow();
  const [cfg, setCfg] = useState<IntakeConfigDraft>(() => normalize((flow as any).intake_config));

  const patch = (p: Partial<IntakeConfigDraft>) => setCfg((c) => ({ ...c, ...p }));

  const toggleField = (value: string, on: boolean) =>
    patch({ fields: on ? [...new Set([...cfg.fields, value])] : cfg.fields.filter((f) => f !== value) });

  const preview = useMemo(() => {
    const template = cfg.greeting_personalized['pt-BR'] || DEFAULT_PERSONALIZED['pt-BR'];
    return template
      .replace(/\{nome\}/g, 'Fred')
      .replace(/\{resumo\}/g, 'Vi que você já está na Espanha e que seu objetivo é estudar.')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, [cfg.greeting_personalized]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Primeira mensagem de "{flow.name}"
        </p>
        <Button
          size="sm"
          onClick={() => save.mutate({ id: flow.id, intake_config: cfg } as any)}
          disabled={save.isPending}
        >
          <Save className="h-4 w-4 mr-1" /> Salvar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Aproveitar dados da frase inicial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="font-normal">Analisar a primeira mensagem do cliente</Label>
              <p className="text-xs text-muted-foreground">
                Extrai nome, localização, intenção e datas ditas na 1ª frase, marca essas etapas como
                respondidas e retoma o fluxo na primeira pergunta pendente.
              </p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label>Campos que podem ser aproveitados</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {INTAKE_FIELDS.map((f) => (
                <label key={f.value} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={cfg.fields.includes(f.value)}
                    onCheckedChange={(v) => toggleField(f.value, v === true)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-w-xs">
            <Label>Confiança mínima (0 a 1)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={String(cfg.min_confidence)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(',', '.'));
                patch({ min_confidence: Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7 });
              }}
            />
            <p className="text-xs text-muted-foreground">
              Abaixo desse valor o dado é descartado e a pergunta é feita normalmente.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Mensagens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MultiLangField
            label="Saudação padrão (nenhum dado aproveitado)"
            hint="Deixe vazio para usar a mensagem da etapa inicial do fluxo."
            value={cfg.greeting_default}
            onChange={(v) => patch({ greeting_default: v })}
            rows={3}
          />
          <Separator />
          <MultiLangField
            label="Saudação personalizada (com dados aproveitados)"
            hint="Variáveis: {nome}, {resumo}, {intencao}, {localizacao}"
            value={cfg.greeting_personalized}
            onChange={(v) => patch({ greeting_personalized: v })}
            rows={3}
          />
          <Separator />
          <MultiLangField
            label="Reconhecimento humano após respostas abertas"
            hint="Variável: {nome}. Enviado antes da próxima pergunta quando a etapa tem essa opção ligada."
            value={cfg.ack_message}
            onChange={(v) => patch({ ack_message: v })}
            rows={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Prévia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Exemplo: “Oi. Meu nome é Fred. Estou na Espanha tem 5 dias, e quero estudar”
          </p>
          <div className="rounded-md border bg-muted/40 p-3">{preview}</div>
          <p className="text-xs text-muted-foreground">
            Depois desta saudação o agente faz a primeira pergunta do fluxo que ainda não tiver resposta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
