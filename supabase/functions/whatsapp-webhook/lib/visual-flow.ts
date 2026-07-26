// @ts-nocheck
/**
 * Ponte entre o agente de produção e o motor determinístico de fluxos visuais.
 *
 * Regra de precedência (definida pelo produto):
 *   Se o agente de produção tem um fluxo configurado (pré-handoff e/ou handoff)
 *   com etapa de INÍCIO válida, o FLUXO COMANDA o atendimento — o funil legado
 *   em código (flow-machine / turn-orchestrator / heurísticas de prompt) é
 *   ignorado até o fluxo terminar.
 *
 * Sem fluxo configurado, nada muda: o comportamento legado continua valendo.
 */

import {
  advanceFlow,
  findStartStep,
  mergeFlows,
  startFlow,
  stepKindOf,
  type FlowCapturedField,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from '../../_shared/flow-engine.ts'
import { getAgentRuntime } from './agent-runtime.ts'
import { cached } from './perf.ts'


export interface VisualFlowPlan {
  enabled: boolean
  steps: FlowStep[]
  preHandoffFlowId: string | null
  handoffFlowId: string | null
}

const EMPTY_PLAN: VisualFlowPlan = { enabled: false, steps: [], preHandoffFlowId: null, handoffFlowId: null }

async function fetchSteps(supabase: any, flowId: string | null): Promise<FlowStep[]> {
  if (!flowId) return []
  const { data, error } = await supabase
    .from('ai_agent_flow_steps')
    .select('*')
    .eq('flow_id', flowId)
    .order('order_index', { ascending: true })
  if (error) {
    console.warn('[VISUAL_FLOW] falha ao carregar etapas:', error.message)
    return []
  }
  return (data || []) as FlowStep[]
}

/**
 * Monta o grafo executável do agente de produção (pré-handoff + handoff
 * encadeados). Nunca lança: em caso de erro devolve `enabled: false`.
 */
export async function loadVisualFlowPlan(supabase: any): Promise<VisualFlowPlan> {
  try {
    const runtime = getAgentRuntime()
    if (!runtime) return EMPTY_PLAN

    const cfg = runtime.runtimeConfig || {}
    if (cfg.execute_visual_flow === false) return EMPTY_PLAN

    const preId = runtime.flowIds?.pre_handoff || runtime.flowIds?.legacy || null
    const handId = runtime.flowIds?.handoff || null
    if (!preId && !handId) return EMPTY_PLAN

    const [preSteps, handSteps] = await Promise.all([fetchSteps(supabase, preId), fetchSteps(supabase, handId)])
    const steps = mergeFlows(preSteps, handSteps)
    const start = findStartStep(steps)
    const enabled = !!start && stepKindOf(start) === 'INICIO' && steps.length > 0

    if (!enabled) {
      console.log('[VISUAL_FLOW] fluxo configurado sem etapa de INÍCIO válida — usando funil legado')
      return EMPTY_PLAN
    }

    return { enabled, steps, preHandoffFlowId: preId, handoffFlowId: handId }
  } catch (e) {
    console.warn('[VISUAL_FLOW] erro ao montar plano (fallback legado):', e instanceof Error ? e.message : e)
    return EMPTY_PLAN
  }
}

/** Executa o turno do cliente no grafo (start no 1º turno, advance depois). */
export function runVisualFlowTurn(
  plan: VisualFlowPlan,
  state: FlowRunState,
  message: string,
  lang: FlowLang,
): FlowTurnResult {
  const started = !!state?.current_step
  return started ? advanceFlow(plan.steps, state, message, lang) : startFlow(plan.steps, lang)
}

// ---------------------------------------------------------------------------
// Persistência das respostas nos campos do CRM

const YES_VALUES = new Set(['sim', 'si', 'sí', 'yes', 'oui', 'true'])

function toYesNo(value: string): 'yes' | 'no' {
  return YES_VALUES.has(String(value || '').trim().toLowerCase()) ? 'yes' : 'no'
}

/**
 * Aplica as respostas capturadas (`field_mapping`) nas tabelas do CRM.
 * Cada campo é opcional; um erro em um campo não interrompe os demais.
 */
export async function applyCapturedFields(
  supabase: any,
  params: { leadId: string; contactId: string; captured: FlowCapturedField[]; outsideProgress?: Record<string, unknown> },
): Promise<void> {
  const { leadId, contactId, captured } = params
  if (!captured?.length) return

  const contactPatch: Record<string, unknown> = {}
  const funnelPatch: Record<string, unknown> = {}
  const outside: Record<string, unknown> = { ...(params.outsideProgress || {}) }
  let outsideTouched = false

  for (const item of captured) {
    const value = String(item?.value ?? '').trim()
    switch (item.field) {
      case 'contact.full_name':
        if (value) {
          contactPatch.full_name = value
          contactPatch.name_source = 'USER_CONFIRMED'
          funnelPatch.name_confirmed = true
        }
        break
      case 'contact.email':
        if (value) {
          contactPatch.email = value
          funnelPatch.email_confirmed = true
        }
        break
      case 'funnel.interest_confirmed':
        if (value) funnelPatch.interest_confirmed = value
        break
      case 'funnel.location_known':
        funnelPatch.location_known = toYesNo(value) === 'yes' ? 'spain' : 'outside'
        break
      case 'funnel.entry_date_confirmed':
        if (value) funnelPatch.entry_date_confirmed = value
        break
      case 'funnel.empadronado_confirmed':
        funnelPatch.empadronado_confirmed = toYesNo(value) === 'yes'
        break
      case 'funnel.empadronado_city':
        if (value) funnelPatch.empadronado_city = value
        break
      case 'outside.age':
        outside.a2_age = value
        outsideTouched = true
        break
      case 'outside.europe_6m':
        outside.a3_europe_6m = toYesNo(value)
        outsideTouched = true
        break
      case 'outside.eu_family':
        outside.a4_eu_family = toYesNo(value)
        outsideTouched = true
        break
      case 'outside.remote_work':
        outside.a5_remote = toYesNo(value)
        outsideTouched = true
        break
      default:
        // Campo desconhecido: a resposta continua salva em `answers`.
        break
    }
  }

  if (outsideTouched) funnelPatch.outside_spain_progress = outside

  try {
    if (Object.keys(contactPatch).length) {
      await supabase.from('contacts').update(contactPatch).eq('id', contactId)
    }
  } catch (e) {
    console.warn('[VISUAL_FLOW] falha ao atualizar contato:', e instanceof Error ? e.message : e)
  }

  try {
    if (Object.keys(funnelPatch).length) {
      funnelPatch.updated_at = new Date().toISOString()
      await supabase.from('lead_funnel_state').update(funnelPatch).eq('lead_id', leadId)
    }
  } catch (e) {
    console.warn('[VISUAL_FLOW] falha ao atualizar funil:', e instanceof Error ? e.message : e)
  }
}
