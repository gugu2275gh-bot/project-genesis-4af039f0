// @ts-nocheck
/**
 * Turn Orchestrator — pipeline determinístico de processamento de mensagem.
 *
 * Implementa explicitamente a sequência prescrita pelo refator:
 *   1. localizar conversa  (caller fornece state+contact)
 *   2. recuperar current_step
 *   3. validar resposta da etapa atual
 *   4. salvar resposta em `answers`
 *   5. atualizar perfil (delegado aos triggers existentes + applyTurnUpdates)
 *   6. calcular próxima etapa (flow-machine — NUNCA o LLM)
 *   7. retornar instrução para o redator (LLM gera apenas o texto)
 *
 * Esta camada é PURA e TESTÁVEL: recebe estado, devolve decisão. Os efeitos
 * de banco continuam acontecendo via `applyTurnUpdates`/`mergeOutsideProgress`
 * do `funnel-state.ts` existente, mantendo total compatibilidade.
 */

import type { FunnelState } from './funnel-state.ts'
import { applyTurnUpdates } from './funnel-state.ts'
import { classifyOffTopic } from './offtopic.ts'
import {
  getStepDef,
  resolveCurrentStep,
  toCadastroStep,
  type StepCode,
} from './flow-machine.ts'
import type { ConversationContext } from './conversation-context.ts'

export type TurnAction =
  | { kind: 'park_offtopic'; question_text: string; offtopic_kind: 'question' | 'request' }
  | { kind: 'reask_current'; step: StepCode; reason: string }
  | { kind: 'advance'; from: StepCode; to: StepCode; value: unknown }
  | { kind: 'pass_through'; step: StepCode } // etapa delegada a handler legado
  | { kind: 'free_mode'; reason: 'handoff_sent' | 'step_livre'; parked?: { question_text: string; offtopic_kind: 'question' | 'request' } }

export interface TurnDecision {
  current_step: StepCode
  next_step: StepCode
  action: TurnAction
  /** Patch a aplicar em `lead_funnel_state` (delegado a `applyTurnUpdates`). */
  state_patch: Partial<FunnelState> & { answers?: Record<string, unknown> }
}

/**
 * Decide o que fazer com a mensagem atual. NÃO chama o LLM nem o banco —
 * apenas computa a decisão. O caller persiste via `applyTurnDecision`.
 */
export function decideTurn(
  ctx: ConversationContext,
  rawMessage: string,
): TurnDecision {
  const current_step = ctx.current_step
  const def = getStepDef(current_step)

  // ============================================================
  // GUARD FREE MODE — quando o handoff já foi enviado ou o funil
  // marcou `step='livre'`, NUNCA reabrir etapas do cadastro. Nesse
  // regime o bot só responde (KB/humano) e parqueia off-topics; ele
  // não valida, não avança e não re-pergunta campos do funil.
  // ============================================================
  const inFreeMode = !!(ctx.state?.handoff_sent) || ctx.state?.step === 'livre'
  if (inFreeMode) {
    const reason: 'handoff_sent' | 'step_livre' = ctx.state?.handoff_sent ? 'handoff_sent' : 'step_livre'
    const offtopic = classifyOffTopic(rawMessage, '', {
      collectionGateActive: false,
      currentStep: undefined,
    })
    if (offtopic) {
      return {
        current_step,
        next_step: current_step,
        action: {
          kind: 'free_mode',
          reason,
          parked: { question_text: rawMessage, offtopic_kind: offtopic.kind },
        },
        state_patch: {
          pending_questions: [
            ...(ctx.pending_questions || []),
            { text: rawMessage, ts: new Date().toISOString(), kind: offtopic.kind },
          ] as any,
        },
      }
    }
    return {
      current_step,
      next_step: current_step,
      action: { kind: 'free_mode', reason },
      state_patch: {},
    }
  }


  // Etapas legadas (Inside/Outside aprofundamento, handoff) continuam sendo
  // tratadas pelo pipeline existente — pass_through sinaliza isso.
  if (def.answerType === 'free' || (def.ask(ctx.language) === '' && current_step !== 'ABERTURA')) {
    return {
      current_step,
      next_step: current_step,
      action: { kind: 'pass_through', step: current_step },
      state_patch: {},
    }
  }

  // 1) Classificar off-topic com a autoridade da etapa atual.
  const cadastroStep = toCadastroStep(current_step)
  const offtopic = classifyOffTopic(rawMessage, def.ask(ctx.language), {
    collectionGateActive: true,
    currentStep: cadastroStep || undefined,
  })

  if (offtopic) {
    return {
      current_step,
      next_step: current_step, // permanece na mesma etapa
      action: {
        kind: 'park_offtopic',
        question_text: rawMessage,
        offtopic_kind: offtopic.kind,
      },
      state_patch: {
        pending_questions: [
          ...(ctx.pending_questions || []),
          { text: rawMessage, ts: new Date().toISOString(), kind: offtopic.kind },
        ] as any,
      },
    }
  }

  // 2) Validar resposta da etapa atual.
  const validation = def.validate(rawMessage, ctx.state)
  if (!validation.valid) {
    return {
      current_step,
      next_step: current_step,
      action: { kind: 'reask_current', step: current_step, reason: validation.reason || 'invalid' },
      state_patch: {},
    }
  }

  // 3) Calcular próxima etapa deterministicamente.
  const next_step = def.next(ctx.state, validation.value)

  // 4) Montar patch — grava em `answers` + flags dedicadas para compat com
  //    `computeNextStep` do `funnel-state.ts`.
  const answers = { ...(ctx.state.answers || {}), [current_step]: { value: validation.value, ts: new Date().toISOString() } }
  const patch: Partial<FunnelState> & { answers?: Record<string, unknown> } = { answers }
  switch (current_step) {
    case 'NAME':
      patch.name_confirmed = true
      break
    case 'EMAIL':
      patch.email_confirmed = true
      break
    case 'INTEREST':
      patch.interest_confirmed = String(validation.value)
      break
    case 'LOCATION':
      patch.location_known = validation.value as any
      ;(patch as any).branch = validation.value === 'spain' ? 'INSIDE' : 'OUTSIDE'
      break
  }

  return {
    current_step,
    next_step,
    action: { kind: 'advance', from: current_step, to: next_step, value: validation.value },
    state_patch: patch,
  }
}

/** Aplica a decisão no banco via `applyTurnUpdates` existente. */
export async function applyTurnDecision(
  supabase: any,
  state: FunnelState,
  decision: TurnDecision,
): Promise<FunnelState> {
  if (Object.keys(decision.state_patch).length === 0) return state
  return await applyTurnUpdates(supabase, state, decision.state_patch as any, {
    override_applied: `flow-machine:${decision.action.kind}`,
  })
}
