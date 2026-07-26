import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import {
  PROMPT_BLOCK_TABS,
  type PromptBlock,
  type PromptBlockTab,
} from '@/lib/agent-prompt-blocks';

interface Props {
  blocks: PromptBlock[];
  onChange: (blocks: PromptBlock[]) => void;
  /** Quando informado, mostra apenas os blocos daquela aba. */
  filterTab?: PromptBlockTab;
  disabled?: boolean;
  /** Permite mover, criar, excluir e trocar a aba do bloco. */
  allowStructureEdit?: boolean;
}

/**
 * Editor dos blocos que compõem o prompt do fluxo.
 * Cada bloco corresponde a uma seção `## TÍTULO` do prompt final.
 */
export function PromptBlocksEditor({
  blocks,
  onChange,
  filterTab,
  disabled,
  allowStructureEdit = false,
}: Props) {
  const visible = filterTab ? blocks.filter((b) => b.tab === filterTab) : blocks;

  const update = (id: string, patch: Partial<PromptBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  const add = () =>
    onChange([
      ...blocks,
      {
        id: `bloco-${Date.now()}`,
        title: 'NOVO BLOCO',
        content: '',
        tab: filterTab || 'producao',
      },
    ]);

  if (visible.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Nenhum bloco nesta aba. Use "Sincronizar configuração de produção" para importar o prompt
          atual ou crie um bloco.
        </p>
        {allowStructureEdit && (
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
            <Plus className="h-4 w-4 mr-1" /> Novo bloco
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((block) => (
        <Card key={block.id}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Label className="text-xs text-muted-foreground">Título do bloco</Label>
                <Input
                  value={block.title}
                  disabled={disabled || !allowStructureEdit}
                  onChange={(e) => update(block.id, { title: e.target.value })}
                />
              </div>
              {allowStructureEdit && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Aba</Label>
                  <Select
                    value={block.tab}
                    disabled={disabled}
                    onValueChange={(v) => update(block.id, { tab: v as PromptBlockTab })}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROMPT_BLOCK_TABS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {allowStructureEdit && (
                <div className="flex items-center gap-1 pt-7">
                  <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => move(block.id, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => move(block.id, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => remove(block.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
            <Textarea
              rows={8}
              className="font-mono text-xs"
              disabled={disabled}
              value={block.content}
              onChange={(e) => update(block.id, { content: e.target.value })}
            />
          </CardContent>
        </Card>
      ))}
      {allowStructureEdit && (
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="h-4 w-4 mr-1" /> Novo bloco
        </Button>
      )}
    </div>
  );
}
