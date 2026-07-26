import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Upload } from 'lucide-react';
import { parseBizagiBpmn, type ImportedFlow } from '@/lib/bizagi-bpmn-import';
import { normalizeBranches } from '@/types/ai-agent-flow-builder';
import type { FlowPhase } from '@/types/ai-agents';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  flowId: string;
  phase: FlowPhase;
  currentCount: number;
  onImport: (result: ImportedFlow, mode: 'REPLACE' | 'APPEND') => void;
}

export function ImportBizagiDialog({
  open,
  onOpenChange,
  flowId,
  phase,
  currentCount,
  onImport,
}: Props) {
  const [result, setResult] = useState<ImportedFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const [fileName, setFileName] = useState('');

  const reset = () => {
    setResult(null);
    setError(null);
    setFileName('');
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    setResult(null);
    if (/\.bpm$/i.test(file.name)) {
      setError(
        'O arquivo .bpm é o formato nativo do Bizagi e não pode ser lido. No Bizagi Modeler use "Exportar > BPMN 2.0" e envie o arquivo .bpmn ou .xml.',
      );
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseBizagiBpmn(text, {
        flowId,
        phase,
        startIndex: mode === 'APPEND' ? currentCount : 0,
      });
      setResult(parsed);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível ler o arquivo.');
    }
  };

  const confirm = () => {
    if (!result) return;
    onImport(result, mode);
    toast.success(`${result.steps.length} etapa(s) importada(s). Clique em "Salvar fluxo" para gravar.`);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar fluxo do Bizagi</DialogTitle>
          <DialogDescription>
            No Bizagi Modeler use <strong>Exportar &gt; BPMN 2.0</strong> e envie o arquivo .bpmn ou .xml.
            Tarefas viram etapas, gateways viram ramificações e os rótulos das setas viram condições.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Arquivo BPMN</Label>
            <input
              type="file"
              accept=".bpmn,.xml,.bpm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
            />
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>

          <div className="space-y-2">
            <Label>Como aplicar</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="REPLACE" id="imp-replace" />
                <Label htmlFor="imp-replace" className="font-normal">
                  Substituir todas as etapas atuais ({currentCount})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="APPEND" id="imp-append" />
                <Label htmlFor="imp-append" className="font-normal">
                  Adicionar ao fluxo atual
                </Label>
              </div>
            </RadioGroup>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {result.processName} — {result.steps.length} etapa(s) detectada(s)
              </p>
              {result.warnings.map((w, i) => (
                <Alert key={i}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{w}</AlertDescription>
                </Alert>
              ))}
              <ScrollArea className="h-56 rounded-md border p-3">
                <div className="space-y-2">
                  {result.steps.map((s) => {
                    const branches = normalizeBranches((s as any).branches);
                    return (
                      <div key={s.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{s.step_code}</span>
                          <span className="font-medium">{s.name}</span>
                        </div>
                        {branches.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {branches.map((b) => (
                              <Badge key={b.id} variant="secondary" className="text-[10px]">
                                {b.label} → {b.next_step_code || '—'}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            Próxima: {s.next_step_code || 'fim do fluxo'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!result} onClick={confirm}>
            <Upload className="h-4 w-4 mr-1" /> Importar etapas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
