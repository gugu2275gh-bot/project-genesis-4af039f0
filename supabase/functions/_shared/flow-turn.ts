// @ts-nocheck
/**
 * Orquestração de um turno do fluxo visual com recursos assíncronos:
 *  - checagem da resposta na base de conhecimento (por etapa)
 *  - reconhecimento humanizado gerado pela IA (por etapa)
 *
 * O motor (`advanceFlow`) continua puro e determinístico: aqui só decidimos
 * se a resposta entra como está, normalizada, ou se a etapa é reperguntada.
 */

import {
  advanceFlow,
  buildStayTurn,
  indexSteps,
  jumpToStep,
  messagesOf,
  startFlow,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'
import { ackAiEnabledFor, generateAckPhrase } from './flow-ack.ts'
import { kbCheckOf, kbInvalidMessage, runKbCheck } from './flow-kb-check.ts'

export interface FlowTurnDeps {
  /** Frase fixa de reconhecimento (aba "Primeira mensagem"). */
  ack?: string
  /** LLM usado para checagem na base e reconhecimento humanizado. */
  callLLM?: ((prompt: string) => Promise<string>) | null
  /** Busca na base de conhecimento (contexto textual). */
  kbSearch?: ((query: string) => Promise<string>) | null
  /** Prefixo dos logs (produção/sandbox). */
  logTag?: string
}

export async function advanceFlowTurn(
  steps: FlowStep[],
  state: FlowRunState,
  message: string,
  lang: FlowLang = 'pt-BR',
  deps: FlowTurnDeps = {},
): Promise<FlowTurnResult> {
  if (!state?.current_step) return startFlow(steps, lang)

  const tag = deps.logTag || '[FLOW_TURN]'
  const step = indexSteps(steps).get(state.current_step)
  if (!step) return startFlow(steps, lang)

  const question = (messagesOf(step, lang) || []).slice(-1)[0] || ''
  let effectiveMessage = message
  let workingState: FlowRunState = state

  // 1) Checagem na base de conhecimento (só quando ligada na etapa).
  const kbCfg = kbCheckOf(step)
  if (kbCfg.enabled && deps.callLLM && deps.kbSearch && String(message || '').trim()) {
    let verdict = null
    try {
      const kbContext = await deps.kbSearch(message)
      verdict = await runKbCheck({
        question,
        answer: message,
        cfg: kbCfg,
        lang,
        kbContext,
        callLLM: deps.callLLM,
      })
    } catch (e) {
      console.warn(`${tag}[KB_CHECK] erro:`, e instanceof Error ? e.message : e)
    }

    console.log(`${tag}[KB_CHECK]`, JSON.stringify({
      step: step.step_code,
      answered: !!verdict,
      valid: verdict?.valid ?? null,
      value: verdict?.value || '',
    }))

    if (verdict && !verdict.valid) {
      const tries = Number(state.kb_attempts || 0) + 1
      if (tries <= kbCfg.attempts || kbCfg.on_invalid === 'REPERGUNTAR') {
        const text = kbInvalidMessage(kbCfg, lang) || verdict.reply || question
        return buildStayTurn(step, text, workingState, { kb_attempts: tries })
      }
      if (kbCfg.on_invalid === 'ENCAMINHAR') {
        const v = (step.validation || {}) as Record<string, unknown>
        const fallbackCode = String(v.fallback_step_code || '').trim()
        const jumped = fallbackCode
          ? jumpToStep(steps, fallbackCode, { ...workingState, kb_attempts: 0 }, lang)
          : null
        if (jumped) return jumped
      }
      // SEGUIR (ou fallback inexistente): registra como veio e avança.
      workingState = { ...workingState, kb_attempts: 0 }
    } else if (verdict?.valid) {
      if (kbCfg.normalize && verdict.value) effectiveMessage = verdict.value
      workingState = { ...workingState, kb_attempts: 0 }
    }
  }

  // 2) Reconhecimento humanizado: gerado pela IA quando a etapa pedir.
  let ack = deps.ack || ''
  if (ackAiEnabledFor(step) && deps.callLLM) {
    const generated = await generateAckPhrase({
      question,
      answer: message,
      lang,
      callLLM: deps.callLLM,
    })
    if (generated) ack = generated
  }

  return advanceFlow(steps, workingState, effectiveMessage, lang, { ack })
}
