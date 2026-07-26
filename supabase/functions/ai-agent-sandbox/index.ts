// @ts-nocheck
// Sandbox de teste dos Agentes de IA.
// NÃO envia mensagens reais pelo WhatsApp e NÃO utiliza Twilio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { buildSystemPrompt } from './lib/prompt-builder.ts'
import { advanceFlow, findStartStep, startFlow, stepKindOf } from '../_shared/flow-engine.ts'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'missing auth', status: 401 }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error } = await authClient.auth.getUser(token)
  if (error || !userData?.user) return { error: 'invalid token', status: 401 }

  const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: roles } = await service
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
  const isAdmin = (roles || []).some((r: any) => r.role === 'ADMIN')
  if (!isAdmin) return { error: 'forbidden', status: 403 }
  return { userId: userData.user.id, service }
}

async function callGemini(model: string, systemPrompt: string, history: any[], temperature: number, maxTokens: number) {
  const key = Deno.env.get('CBAsesoria_Key')
  if (!key) throw new Error('CBAsesoria_Key não configurada')
  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: maxTokens,
  }
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: history.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig,
      }),
    },
  )
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`)
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || ''
  return { text, tokens: data?.usageMetadata?.totalTokenCount ?? null }
}

async function callOpenAICompatible(
  provider: 'openai' | 'lovable',
  model: string,
  systemPrompt: string,
  history: any[],
  temperature: number,
  maxTokens: number,
) {
  const keyName = provider === 'lovable' ? 'LOVABLE_API_KEY' : 'OPENAI_API_KEY'
  const key = Deno.env.get(keyName)
  if (!key) throw new Error(`${keyName} não configurada`)
  const endpoint =
    provider === 'lovable'
      ? 'https://ai.gateway.lovable.dev/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions'
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    ],
    max_tokens: maxTokens,
    temperature,
  }
  if (provider === 'lovable' && model.startsWith('openai/gpt-5.6')) payload.reasoning_effort = 'none'
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`)
  return {
    text: data?.choices?.[0]?.message?.content || '',
    tokens: data?.usage?.total_tokens ?? null,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = await requireAdmin(req)
    if ('error' in auth) return json({ error: auth.error }, auth.status)
    const service = auth.service

    const { session_id, message } = await req.json()
    if (!session_id || !message?.trim()) return json({ error: 'session_id e message são obrigatórios' }, 400)

    const { data: session, error: sessErr } = await service
      .from('ai_agent_test_sessions')
      .select('id, agent_id, agent_version_id, flow_state')
      .eq('id', session_id)
      .single()
    if (sessErr || !session) return json({ error: 'sessão não encontrada' }, 404)

    const { data: agent, error: agentErr } = await service
      .from('ai_agents')
      .select('*')
      .eq('id', session.agent_id)
      .single()
    if (agentErr || !agent) return json({ error: 'agente não encontrado' }, 404)

    // Se uma versão foi selecionada, usa o snapshot dela
    let config: any = agent
    if (session.agent_version_id) {
      const { data: version } = await service
        .from('ai_agent_versions')
        .select('config')
        .eq('id', session.agent_version_id)
        .maybeSingle()
      if (version?.config && Object.keys(version.config).length) {
        config = { ...agent, ...version.config }
      }
    }

    let steps: any[] = []
    if (config.flow_id) {
      const { data } = await service
        .from('ai_agent_flow_steps')
        .select('*')
        .eq('flow_id', config.flow_id)
        .order('order_index', { ascending: true })
      steps = data || []
    }

    // Também carrega o fluxo de pré-handoff quando o agente tiver um.
    if (config.pre_handoff_flow_id && config.pre_handoff_flow_id !== config.flow_id) {
      const { data } = await service
        .from('ai_agent_flow_steps')
        .select('*')
        .eq('flow_id', config.pre_handoff_flow_id)
        .order('order_index', { ascending: true })
      if ((data || []).length) steps = [...(data || []), ...steps]
    }

    // ------------------------------------------------------------------
    // EXECUÇÃO DETERMINÍSTICA DO FLUXO DESENHADO
    // Quando o fluxo tem uma etapa de INÍCIO, o simulador executa o grafo
    // (mensagens exatas, validações e ramificações) em vez de deixar o LLM
    // improvisar. Ao terminar o fluxo, cai no modo livre com o LLM.
    // ------------------------------------------------------------------
    const runtimeCfg = (config.runtime_config && typeof config.runtime_config === 'object') ? config.runtime_config : {}
    const startStep = findStartStep(steps)
    const visualFlowEnabled =
      runtimeCfg.execute_visual_flow !== false && !!startStep && stepKindOf(startStep) === 'INICIO'

    const flowState = (session.flow_state && typeof session.flow_state === 'object') ? session.flow_state : {}

    let userMessageStored = false

    // Idioma do turno: travado no `flow_state` assim que a primeira resposta
    // do cliente permite identificá-lo; antes disso usa o padrão do agente.
    const firstTurnGlobal = !flowState.current_step
    const langResolution = resolveFlowLanguage(
      flowState.lang,
      firstTurnGlobal ? '' : message,
      config.default_language,
    )
    sessionLang = langResolution.lang
    sessionLangLocked = langResolution.locked

    if (visualFlowEnabled && !flowState.finished) {
      const lang = sessionLang
      const firstTurn = firstTurnGlobal
      const turn = firstTurn
        ? startFlow(steps, lang as any)
        : advanceFlow(steps, flowState, message, lang as any)

      await service.from('ai_agent_test_messages').insert({
        session_id,
        agent_id: agent.id,
        role: 'user',
        content: message,
        created_by: auth.userId,
      })
      userMessageStored = true


      const nextFlowState = { ...turn.state, ...(sessionLangLocked ? { lang: sessionLang } : {}) }
      await service
        .from('ai_agent_test_sessions')
        .update({ flow_state: nextFlowState, updated_at: new Date().toISOString() })
        .eq('id', session_id)


      const reply = turn.messages.join('\n\n')
      if (reply) {
        await service.from('ai_agent_test_messages').insert({
          session_id,
          agent_id: agent.id,
          role: 'assistant',
          content: reply,
          provider: 'flow-engine',
          model: `fluxo:${config.flow_id || ''}`,
          latency_ms: 0,
          created_by: auth.userId,
        })

        return json({
          reply,
          provider: 'flow-engine',
          model: 'fluxo determinístico',
          latency_ms: 0,
          tokens_used: 0,
          flow: {
            current_step: turn.state.current_step,
            reasked: turn.reasked,
            finished: turn.finished,
            handoff: turn.handoff,
            path: turn.path,
            lang: sessionLang,
            lang_locked: sessionLangLocked,
          },

        })
      }
      // Fluxo concluído sem mensagem nova → segue para o modo livre (LLM).
    }

    const systemPrompt = buildSystemPrompt(config, steps)


    // Histórico já persistido
    const { data: prior } = await service
      .from('ai_agent_test_messages')
      .select('role, content')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })

    if (!userMessageStored) {
      await service.from('ai_agent_test_messages').insert({
        session_id,
        agent_id: agent.id,
        role: 'user',
        content: message,
        created_by: auth.userId,
      })
    }


    const history = userMessageStored ? [...(prior || [])] : [...(prior || []), { role: "user", content: message }]

    const provider = String(config.provider || 'gemini')
    const model = String(config.model || 'gemini-2.5-flash')
    const temperature = Number(config.temperature ?? 0.7)
    const maxTokens = Number(config.max_tokens ?? 1024)

    const started = Date.now()
    let result: { text: string; tokens: number | null }
    try {
      result =
        provider === 'gemini'
          ? await callGemini(model, systemPrompt, history, temperature, maxTokens)
          : await callOpenAICompatible(provider as any, model, systemPrompt, history, temperature, maxTokens)
    } catch (e: any) {
      const errText = `[erro] ${e?.message || String(e)}`
      await service.from('ai_agent_test_messages').insert({
        session_id,
        agent_id: agent.id,
        role: 'system',
        content: errText,
        provider,
        model,
        latency_ms: Date.now() - started,
        created_by: auth.userId,
      })
      return json({ error: e?.message || String(e) }, 502)
    }

    const latency = Date.now() - started
    await service.from('ai_agent_test_messages').insert({
      session_id,
      agent_id: agent.id,
      role: 'assistant',
      content: result.text || '(resposta vazia)',
      provider,
      model,
      latency_ms: latency,
      tokens_used: result.tokens,
      created_by: auth.userId,
    })

    return json({
      reply: result.text,
      provider,
      model,
      latency_ms: latency,
      tokens_used: result.tokens,
      system_prompt_preview: systemPrompt.slice(0, 2000),
    })
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500)
  }
})
