import type { AgentFlowStep } from '@/types/ai-agents';
import { normalizeBranches, type FlowIssue } from '@/types/ai-agent-flow-builder';

/** Todas as saídas de uma etapa (ramificações + caminho padrão). */
export function outgoingCodes(step: AgentFlowStep): string[] {
  const codes = normalizeBranches((step as any).branches)
    .map((b) => b.next_step_code)
    .filter(Boolean) as string[];
  if (step.next_step_code) codes.push(step.next_step_code);
  return Array.from(new Set(codes));
}

function findCycles(steps: AgentFlowStep[]): string[][] {
  const byCode = new Map(steps.map((s) => [s.step_code, s]));
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (code: string) => {
    const st = state.get(code);
    if (st === 1) {
      const idx = stack.indexOf(code);
      if (idx >= 0) cycles.push([...stack.slice(idx), code]);
      return;
    }
    if (st === 2) return;
    state.set(code, 1);
    stack.push(code);
    const step = byCode.get(code);
    if (step) outgoingCodes(step).forEach((next) => byCode.has(next) && visit(next));
    stack.pop();
    state.set(code, 2);
  };

  steps.forEach((s) => visit(s.step_code));
  return cycles;
}

/** Analisa o desenho do fluxo e devolve problemas encontrados. */
export function validateFlow(steps: AgentFlowStep[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (steps.length === 0) return issues;

  const codes = steps.map((s) => s.step_code);
  const seen = new Set<string>();
  codes.forEach((c) => {
    if (!c?.trim()) {
      issues.push({ level: 'error', message: 'Existe uma etapa sem código.' });
    } else if (seen.has(c)) {
      issues.push({ level: 'error', message: `Código de etapa duplicado: "${c}".`, stepCode: c });
    } else {
      seen.add(c);
    }
  });

  const targeted = new Set<string>();
  steps.forEach((s) => {
    outgoingCodes(s).forEach((code) => {
      targeted.add(code);
      if (!seen.has(code)) {
        issues.push({
          level: 'error',
          message: `A etapa "${s.step_code}" aponta para "${code}", que não existe.`,
          stepCode: s.step_code,
        });
      }
    });

    normalizeBranches((s as any).branches).forEach((b) => {
      if (!b.next_step_code) {
        issues.push({
          level: 'warning',
          message: `A resposta "${b.label || b.value || 'sem rótulo'}" da etapa "${s.step_code}" não tem destino.`,
          stepCode: s.step_code,
        });
      }
    });

    if (outgoingCodes(s).length === 0 && !s.handoff) {
      issues.push({
        level: 'warning',
        message: `A etapa "${s.step_code}" não tem próxima etapa nem encaminhamento para humano.`,
        stepCode: s.step_code,
      });
    }
  });

  const ordered = [...steps].sort((a, b) => a.order_index - b.order_index);
  ordered.slice(1).forEach((s) => {
    if (!targeted.has(s.step_code)) {
      issues.push({
        level: 'warning',
        message: `A etapa "${s.step_code}" não é alcançada por nenhuma outra etapa.`,
        stepCode: s.step_code,
      });
    }
  });

  findCycles(steps).forEach((cycle) => {
    issues.push({
      level: 'error',
      message: `Ciclo detectado (risco de loop infinito): ${cycle.join(' → ')}.`,
      stepCode: cycle[0],
    });
  });

  return issues;
}
