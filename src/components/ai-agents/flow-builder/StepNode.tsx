import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, MessageSquare, UserCheck, SkipForward, Trash2 } from 'lucide-react';
import { ANSWER_TYPES, type AgentFlowStep } from '@/types/ai-agents';
import {
  STEP_KINDS,
  messageCount,
  messageList,
  normalizeBranches,
  normalizeValidation,
  stepKindOf,
} from '@/types/ai-agent-flow-builder';

export type StepNodeData = {
  step: AgentFlowStep;
  selected?: boolean;
  hasIssue?: boolean;
  onDelete?: (id: string) => void;
};

function StepNodeComponent({ data, selected, id }: NodeProps) {
  const { step, hasIssue, onDelete } = data as unknown as StepNodeData;
  const branches = normalizeBranches((step as any).branches);
  const validation = normalizeValidation(step.validation);
  const kind = stepKindOf(step);
  const msgs = messageList(step.messages as any, 'pt-BR');
  const message = msgs[0] || step.message || '';
  const extra = Math.max(0, messageCount(step.messages as any) - 1);


  return (
    <div
      className={cn(
        'group w-[260px] rounded-lg border bg-card shadow-sm transition-colors',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        hasIssue && 'border-destructive/60',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !h-2 !w-2" />
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground truncate">{step.step_code}</span>
          <div className="flex items-center gap-1">
            {hasIssue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            {step.handoff && <UserCheck className="h-3.5 w-3.5 text-primary" />}
            {validation.skip_mode && validation.skip_mode !== 'NUNCA' && (
              <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {onDelete && (
              <button
                type="button"
                title="Excluir etapa"
                aria-label="Excluir etapa"
                className="nodrag opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm font-medium truncate">{step.name || 'Sem nome'}</p>
      </div>


      <div className="px-3 py-2 space-y-2">
        <p className="text-xs text-muted-foreground line-clamp-2 flex gap-1">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{message || 'Sem mensagem definida'}</span>
        </p>
        {extra > 0 && (
          <p className="text-[10px] text-muted-foreground">+ {extra} mensagem(ns) em sequência</p>
        )}
        <div className="flex flex-wrap gap-1">
          <Badge variant={kind === 'PERGUNTA' ? 'secondary' : 'default'} className="text-[10px]">
            {STEP_KINDS.find((k) => k.value === kind)?.label || kind}
          </Badge>
          {kind === 'PERGUNTA' && (
            <Badge variant="secondary" className="text-[10px]">
              {ANSWER_TYPES.find((t) => t.value === step.answer_type)?.label || step.answer_type}
            </Badge>
          )}
          {kind === 'PERGUNTA' && validation.required === false && (
            <Badge variant="outline" className="text-[10px]">Opcional</Badge>
          )}
        </div>
      </div>


      <div className="border-t">
        {branches.map((b, i) => (
          <div key={b.id} className="relative flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="truncate">{b.label || b.value || `Resposta ${i + 1}`}</span>
            <Handle
              id={`branch-${b.id}`}
              type="source"
              position={Position.Right}
              style={{ top: '50%' }}
              className="!bg-primary !h-2 !w-2"
            />
          </div>
        ))}
        <div className="relative flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
          <span>{branches.length ? 'Senão (padrão)' : 'Próxima etapa'}</span>
          <Handle
            id="default"
            type="source"
            position={Position.Right}
            style={{ top: '50%' }}
            className="!bg-muted-foreground !h-2 !w-2"
          />
        </div>
      </div>
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
