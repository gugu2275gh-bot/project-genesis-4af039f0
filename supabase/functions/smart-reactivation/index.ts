import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Confirmation reply mappings
const POSITIVE_REPLIES = ['sim', 'isso', 'correto', 'exatamente', 'pode seguir', 'é esse', 'é isso', 'isso mesmo', 'ok', 'certo', 'positivo', 'ss', 'sss', 'simmm']
const NEGATIVE_REPLIES = ['não', 'nao', 'não é isso', 'nao e isso', 'outro assunto', 'nada a ver', 'errado', 'negativo', 'nn', 'nope']

function isPositiveReply(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[!?.]+$/g, '')
  return POSITIVE_REPLIES.some(r => normalized === r || normalized.startsWith(r + ' '))
}

function isNegativeReply(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[!?.]+$/g, '')
  return NEGATIVE_REPLIES.some(r => normalized === r || normalized.startsWith(r + ' '))
}

interface PendingItem {
  id: string
  sector: string
  pending_subject_title: string | null
  pending_reason: string | null
  pending_context_summary: string | null
  last_question_to_customer: string | null
  last_company_message_at: string | null
  last_customer_message_at: string | null
  service_case_id: string | null
  lead_id: string | null
}

interface ReactivationResult {
  action: 'CURRENT_FLOW' | 'NEW_SUBJECT' | 'SEND_MESSAGE' | 'DIRECT_ROUTE'
  message_to_customer?: string
  selected_pending_id?: string
  selected_sector?: string
  lead_id?: string
}

const LLM_CLASSIFIER_PROMPT = `Você é um classificador de contexto de atendimento ao cliente. Sua tarefa é analisar uma nova mensagem recebida após expiração da sessão ativa e decidir se ela se refere a alguma pendência aberta já existente.

Regras:
- Não invente informações.
- Compare semanticamente a nova mensagem com cada contexto.
- Dê mais peso à última pergunta feita ao cliente e à recência.
- Se a mensagem for genérica ou curta (ex: "já enviei", "ok", "sim", "não", "pode verificar", "pronto", "está pago", "segue anexo"), evite roteamento direto com baixa certeza.
- Se houver boa evidência, escolha a pendência mais provável.
- Se não houver certeza suficiente, solicite confirmação.
- Se a mensagem não corresponder a nenhuma pendência, classifique como novo assunto.
- Considere que palavras como "comprovante", "pagamento", "boleto", "documento", "contrato", "cadastro", "anexo", "PIX" podem indicar setor específico.
- Responda APENAS em JSON válido, sem texto adicional.

Formato de resposta obrigatório:
{
  "decision": "direct_route | ask_confirmation | ask_disambiguation | new_subject | insufficient_context",
  "selected_pending_id": "string ou null",
  "selected_sector_id": "string ou null",
  "confidence": 0.0,
  "ranked_candidates": [
    {
      "pending_id": "string",
      "sector": "string",
      "score": 0.0,
      "reason": "motivo resumido"
    }
  ],
  "reason": "explicação curta da decisão",
  "should_ask_confirmation": true,
  "suggested_customer_prompt": "mensagem sugerida para o cliente"
}`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { contactId, incomingMessageText, phoneNumber, leadId } = await req.json()

    if (!contactId || !incomingMessageText) {
      return new Response(
        JSON.stringify({ action: 'CURRENT_FLOW', reason: 'Missing required fields' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Load system settings
    const { data: configs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'enable_smart_reactivation',
        'active_session_timeout_minutes',
        'llm_confidence_threshold_direct_route',
        'llm_confidence_threshold_confirmation',
        'reactivation_context_message_limit',
        'openai_api_key',
        'uazapi_url',
        'uazapi_token',
      ])

    const cfg: Record<string, string> = {}
    configs?.forEach((c: { key: string; value: string }) => { cfg[c.key] = c.value })

    const enabled = cfg['enable_smart_reactivation'] === 'true'
    if (!enabled) {
      return new Response(
        JSON.stringify({ action: 'CURRENT_FLOW', reason: 'Smart reactivation disabled' } as ReactivationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const timeoutMinutes = parseInt(cfg['active_session_timeout_minutes'] || '120')
    const thresholdDirect = parseFloat(cfg['llm_confidence_threshold_direct_route'] || '0.90')
    const thresholdConfirmation = parseFloat(cfg['llm_confidence_threshold_confirmation'] || '0.70')
    const contextLimit = parseInt(cfg['reactivation_context_message_limit'] || '5')
    const openaiApiKey = cfg['openai_api_key']

    // 2. Check for pending reactivation resolution (awaiting confirmation)
    const { data: pendingResolution } = await supabase
      .from('reactivation_resolutions')
      .select('*')
      .eq('contact_id', contactId)
      .eq('user_confirmation_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (pendingResolution) {
      console.log('Found pending reactivation resolution:', pendingResolution.id)
      return await handleConfirmationReply(
        supabase, pendingResolution, incomingMessageText, cfg
      )
    }

    // 3. Calculate session expiry
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_id', contactId)
      .not('status', 'eq', 'ARQUIVADO_SEM_RETORNO')

    if (!allLeads?.length) {
      return new Response(
        JSON.stringify({ action: 'CURRENT_FLOW', reason: 'No leads found' } as ReactivationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const leadIds = allLeads.map(l => l.id)
    const { data: lastMsg } = await supabase
      .from('mensagens_cliente')
      .select('created_at')
      .in('id_lead', leadIds)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastMsg) {
      const lastMsgTime = new Date(lastMsg.created_at).getTime()
      const now = Date.now()
      const diffMinutes = (now - lastMsgTime) / (1000 * 60)

      if (diffMinutes < timeoutMinutes) {
        console.log(`Session still active (${Math.round(diffMinutes)}min < ${timeoutMinutes}min)`)
        return new Response(
          JSON.stringify({ action: 'CURRENT_FLOW', reason: 'Session still active' } as ReactivationResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.log(`Session expired (${Math.round(diffMinutes)}min >= ${timeoutMinutes}min)`)
    }

    // 4. Load open pending items
    const { data: pendingItems } = await supabase
      .from('customer_sector_pending_items')
      .select('*')
      .eq('contact_id', contactId)
      .in('status', ['open', 'waiting_customer'])
      .order('priority', { ascending: false })
      .order('last_company_message_at', { ascending: false })

    if (!pendingItems?.length) {
      console.log('No open pending items, treating as new subject')
      await logResolution(supabase, {
        contact_id: contactId,
        incoming_message_text: incomingMessageText,
        session_expired: true,
        open_pending_count: 0,
        action_taken: 'new_subject',
        user_confirmation_status: 'no_response',
      })
      return new Response(
        JSON.stringify({ action: 'NEW_SUBJECT', reason: 'No open pending items' } as ReactivationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Build context per pending item
    const pendingContexts = await Promise.all(
      pendingItems.map(async (item: PendingItem) => {
        let recentMessages: Array<{ role: string; content: string; at: string }> = []

        if (item.lead_id) {
          const { data: msgs } = await supabase
            .from('mensagens_cliente')
            .select('mensagem_cliente, mensagem_IA, origem, created_at')
            .eq('id_lead', item.lead_id)
            .order('created_at', { ascending: false })
            .limit(contextLimit)

          recentMessages = (msgs || []).reverse().flatMap(m => {
            const result: Array<{ role: string; content: string; at: string }> = []
            if (m.mensagem_cliente) result.push({ role: 'cliente', content: m.mensagem_cliente, at: m.created_at })
            if (m.mensagem_IA) result.push({ role: 'empresa', content: m.mensagem_IA, at: m.created_at })
            return result
          })
        }

        return {
          pending_id: item.id,
          sector: item.sector,
          subject: item.pending_subject_title || 'Sem título',
          reason: item.pending_reason || '',
          context_summary: item.pending_context_summary || '',
          last_question: item.last_question_to_customer || '',
          last_company_message_at: item.last_company_message_at,
          recent_messages: recentMessages,
        }
      })
    )

    // 6. Try LLM classification
    let llmResult: Record<string, unknown> | null = null

    if (openaiApiKey) {
      try {
        const llmInput = {
          new_message: incomingMessageText,
          pending_items: pendingContexts,
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: LLM_CLASSIFIER_PROMPT },
              { role: 'user', content: JSON.stringify(llmInput) },
            ],
            max_tokens: 500,
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const content = data.choices?.[0]?.message?.content
          if (content) {
            llmResult = JSON.parse(content)
            console.log('LLM classification result:', JSON.stringify(llmResult))
          }
        } else {
          console.error('OpenAI API error:', response.status, await response.text())
        }
      } catch (err) {
        console.error('LLM classification error:', err instanceof Error ? err.message : err)
      }
    }

    // 7. Apply decision
    let result: ReactivationResult

    if (llmResult) {
      const confidence = typeof llmResult.confidence === 'number' ? llmResult.confidence : 0
      const decision = llmResult.decision as string
      const selectedPendingId = llmResult.selected_pending_id as string | null
      const selectedSector = llmResult.selected_sector_id as string | null
      const suggestedPrompt = llmResult.suggested_customer_prompt as string | null

      // Find the pending item to get lead_id
      const selectedItem = pendingItems.find((p: PendingItem) => p.id === selectedPendingId)

      if (decision === 'new_subject' || confidence < thresholdConfirmation) {
        result = { action: 'NEW_SUBJECT', reason: 'LLM classified as new subject or low confidence' }
        await logResolution(supabase, {
          contact_id: contactId,
          incoming_message_text: incomingMessageText,
          session_expired: true,
          open_pending_count: pendingItems.length,
          llm_input_snapshot: { new_message: incomingMessageText, pending_count: pendingContexts.length },
          llm_output_snapshot: llmResult,
          action_taken: 'new_subject',
          confidence_score: confidence,
          user_confirmation_status: 'no_response',
          ranked_candidates_json: llmResult.ranked_candidates,
        })
      } else if (confidence >= thresholdDirect && decision === 'direct_route') {
        result = {
          action: 'DIRECT_ROUTE',
          selected_pending_id: selectedPendingId || undefined,
          selected_sector: selectedItem?.sector || selectedSector || undefined,
          lead_id: selectedItem?.lead_id || undefined,
        }

        // Send confirmation message to customer
        const msg = suggestedPrompt || `Recebi sua resposta e vou te encaminhar para o setor de ${selectedItem?.sector || 'atendimento'}.`
        await sendMessage(cfg, phoneNumber, msg)
        result.message_to_customer = msg
        result.action = 'SEND_MESSAGE'

        await logResolution(supabase, {
          contact_id: contactId,
          incoming_message_text: incomingMessageText,
          session_expired: true,
          open_pending_count: pendingItems.length,
          llm_input_snapshot: { new_message: incomingMessageText, pending_count: pendingContexts.length },
          llm_output_snapshot: llmResult,
          selected_sector: selectedItem?.sector || selectedSector,
          selected_pending_id: selectedPendingId,
          confidence_score: confidence,
          action_taken: 'direct_route',
          user_confirmation_status: 'no_response',
          ranked_candidates_json: llmResult.ranked_candidates,
        })

        // Update pending item timestamps
        if (selectedPendingId) {
          await supabase.from('customer_sector_pending_items')
            .update({ last_customer_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', selectedPendingId)
        }
      } else {
        // Ask confirmation
        const msg = suggestedPrompt || `Sua mensagem parece estar relacionada ao assunto de ${selectedItem?.pending_subject_title || selectedItem?.sector || 'atendimento'}. É sobre isso?`
        await sendMessage(cfg, phoneNumber, msg)

        // Find secondary candidate
        const ranked = llmResult.ranked_candidates as Array<{ pending_id: string }> | null
        const secondaryId = ranked && ranked.length > 1 ? ranked[1].pending_id : null

        await logResolution(supabase, {
          contact_id: contactId,
          incoming_message_text: incomingMessageText,
          session_expired: true,
          open_pending_count: pendingItems.length,
          llm_input_snapshot: { new_message: incomingMessageText, pending_count: pendingContexts.length },
          llm_output_snapshot: llmResult,
          selected_sector: selectedItem?.sector || selectedSector,
          selected_pending_id: selectedPendingId,
          confidence_score: confidence,
          action_taken: decision === 'ask_disambiguation' ? 'ask_disambiguation' : 'ask_confirmation',
          user_confirmation_status: 'pending',
          secondary_pending_id: secondaryId,
          ranked_candidates_json: llmResult.ranked_candidates,
        })

        result = { action: 'SEND_MESSAGE', message_to_customer: msg }
      }
    } else {
      // Fallback without LLM
      console.log('Using deterministic fallback (no LLM)')
      result = await deterministicFallback(supabase, cfg, contactId, incomingMessageText, pendingItems, phoneNumber)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Smart reactivation error:', errorMessage)
    return new Response(
      JSON.stringify({ action: 'CURRENT_FLOW', reason: `Error: ${errorMessage}` } as ReactivationResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleConfirmationReply(
  supabase: ReturnType<typeof createClient>,
  resolution: Record<string, unknown>,
  messageText: string,
  cfg: Record<string, string>
): Promise<Response> {
  const resolutionId = resolution.id as string
  const contactId = resolution.contact_id as string
  const attemptCount = (resolution.confirmation_attempt_count as number) || 0
  const selectedPendingId = resolution.selected_pending_id as string | null
  const secondaryPendingId = resolution.secondary_pending_id as string | null
  const ranked = resolution.ranked_candidates_json as Array<{ pending_id: string; sector: string }> | null

  if (isPositiveReply(messageText)) {
    // Confirmed - route to selected sector
    await supabase.from('reactivation_resolutions')
      .update({ user_confirmation_status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', resolutionId)

    // Get the pending item to find lead_id
    let leadId: string | null = null
    let sector: string | null = null
    if (selectedPendingId) {
      const { data: pi } = await supabase.from('customer_sector_pending_items')
        .select('lead_id, sector')
        .eq('id', selectedPendingId)
        .single()
      leadId = pi?.lead_id || null
      sector = pi?.sector || null

      await supabase.from('customer_sector_pending_items')
        .update({ last_customer_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', selectedPendingId)
    }

    return new Response(
      JSON.stringify({
        action: 'DIRECT_ROUTE',
        selected_pending_id: selectedPendingId,
        selected_sector: sector || (resolution.selected_sector as string),
        lead_id: leadId,
        reason: 'Customer confirmed',
      } as ReactivationResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (isNegativeReply(messageText)) {
    if (attemptCount < 2 && secondaryPendingId) {
      // Try secondary candidate
      const { data: secItem } = await supabase.from('customer_sector_pending_items')
        .select('id, sector, pending_subject_title')
        .eq('id', secondaryPendingId)
        .single()

      if (secItem) {
        const msg = `Entendi. Então é sobre ${secItem.pending_subject_title || secItem.sector}?`

        // Find next secondary
        let nextSecondary: string | null = null
        if (ranked && ranked.length > attemptCount + 2) {
          nextSecondary = ranked[attemptCount + 2].pending_id
        }

        await supabase.from('reactivation_resolutions')
          .update({
            selected_pending_id: secondaryPendingId,
            selected_sector: secItem.sector,
            secondary_pending_id: nextSecondary,
            confirmation_attempt_count: attemptCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolutionId)

        // Get phone to send message
        const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contactId).single()
        if (contact?.phone) {
          await sendMessage(cfg, contact.phone, msg)
        }

        return new Response(
          JSON.stringify({ action: 'SEND_MESSAGE', message_to_customer: msg } as ReactivationResult),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Max attempts reached or no secondary - treat as new subject
    await supabase.from('reactivation_resolutions')
      .update({ user_confirmation_status: 'denied', updated_at: new Date().toISOString() })
      .eq('id', resolutionId)

    const msg = 'Entendi! É um novo assunto então. Como posso te ajudar?'
    const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contactId).single()
    if (contact?.phone) {
      await sendMessage(cfg, contact.phone, msg)
    }

    return new Response(
      JSON.stringify({ action: 'NEW_SUBJECT', message_to_customer: msg } as ReactivationResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Ambiguous reply - treat as new message and re-evaluate
  await supabase.from('reactivation_resolutions')
    .update({ user_confirmation_status: 'no_response', updated_at: new Date().toISOString() })
    .eq('id', resolutionId)

  return new Response(
    JSON.stringify({ action: 'CURRENT_FLOW', reason: 'Ambiguous reply to confirmation' } as ReactivationResult),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function deterministicFallback(
  supabase: ReturnType<typeof createClient>,
  cfg: Record<string, string>,
  contactId: string,
  messageText: string,
  pendingItems: PendingItem[],
  phoneNumber: string
): Promise<ReactivationResult> {
  if (pendingItems.length === 1) {
    const item = pendingItems[0]
    const msg = `Você está falando sobre sua pendência de ${item.pending_subject_title || item.sector}?`
    await sendMessage(cfg, phoneNumber, msg)

    await logResolution(supabase, {
      contact_id: contactId,
      incoming_message_text: messageText,
      session_expired: true,
      open_pending_count: 1,
      selected_sector: item.sector,
      selected_pending_id: item.id,
      action_taken: 'ask_confirmation',
      user_confirmation_status: 'pending',
    })

    return { action: 'SEND_MESSAGE', message_to_customer: msg }
  }

  // Multiple pending items - list options
  const options = pendingItems.slice(0, 3).map((item, i) =>
    `${i + 1}. ${item.pending_subject_title || item.sector}`
  ).join('\n')
  const msg = `Para te direcionar corretamente, você está falando sobre qual assunto?\n\n${options}\n\nOu é um novo assunto?`
  await sendMessage(cfg, phoneNumber, msg)

  await logResolution(supabase, {
    contact_id: contactId,
    incoming_message_text: messageText,
    session_expired: true,
    open_pending_count: pendingItems.length,
    action_taken: 'fallback_manual',
    user_confirmation_status: 'pending',
    ranked_candidates_json: pendingItems.map(p => ({ pending_id: p.id, sector: p.sector })),
  })

  return { action: 'SEND_MESSAGE', message_to_customer: msg }
}

async function sendMessage(cfg: Record<string, string>, phone: string, message: string): Promise<void> {
  const uazapiUrl = cfg['uazapi_url']
  const uazapiToken = cfg['uazapi_token']
  if (!uazapiUrl || !uazapiToken) {
    console.error('WhatsApp API not configured for reactivation message')
    return
  }

  try {
    const apiUrl = `${uazapiUrl.replace(/\/$/, '')}/send/text`
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': uazapiToken },
      body: JSON.stringify({ number: phone, text: message }),
    })
    console.log('Reactivation message sent to:', phone)
  } catch (err) {
    console.error('Failed to send reactivation message:', err instanceof Error ? err.message : err)
  }
}

async function logResolution(
  supabase: ReturnType<typeof createClient>,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('reactivation_resolutions').insert(data)
  } catch (err) {
    console.error('Failed to log reactivation resolution:', err instanceof Error ? err.message : err)
  }
}
