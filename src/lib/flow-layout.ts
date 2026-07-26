import type { AgentFlowStep } from '@/types/ai-agents';
import { outgoingCodes } from '@/lib/flow-validation';

export const NODE_WIDTH = 260;
const X_GAP = 320;
const Y_GAP = 170;

/** Layout em cascata: nível pelo caminho mais curto a partir das etapas iniciais. */
export function autoLayout(steps: AgentFlowStep[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  if (steps.length === 0) return positions;

  const byCode = new Map(steps.map((s) => [s.step_code, s]));
  const targeted = new Set<string>();
  steps.forEach((s) => outgoingCodes(s).forEach((c) => targeted.add(c)));

  const ordered = [...steps].sort((a, b) => a.order_index - b.order_index);
  const roots = ordered.filter((s) => !targeted.has(s.step_code));
  const start = roots.length ? roots : ordered.slice(0, 1);

  const level = new Map<string, number>();
  const queue: string[] = start.map((s) => s.step_code);
  start.forEach((s) => level.set(s.step_code, 0));

  while (queue.length) {
    const code = queue.shift()!;
    const step = byCode.get(code);
    if (!step) continue;
    outgoingCodes(step).forEach((next) => {
      if (!byCode.has(next) || level.has(next)) return;
      level.set(next, (level.get(code) ?? 0) + 1);
      queue.push(next);
    });
  }

  let orphanLevel = Math.max(0, ...Array.from(level.values())) + 1;
  ordered.forEach((s) => {
    if (!level.has(s.step_code)) level.set(s.step_code, orphanLevel++);
  });

  const perLevel = new Map<number, number>();
  ordered.forEach((s) => {
    const l = level.get(s.step_code) ?? 0;
    const idx = perLevel.get(l) ?? 0;
    perLevel.set(l, idx + 1);
    positions[s.step_code] = { x: l * X_GAP, y: idx * Y_GAP };
  });

  return positions;
}
