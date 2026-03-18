import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WhatsAppMessage {
  from: string;
  body: string;
  timestamp?: string;
  messageId?: string;
  type?: string;
  name?: string;
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          text?: { body: string };
          timestamp?: string;
          id?: string;
          type?: string;
        }>;
        contacts?: Array<{
          profile?: { name: string };
          wa_id: string;
        }>;
      };
    }>;
  }>;
  contacts?: Array<{
    profile?: { name: string };
    wa_id?: string;
  }>;
  messages?: Array<{
    from: string;
    text?: { body: string };
    timestamp?: string;
    id?: string;
    type?: string;
  }>;
  phone?: string;
  message?: string | {
    text?: string;
    content?: string;
    messageid?: string;
    type?: string;
    sender?: string;
    senderName?: string;
    messageTimestamp?: number;
    fromMe?: boolean;
  };
  name?: string;
  source?: string;
  // UAZAPI format
  chat?: {
    phone?: string;
    name?: string;
    wa_chatid?: string;
  };
  EventType?: string;
}

/** Round-robin: pick the ATENDENTE_WHATSAPP user with the fewest recent lead assignments */
async function getNextAttendant(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: attendants, error: attError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'ATENDENTE_WHATSAPP')

  if (attError || !attendants?.length) {
    console.log('No ATENDENTE_WHATSAPP users found, falling back to ATENCAO_CLIENTE')
    const { data: fallback } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'ATENCAO_CLIENTE')
    if (!fallback?.length) return null
    return fallback[0].user_id
  }

  const userIds = attendants.map(a => a.user_id)
  const { data: activeProfiles } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .eq('is_active', true)

  if (!activeProfiles?.length) return null

  const activeIds = activeProfiles.map(p => p.id)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: leadCounts } = await supabase
    .from('leads')
    .select('assigned_to_user_id')
    .in('assigned_to_user_id', activeIds)
    .gte('created_at', thirtyDaysAgo)

  const countMap: Record<string, number> = {}
  for (const id of activeIds) {
    countMap[id] = 0
  }
  for (const lead of leadCounts || []) {
    if (lead.assigned_to_user_id && countMap[lead.assigned_to_user_id] !== undefined) {
      countMap[lead.assigned_to_user_id]++
    }
  }

  let minCount = Infinity
  let selectedUserId: string | null = null
  for (const [userId, count] of Object.entries(countMap)) {
    if (count < minCount) {
      minCount = count
      selectedUserId = userId
    }
  }

  return selectedUserId
}

function parseMessage(payload: WebhookPayload): WhatsAppMessage | null {
  // Meta/Cloud API format
  if (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const msg = payload.entry[0].changes[0].value.messages[0]
    const contacts = payload.entry[0].changes[0].value.contacts
    return {
      from: msg.from,
      body: msg.text?.body || '',
      timestamp: msg.timestamp,
      messageId: msg.id,
      type: msg.type,
      name: contacts?.[0]?.profile?.name,
    }
  }
  // UAZAPI format: message is an object with text/content, chat has phone/name
  if (payload.message && typeof payload.message === 'object' && payload.chat) {
    const msg = payload.message
    // Ignore messages sent by us (fromMe)
    if (msg.fromMe) {
      console.log('Ignoring fromMe message')
      return null
    }
    const phone = msg.sender?.replace(/[@s.whatsapp.net]/g, '').replace(/\D/g, '') ||
                  payload.chat.phone?.replace(/\D/g, '') || ''
    const body = msg.text || msg.content || ''
    return {
      from: phone,
      body,
      timestamp: msg.messageTimestamp ? String(msg.messageTimestamp) : undefined,
      messageId: msg.messageid,
      type: msg.type,
      name: msg.senderName || payload.chat.name,
    }
  }
  // Array messages format
  if (payload.messages?.[0]) {
    const msg = payload.messages[0]
    return {
      from: msg.from,
      body: msg.text?.body || '',
      timestamp: msg.timestamp,
      messageId: msg.id,
      type: msg.type,
      name: payload.contacts?.[0]?.profile?.name,
    }
  }
  // Simple format
  if (payload.phone && typeof payload.message === 'string') {
    return {
      from: payload.phone.replace(/\D/g, ''),
      body: payload.message,
      name: payload.name,
    }
  }
  return null
}

/** Build conversation history from mensagens_cliente for OpenAI context */
async function getConversationHistory(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  limit = 20
): Promise<Array<{ role: string; content: string }>> {
  const { data: messages } = await supabase
    .from('mensagens_cliente')
    .select('mensagem_cliente, mensagem_IA, origem, created_at')
    .eq('id_lead', leadId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!messages?.length) return []

  const history: Array<{ role: string; content: string }> = []
  for (const msg of messages) {
    if (msg.mensagem_cliente) {
      history.push({ role: 'user', content: msg.mensagem_cliente })
    }
    if (msg.mensagem_IA) {
      history.push({ role: 'assistant', content: msg.mensagem_IA })
    }
  }
  return history
}

/** Retrieve relevant knowledge base content for the AI context */
async function getKnowledgeBaseContext(
  supabase: ReturnType<typeof createClient>,
  userMessage: string
): Promise<string> {
  // Fetch all active knowledge base entries
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('content, file_name')
    .eq('is_active', true)
    .order('file_name')
    .order('chunk_index')

  if (!kbEntries?.length) return ''

  // Simple keyword matching: find chunks that contain words from the user message
  const keywords = userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  
  const scoredChunks = kbEntries.map(entry => {
    const contentLower = entry.content.toLowerCase()
    const score = keywords.reduce((acc, kw) => acc + (contentLower.includes(kw) ? 1 : 0), 0)
    return { ...entry, score }
  })

  // Get top relevant chunks (max ~4000 chars to not bloat context)
  const relevant = scoredChunks
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (relevant.length === 0) {
    // If no keyword match, include first chunks as general context
    const generalContext = kbEntries.slice(0, 3).map(e => e.content).join('\n\n')
    return generalContext.substring(0, 3000)
  }

  return relevant.map(c => c.content).join('\n\n').substring(0, 4000)
}

/** Call Gemini 1.5 Flash to generate an AI response */
async function generateAIResponse(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  contactName: string,
  systemPrompt: string,
  geminiApiKey: string,
  knowledgeContext: string
): Promise<string> {
  let fullSystemPrompt = systemPrompt
  if (knowledgeContext) {
    fullSystemPrompt += `\n\n--- BASE DE CONHECIMENTO ---\nAs informações abaixo são sua ÚNICA fonte de verdade. Responda EXCLUSIVAMENTE com base neste conteúdo.
Se a pergunta do cliente NÃO puder ser respondida com as informações abaixo, diga educadamente que não possui essa informação no momento e sugira que entre em contato diretamente com a equipe da CB Asesoria para mais detalhes.
NUNCA invente, suponha ou use conhecimento externo. Responda apenas o que está documentado aqui:\n\n${knowledgeContext}\n--- FIM DA BASE DE CONHECIMENTO ---`
  } else {
    fullSystemPrompt += `\n\nATENÇÃO: Não há informações na base de conhecimento no momento. Responda de forma genérica e cordial, orientando o cliente a entrar em contato com a equipe da CB Asesoria para informações detalhadas.`
  }

  // Build Gemini-compatible contents array
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  // Add conversation history
  for (const msg of conversationHistory) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: currentMessage }],
  })

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: fullSystemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gemini API error:', response.status, errorText)
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

/** Send WhatsApp message via API */
async function sendWhatsAppMessage(
  phone: string,
  message: string,
  uazapiUrl: string,
  uazapiToken: string
): Promise<void> {
  const apiUrl = `${uazapiUrl.replace(/\/$/, '')}/send/text`
  console.log('Sending AI response via WhatsApp API:', { phone, apiUrl })

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': uazapiToken,
    },
    body: JSON.stringify({ phone, message }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('WhatsApp API send error:', errorText)
    throw new Error(`WhatsApp API error: ${response.status}`)
  }

  console.log('AI response sent successfully')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // WhatsApp webhook verification (GET request)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'cb-asesoria-webhook'

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully')
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }
    
    return new Response('Verification failed', { status: 403, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const payload: WebhookPayload = await req.json()
    console.log('Received webhook:', JSON.stringify(payload))

    // Log the webhook
    await supabase.from('webhook_logs').insert({
      source: 'IA_WHATSAPP',
      raw_payload: payload,
      processed: false,
    })

    const message = parseMessage(payload)

    if (!message || !message.from || !message.body) {
      console.log('No valid message found in payload')
      return new Response(
        JSON.stringify({ success: true, message: 'No message to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const phoneNumber = message.from.replace(/\D/g, '')
    console.log('Processing message from:', phoneNumber)

    // Find existing contact by phone
    let contact: { id: string; full_name: string } | null = null
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, full_name')
      .eq('phone', parseInt(phoneNumber))
      .single()

    contact = existingContact

    // If no contact, create one
    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone: parseInt(phoneNumber),
          full_name: message.name || `WhatsApp ${phoneNumber.slice(-4)}`,
          origin_channel: 'WHATSAPP',
        })
        .select('id, full_name')
        .single()

      if (contactError || !newContact) {
        console.error('Error creating contact:', contactError)
        throw contactError || new Error('Failed to create contact')
      }
      contact = newContact
    }

    // Find or create lead for this contact
    let lead: { id: string; status: string | null; assigned_to_user_id: string | null } | null = null
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, status, assigned_to_user_id')
      .eq('contact_id', contact.id)
      .not('status', 'eq', 'ARQUIVADO_SEM_RETORNO')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    lead = existingLead

    if (!lead) {
      const assignedUserId = await getNextAttendant(supabase)
      console.log('Auto-assigned to user:', assignedUserId)

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          contact_id: contact.id,
          status: 'NOVO',
          notes: 'Lead criado automaticamente via WhatsApp',
          assigned_to_user_id: assignedUserId,
        })
        .select('id, status, assigned_to_user_id')
        .single()

      if (leadError || !newLead) {
        console.error('Error creating lead:', leadError)
        throw leadError || new Error('Failed to create lead')
      }
      lead = newLead

      await supabase.from('tasks').insert({
        title: `Novo lead via WhatsApp: ${contact.full_name}`,
        description: `Mensagem inicial: ${message.body.substring(0, 200)}`,
        status: 'PENDENTE',
        related_lead_id: lead.id,
        ...(assignedUserId ? { assigned_to_user_id: assignedUserId } : {}),
      })

      if (assignedUserId) {
        await supabase.from('notifications').insert({
          user_id: assignedUserId,
          title: 'Novo lead WhatsApp atribuído a você',
          message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
          type: 'whatsapp_lead_assigned',
        })
      }
    } else if (!lead.assigned_to_user_id) {
      const assignedUserId = await getNextAttendant(supabase)
      if (assignedUserId) {
        await supabase.from('leads').update({ assigned_to_user_id: assignedUserId }).eq('id', lead.id)
        lead.assigned_to_user_id = assignedUserId
        console.log('Assigned existing unassigned lead to:', assignedUserId)

        await supabase.from('notifications').insert({
          user_id: assignedUserId,
          title: 'Lead WhatsApp atribuído a você',
          message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
          type: 'whatsapp_lead_assigned',
        })
      }
    }

    // Create interaction record
    await supabase.from('interactions').insert({
      lead_id: lead.id,
      contact_id: contact.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      content: message.body,
      origin_bot: false,
    })

    // Store in mensagens_cliente
    await supabase.from('mensagens_cliente').insert({
      id_lead: lead.id,
      phone_id: parseInt(phoneNumber),
      mensagem_cliente: message.body,
      origem: 'WHATSAPP',
    })

    // ========== AI AGENT SECTION ==========
    // Check if WhatsApp bot is enabled and Gemini key is available
    const { data: botConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'whatsapp_bot_enabled',
        'whatsapp_bot_system_prompt',
        'gemini_api_key',
        'uazapi_url',
        'uazapi_token',
      ])

    const configMap: Record<string, string> = {}
    botConfigs?.forEach((c: { key: string; value: string }) => {
      configMap[c.key] = c.value
    })

    const botEnabled = configMap['whatsapp_bot_enabled'] === 'true'
    const geminiApiKey = configMap['gemini_api_key']

    if (botEnabled && geminiApiKey) {
      console.log('AI agent is enabled, generating response...')

      try {
        // Build system prompt
        const defaultSystemPrompt = `Você é a assistente virtual da CB Asesoria, uma empresa especializada em assessoria de imigração na Espanha.

Suas diretrizes:
- Seja cordial, empática e profissional
- Responda em português do Brasil
- Responda SOMENTE com base nas informações da base de conhecimento fornecida
- Se a informação não estiver na base de conhecimento, diga que não possui essa informação e oriente o cliente a entrar em contato com a equipe
- Nunca invente informações legais, prazos ou valores
- Mantenha as respostas concisas (máximo 3-4 parágrafos) para serem lidas facilmente no WhatsApp
- Use emojis com moderação para tornar a conversa amigável
- Nome do cliente: ${contact.full_name}`

        const systemPrompt = configMap['whatsapp_bot_system_prompt'] || defaultSystemPrompt

        // Get conversation history and knowledge base context
        const [history, knowledgeContext] = await Promise.all([
          getConversationHistory(supabase, lead.id),
          getKnowledgeBaseContext(supabase, message.body),
        ])

        console.log(`Knowledge base context: ${knowledgeContext.length} chars`)

        // Generate AI response
        const aiResponse = await generateAIResponse(
          history,
          message.body,
          contact.full_name,
          systemPrompt.replace('{nome}', contact.full_name),
          geminiApiKey,
          knowledgeContext
        )

        if (aiResponse) {
          // Send AI response via WhatsApp
          const uazapiUrl = configMap['uazapi_url']
          const uazapiToken = configMap['uazapi_token']

          if (uazapiUrl && uazapiToken) {
            await sendWhatsAppMessage(phoneNumber, aiResponse, uazapiUrl, uazapiToken)

            // Store AI response in mensagens_cliente
            await supabase.from('mensagens_cliente').insert({
              id_lead: lead.id,
              phone_id: parseInt(phoneNumber),
              mensagem_IA: aiResponse,
              origem: 'IA',
            })

            // Create outbound interaction
            await supabase.from('interactions').insert({
              lead_id: lead.id,
              contact_id: contact.id,
              channel: 'WHATSAPP',
              direction: 'OUTBOUND',
              content: aiResponse,
              origin_bot: true,
            })

            console.log('AI response sent and stored successfully')
          } else {
            console.error('WhatsApp API not configured, cannot send AI response')
          }
        }
      } catch (aiError) {
        console.error('AI agent error (non-blocking):', aiError instanceof Error ? aiError.message : aiError)
        // AI errors don't block the webhook processing
      }
    } else {
      console.log(`AI agent skipped: botEnabled=${botEnabled}, hasGeminiKey=${!!geminiApiKey}`)
    }

    // Update webhook log as processed
    await supabase
      .from('webhook_logs')
      .update({ processed: true })
      .eq('raw_payload', payload)

    // Notify assigned user about new message
    if (lead.assigned_to_user_id) {
      await supabase.from('notifications').insert({
        user_id: lead.assigned_to_user_id,
        title: 'Nova mensagem WhatsApp',
        message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
        type: 'whatsapp_message',
      })
    } else {
      const { data: attentionUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'ATENCAO_CLIENTE')

      for (const user of attentionUsers || []) {
        await supabase.from('notifications').insert({
          user_id: user.user_id,
          title: 'Nova mensagem WhatsApp (não atribuído)',
          message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
          type: 'whatsapp_message',
        })
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: contact.id,
        leadId: lead.id,
        assignedTo: lead.assigned_to_user_id,
        aiResponseSent: botEnabled && !!openaiApiKey,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('WhatsApp webhook error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})