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
  generalCaptureOf,
  indexSteps,
  isGeneralCaptureStep,
  jumpToStep,
  messagesOf,
  startFlow,
  type FlowCapturedField,
  type FlowLang,
  type FlowRunState,
  type FlowStep,
  type FlowTurnResult,
} from './flow-engine.ts'
import { runGeneralCapture } from './flow-intake.ts'
import { ackAiEnabledFor, generateAckPhrase } from './flow-ack.ts'
import {
  MAX_REQUIRED_ATTEMPTS,
  applyRequiredGate,
  knownFieldsOf,
  missingRequired,
  requiredPrompt,
} from './flow-required.ts'

import { kbCheckOf, kbInvalidMessage, runKbCheck } from './flow-kb-check.ts'
import { answerAside, composeAnswerAndReask, defaultAsideAck, looksLikeQuestion } from './flow-answer-reask.ts'

/** Nenhum recurso opcional pode segurar o turno além disto. */
const ASSIST_TIMEOUT_MS = 6000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: number | undefined
  const guard = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[FLOW_TURN] ${label} excedeu ${ms}ms — seguindo sem esperar`)
      resolve(null)
    }, ms)
  })
  return Promise.race([
    p.catch((e) => {
      console.warn(`[FLOW_TURN] ${label} falhou:`, e instanceof Error ? e.message : e)
      return null
    }),
    guard,
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
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

  // 0) Campo obrigatório em aberto numa "Pergunta geral": a mensagem do
  // cliente é a resposta desse campo específico. Só depois de completar todos
  // os obrigatórios o fluxo segue (e só então transfere para o humano).
  const pendingField = String(state.required_field || '').trim()
  if (pendingField && isGeneralCaptureStep(step)) {
    const general = generalCaptureOf(step)
    const target = general.fields.find((f: any) => f.target_field === pendingField)
    let value = ''
    let extraValues: Record<string, string> = {}
    if (text && deps.callLLM) {
      // Interpreta TODOS os campos da etapa: grava o obrigatório pendente e
      // aproveita o que mais vier junto ("Fred, moro em Recife").
      const capture = await withTimeout(
        runGeneralCapture({
          message: text,
          steps,
          fields: general.fields?.length ? general.fields : (target ? [target] : []),
          minConfidence: general.min_confidence,
          callLLM: deps.callLLM,
        }),
        ASSIST_TIMEOUT_MS,
        'required_capture',
      )
      extraValues = { ...(capture?.fieldValues || {}) }
      value = String(extraValues[pendingField] || '').trim()
    }
    if (!value && text) value = text

    let capturedFields = {
      ...((state.captured_fields || {}) as Record<string, string>),
      ...extraValues,
    }
    const skipped = [...((state.required_skipped || []) as string[])]
    const captured: FlowCapturedField[] = Object.entries(extraValues)
      .filter(([field, v]) => field !== pendingField && String(v || '').trim())
      .map(([field, v]) => ({ step_code: step.step_code, field, value: String(v) }))
    if (value) {
      capturedFields[pendingField] = value
      captured.push({ step_code: step.step_code, field: pendingField, value })
    } else {
      const tries = Number(state.required_attempts || 0) + 1
      if (tries <= MAX_REQUIRED_ATTEMPTS) {
        return buildStayTurn(step, requiredPrompt(target || { source: pendingField, target_field: pendingField }, lang), workingState, {
          required_attempts: tries,
        })
      }
      skipped.push(pendingField)
    }

    workingState = {
      ...workingState,
      captured_fields: capturedFields,
      required_skipped: skipped,
      required_field: '',
      required_attempts: 0,
    }

    const known = knownFieldsOf(steps, workingState)
    const stillMissing = missingRequired(step, known, skipped)
    console.log(`${tag}[REQUIRED_FIELD]`, JSON.stringify({
      step: step.step_code,
      field: pendingField,
      saved: !!value,
      missing: stillMissing.map((f) => f.target_field),
    }))

    if (stillMissing.length) {
      const next = stillMissing[0]
      const stay = buildStayTurn(step, requiredPrompt(next, lang), workingState, {
        required_field: next.target_field,
        required_attempts: 0,
      })
      return { ...stay, captured }
    }

    // Todos os obrigatórios respondidos: fecha a etapa com o resumo do que
    // foi entendido e segue o fluxo normalmente.
    const summary = general.fields
      .map((f: any) => {
        const v = String(known[f.target_field] || '').trim()
        return v ? `${f.source}: ${v}` : ''
      })
      .filter(Boolean)
      .join('; ')
    const turn = advanceFlow(steps, workingState, summary || text || 'ok', lang, { ack: deps.ack || '' })
    return applyRequiredGate(steps, {
      ...turn,
      captured: [...(turn.captured || []), ...captured],
      state: { ...turn.state, aside_attempts: 0 },
    }, lang)
  }

  // Recursos opcionais rodam EM PARALELO (base + reconhecimento), com timeout
  // curto: nenhum deles pode atrasar a retomada do fluxo.
  const kbCfg = kbCheckOf(step)
  const wantsKbCheck = kbCfg.enabled && !!deps.callLLM && !!deps.kbSearch && !!text
  const wantsAck = ackAiEnabledFor(step) && !!deps.callLLM
  // A "resposta e retomada" só é possível quando há LLM + base e a mensagem
  // parece uma dúvida — mas só é EXECUTADA se o fluxo realmente reperguntar.
  const canAside = !!deps.callLLM && !!deps.kbSearch && looksLikeQuestion(text)

  const [kbContext, ackGenerated] = await Promise.all([
    wantsKbCheck && deps.kbSearch
      ? withTimeout(Promise.resolve(deps.kbSearch(text)), ASSIST_TIMEOUT_MS, 'kb_search')
      : Promise.resolve(null),
    wantsAck
      ? withTimeout(
        generateAckPhrase({ question, answer: message, lang, callLLM: deps.callLLM }),
        ASSIST_TIMEOUT_MS,
        'ack_ai',
      )
      : Promise.resolve(null),
  ])

  const verdict = wantsKbCheck && kbContext
    ? await withTimeout(
      runKbCheck({ question, answer: message, cfg: kbCfg, lang, kbContext, callLLM: deps.callLLM }),
      ASSIST_TIMEOUT_MS,
      'kb_check',
    )
    : null


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

  // 3) "Responde e volta na hora": a mensagem é uma dúvida, não a resposta da
  // etapa. Respondemos pela base e repetimos a pergunta na MESMA bolha, sem
  // gravar a dúvida como resposta. Uma vez por etapa, para nunca criar laço.
  const asideTries = Number(state.aside_attempts || 0)
  if (canAside && asideTries < 1) {
    const ctx = kbContext ?? (await withTimeout(
      Promise.resolve(deps.kbSearch(text)),
      ASSIST_TIMEOUT_MS,
      'kb_search_aside',
    ))
    const aside = ctx
      ? await withTimeout(
        answerAside({ question: text, lang, kbContext: ctx, callLLM: deps.callLLM }),
        ASSIST_TIMEOUT_MS,
        'answer_aside',
      )
      : null
    const answer = aside || defaultAsideAck(lang)
    console.log(`${tag}[ANSWER_REASK]`, JSON.stringify({
      step: step.step_code,
      from_kb: !!aside,
    }))
    return buildStayTurn(
      step,
      composeAnswerAndReask(answer, question, lang),
      workingState,
      { aside_attempts: asideTries + 1 },
    )
  }

  // 4) "Pergunta geral": interpreta a resposta aberta, grava vários campos e
  // marca como respondidas as etapas que perguntariam os mesmos dados.
  const general = generalCaptureOf(step)
  let generalCaptured: FlowCapturedField[] = []
  if (general.enabled && deps.callLLM && text) {
    const capture = await withTimeout(
      runGeneralCapture({
        message: text,
        steps,
        fields: general.fields,
        minConfidence: general.min_confidence,
        callLLM: deps.callLLM,
      }),
      ASSIST_TIMEOUT_MS,
      'general_capture',
    )
    console.log(`${tag}[GENERAL_CAPTURE]`, JSON.stringify({
      step: step.step_code,
      reason: capture?.reason || 'timeout',
      fields: capture?.fieldValues || {},
      steps: Object.keys(capture?.prefilled || {}),
    }))

    if (capture && Object.keys(capture.fieldValues).length) {
      generalCaptured = Object.entries(capture.fieldValues).map(([field, value]) => ({
        step_code: step.step_code,
        field,
        value,
      }))
      workingState = {
        ...workingState,
        captured_fields: {
          ...((workingState.captured_fields || {}) as Record<string, string>),
          ...capture.fieldValues,
        },
      }
      const prefilled = { ...(capture.prefilled || {}) }
      delete prefilled[step.step_code]
      if (Object.keys(prefilled).length) {
        workingState = {
          ...workingState,
          answers: { ...(workingState.answers || {}), ...prefilled },
        }
      }
    }
  }

  // Campos obrigatórios da "Pergunta geral" ainda em falta: pergunta um por
  // vez, aproveitando tudo que já foi entendido, antes de seguir.
  if (isGeneralCaptureStep(step)) {
    const skipped = (workingState.required_skipped || []) as string[]
    const known = knownFieldsOf(steps, workingState)
    const pending = missingRequired(step, known, skipped)
    if (pending.length) {
      const next = pending[0]
      const stay = buildStayTurn(step, requiredPrompt(next, lang), workingState, {
        required_field: next.target_field,
        required_attempts: 0,
      })
      return { ...stay, captured: generalCaptured }
    }
  }

  const turn = advanceFlow(steps, workingState, effectiveMessage, lang, { ack })
  const withCapture = generalCaptured.length
    ? { ...turn, captured: [...(turn.captured || []), ...generalCaptured] }
    : turn

  // Etapa mudou: zera o contador de dúvidas respondidas.
  const finalTurn = withCapture.state?.current_step !== state.current_step
    ? { ...withCapture, state: { ...withCapture.state, aside_attempts: 0 } }
    : withCapture

  // A próxima etapa também pode ser uma "Pergunta geral" com obrigatórios.
  return applyRequiredGate(steps, finalTurn, lang)
}


