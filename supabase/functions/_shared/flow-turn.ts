// @ts-nocheck
/**
 * Orquestração de um turno do fluxo visual com recursos assíncronos:
 *  - checagem da resposta na base de conhecimento (por etapa)
 *  - reconhecimento humanizado gerado pela IA (por etapa)
 *  - "responde e volta na hora": dúvida fora do tema é respondida pela base e
 *    a pergunta da etapa é retomada na MESMA mensagem
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
import { answerAside, composeAnswerAndReask, defaultAsideAck, looksLikeQuestion } from './flow-answer-reask.ts'

/** Nenhum recurso opcional pode segurar o turno além disto. */
const ASSIST_TIMEOUT_MS = 6000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    p.catch((e) => {
      console.warn(`[FLOW_TURN] ${label} falhou:`, e instanceof Error ? e.message : e)
      return null
    }),
    new Promise<null>((resolve) => setTimeout(() => {
      console.warn(`[FLOW_TURN] ${label} excedeu ${ms}ms — seguindo sem esperar`)
      resolve(null)
    }, ms)),
  ])
}

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
  const text = String(message || '').trim()
  let effectiveMessage = message
  let workingState: FlowRunState = state

  // Recursos opcionais rodam EM PARALELO (base + reconhecimento + resposta à
  // dúvida), com timeout curto: nenhum deles pode atrasar a retomada do fluxo.
  const kbCfg = kbCheckOf(step)
  const wantsKbCheck = kbCfg.enabled && !!deps.callLLM && !!deps.kbSearch && !!text
  const wantsAck = ackAiEnabledFor(step) && !!deps.callLLM
  const wantsAside = !!deps.callLLM && !!deps.kbSearch && looksLikeQuestion(text)

  const kbContextP = (wantsKbCheck || wantsAside) && deps.kbSearch
    ? withTimeout(Promise.resolve(deps.kbSearch(text)), ASSIST_TIMEOUT_MS, 'kb_search')
    : Promise.resolve(null)

  const [kbContext, ackGenerated] = await Promise.all([
    kbContextP,
    wantsAck
      ? withTimeout(
        generateAckPhrase({ question, answer: message, lang, callLLM: deps.callLLM }),
        ASSIST_TIMEOUT_MS,
        'ack_ai',
      )
      : Promise.resolve(null),
  ])

  const [verdict, aside] = await Promise.all([
    wantsKbCheck && kbContext
      ? withTimeout(
        runKbCheck({ question, answer: message, cfg: kbCfg, lang, kbContext, callLLM: deps.callLLM }),
        ASSIST_TIMEOUT_MS,
        'kb_check',
      )
      : Promise.resolve(null),
    wantsAside && kbContext
      ? withTimeout(
        answerAside({ question: text, lang, kbContext, callLLM: deps.callLLM }),
        ASSIST_TIMEOUT_MS,
        'answer_aside',
      )
      : Promise.resolve(null),
  ])

  // 1) Checagem na base de conhecimento (só quando ligada na etapa).
  if (wantsKbCheck) {
    console.log(`${tag}[KB_CHECK]`, JSON.stringify({
      step: step.step_code,
      answered: !!verdict,
      valid: verdict?.valid ?? null,
      value: verdict?.value || '',
    }))

    if (verdict && !verdict.valid) {
      const tries = Number(state.kb_attempts || 0) + 1
      if (tries <= kbCfg.attempts || kbCfg.on_invalid === 'REPERGUNTAR') {
        const msg = kbInvalidMessage(kbCfg, lang) || verdict.reply || question
        return buildStayTurn(step, msg, workingState, { kb_attempts: tries })
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
  const ack = ackGenerated || deps.ack || ''

  const turn = advanceFlow(steps, workingState, effectiveMessage, lang, { ack })

  // 3) "Responde e volta na hora": o fluxo ficou na mesma etapa por causa de
  // uma dúvida do cliente → resposta curta + pergunta na MESMA mensagem.
  if (turn.reasked && wantsAside) {
    const answer = aside || defaultAsideAck(lang)
    const outbound = (turn.outbound || []).slice()
    if (outbound.length) {
      outbound[0] = { ...outbound[0], text: composeAnswerAndReask(answer, outbound[0].text, lang) }
      console.log(`${tag}[ANSWER_REASK]`, JSON.stringify({
        step: step.step_code,
        from_kb: !!aside,
      }))
      return { ...turn, outbound, messages: outbound.map((o) => o.text) }
    }
  }

  return turn
}
