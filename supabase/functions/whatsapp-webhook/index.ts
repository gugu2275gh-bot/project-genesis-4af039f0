import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
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
  mediaUrl?: string;
  mimetype?: string;
  filename?: string;
  caption?: string;
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
    content?: string | Record<string, unknown>;
    messageid?: string;
    type?: string;
    mediaType?: string;
    sender?: string;
    senderName?: string;
    messageTimestamp?: number;
    fromMe?: boolean;
    mediaUrl?: string;
    mimetype?: string;
    filename?: string;
    caption?: string;
    base64?: string;
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

/** Get file extension from mimetype/filename/type */
function getFileExtension(mimetype?: string, filename?: string, type?: string): string {
  if (filename) {
    const ext = filename.split('.').pop()
    if (ext) return ext
  }
  if (mimetype) {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'mp4', 'audio/opus': 'ogg',
      'video/mp4': 'mp4', 'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    }
    if (map[mimetype]) return map[mimetype]
    const sub = mimetype.split('/')[1]
    if (sub) return sub.split(';')[0]
  }
  if (type === 'audio' || type === 'ptt') return 'ogg'
  if (type === 'image') return 'jpg'
  if (type === 'video') return 'mp4'
  if (type === 'document') return 'pdf'
  return 'bin'
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

    // Map UAZAPI messageType to standard media types
    const uazapiTypeMap: Record<string, string> = {
      'AudioMessage': 'ptt',
      'ImageMessage': 'image',
      'VideoMessage': 'video',
      'DocumentMessage': 'document',
      'StickerMessage': 'sticker',
    }
    const standardTypes = ['image', 'document', 'audio', 'video', 'sticker', 'ptt']
    const resolvedType = uazapiTypeMap[msg.type || ''] || msg.mediaType || msg.type || undefined
    const isMedia = standardTypes.includes(resolvedType || '')

    // For media messages, content may be an object with URL/mimetype — don't use as text
    const contentObj = typeof msg.content === 'object' && msg.content !== null ? msg.content as Record<string, unknown> : null
    const body = msg.text || msg.caption || (contentObj ? '' : (msg.content as string || ''))

    // Extract media URL: direct field, or from content.URL
    const mediaUrl = msg.mediaUrl || (contentObj && typeof contentObj.URL === 'string' ? contentObj.URL : undefined)
    const mimetype = msg.mimetype || (contentObj && typeof contentObj.mimetype === 'string' ? contentObj.mimetype : undefined)

    return {
      from: phone,
      body,
      timestamp: msg.messageTimestamp ? String(msg.messageTimestamp) : undefined,
      messageId: msg.messageid,
      type: isMedia ? resolvedType : msg.type,
      name: msg.senderName || payload.chat.name,
      mediaUrl,
      mimetype,
      filename: msg.filename,
      caption: msg.caption,
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
  limit = 10
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

const INVALID_KNOWLEDGE_PATTERNS = [
  /unable to extract text from pdf/i,
  /cannot extract text from pdf/i,
  /can't extract text from pdf/i,
  /i\s*(?:am|'m)\s*unable to extract/i,
  /forne[çc]a o texto/i,
  /provide the text or key points/i,
  /não (?:consigo|foi possível) extrair/i,
]

function isInvalidKnowledgeChunk(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) return true
  return INVALID_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
}

/** Retrieve relevant knowledge base content for the AI context */
async function getKnowledgeBaseContext(
  supabase: ReturnType<typeof createClient>,
  userMessage: string
): Promise<string> {
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('content, file_name, chunk_index')
    .eq('is_active', true)
    .order('file_name')
    .order('chunk_index')

  if (!kbEntries?.length) return ''

  const validEntries = kbEntries.filter((entry) => !isInvalidKnowledgeChunk(entry.content))
  if (!validEntries.length) return ''

  const normalizedQuestion = normalizeForSearch(userMessage)
  const keywords = normalizedQuestion.split(/\s+/).filter((w) => w.length > 2)

  const scoredChunks = validEntries.map((entry) => {
    const normalizedContent = normalizeForSearch(entry.content)
    const keywordScore = keywords.reduce((acc, kw) => acc + (normalizedContent.includes(kw) ? 1 : 0), 0)
    const phraseBonus = normalizedContent.includes(normalizedQuestion) ? 5 : 0
    return { ...entry, score: keywordScore + phraseBonus }
  })

  const relevant = scoredChunks
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const selected = relevant.length > 0 ? relevant : validEntries.slice(0, 8)

  return selected
    .map((chunk) => `[Fonte: ${chunk.file_name} | Bloco ${chunk.chunk_index}]\n${chunk.content}`)
    .join('\n\n')
    .substring(0, 8000)
}

/** Try to extract name and email from a client message */
function extractNameAndEmail(text: string): { name: string | null; email: string | null } {
  let name: string | null = null
  let email: string | null = null

  // Extract email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) {
    email = emailMatch[0].toLowerCase()
  }

  // Try to extract name patterns (Portuguese)
  const namePatterns = [
    /(?:me chamo|meu nome [eé]|sou (?:o |a )?)\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
    /(?:nome|name)\s*[:=]?\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i,
  ]
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      name = match[1].trim()
      break
    }
  }

  return { name, email }
}

function extractTextFromOpenAIResponse(data: Record<string, unknown>): string {
  const choice0 = Array.isArray(data.choices) && data.choices.length > 0
    ? (data.choices[0] as Record<string, unknown>)
    : null

  const message = choice0 && typeof choice0.message === 'object'
    ? (choice0.message as Record<string, unknown>)
    : null

  if (message && typeof message.content === 'string') {
    return message.content.trim()
  }

  if (message && Array.isArray(message.content)) {
    const contentText = message.content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const item = part as Record<string, unknown>
          if (typeof item.text === 'string') return item.text
          if (typeof item.output_text === 'string') return item.output_text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()

    if (contentText) return contentText
  }

  if (choice0 && typeof choice0.text === 'string') {
    return choice0.text.trim()
  }

  if (typeof data.output_text === 'string') {
    return data.output_text.trim()
  }

  if (Array.isArray(data.output_text)) {
    const outputText = data.output_text
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (outputText) return outputText
  }

  if (Array.isArray(data.output)) {
    const outputText = data.output
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const outputItem = item as Record<string, unknown>
        const content = outputItem.content
        if (!Array.isArray(content)) return ''
        return content
          .map((part) => {
            if (!part || typeof part !== 'object') return ''
            const contentItem = part as Record<string, unknown>
            if (typeof contentItem.text === 'string') return contentItem.text
            return ''
          })
          .filter(Boolean)
          .join('\n')
      })
      .filter(Boolean)
      .join('\n')
      .trim()

    if (outputText) return outputText
  }

  return ''
}

/** Call OpenAI Chat Completions API (GPT-5-mini) to generate an AI response */
async function generateAIResponse(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  contactName: string,
  systemPrompt: string,
  apiKey: string,
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

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: fullSystemPrompt },
    ...conversationHistory,
    { role: 'user', content: currentMessage },
  ]

  console.log('Calling OpenAI API with', messages.length, 'messages, system prompt length:', fullSystemPrompt.length)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000) // 45s timeout

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages,
        max_completion_tokens: 1000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json() as Record<string, unknown>
    const result = extractTextFromOpenAIResponse(data)

    if (!result) {
      const finishReason = Array.isArray(data.choices) && data.choices[0] && typeof data.choices[0] === 'object'
        ? (data.choices[0] as Record<string, unknown>).finish_reason
        : 'unknown'
      console.warn('OpenAI returned empty assistant content', { finishReason })
      return 'Desculpe, tive uma instabilidade agora para responder. Pode me enviar novamente sua pergunta em texto?'
    }

    console.log('OpenAI response received, length:', result.length)
    return result
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('OpenAI API call timed out after 45s')
      throw new Error('OpenAI API timeout')
    }
    throw err
  }
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
    body: JSON.stringify({ number: phone, text: message }),
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

    const isMediaMessage = message?.mediaUrl && ['image', 'document', 'audio', 'video', 'ptt', 'sticker'].includes(message?.type || '')

    if (!message || !message.from || (!message.body && !isMediaMessage)) {
      console.log('No valid message found in payload')
      return new Response(
        JSON.stringify({ success: true, message: 'No message to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download media if present and store in Supabase Storage
    let storedMediaUrl: string | null = null
    let mediaType: string | null = null
    let mediaFilename: string | null = null
    let mediaMimetype: string | null = null

    if (isMediaMessage && message.mediaUrl) {
      mediaType = message.type || null
      mediaMimetype = message.mimetype || null
      mediaFilename = message.filename || null

      try {
        console.log('Downloading media:', message.mediaUrl)
        const mediaResponse = await fetch(message.mediaUrl)
        if (mediaResponse.ok) {
          const mediaBuffer = await mediaResponse.arrayBuffer()
          const ext = getFileExtension(message.mimetype, message.filename, message.type)
          const filePath = `${message.from}/${Date.now()}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(filePath, mediaBuffer, {
              contentType: message.mimetype || 'application/octet-stream',
              upsert: false,
            })

          if (uploadError) {
            console.error('Storage upload error:', uploadError)
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('whatsapp-media')
              .getPublicUrl(filePath)
            storedMediaUrl = publicUrlData.publicUrl
            console.log('Media stored at:', storedMediaUrl)
          }
        } else {
          console.error('Failed to download media:', mediaResponse.status)
        }
      } catch (mediaErr) {
        console.error('Media download error:', mediaErr instanceof Error ? mediaErr.message : mediaErr)
      }
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
      content: message.body || (isMediaMessage ? `[${mediaType === 'ptt' ? 'audio' : mediaType}]` : ''),
      origin_bot: false,
    })

    // Build display text for media messages
    const displayBody = message.body || (isMediaMessage ? `[${mediaType === 'ptt' ? 'audio' : mediaType}]` : '')

    // Store in mensagens_cliente
    await supabase.from('mensagens_cliente').insert({
      id_lead: lead.id,
      phone_id: parseInt(phoneNumber),
      mensagem_cliente: displayBody,
      origem: 'WHATSAPP',
      media_type: mediaType,
      media_url: storedMediaUrl,
      media_filename: mediaFilename,
      media_mimetype: mediaMimetype,
    })

    // ========== AI AGENT SECTION ==========
    // Check if a human agent has taken over this lead (last outgoing message is from SISTEMA)
    let aiPausedByHuman = false
    const { data: lastOutgoing } = await supabase
      .from('mensagens_cliente')
      .select('origem')
      .eq('id_lead', lead.id)
      .not('mensagem_IA', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (lastOutgoing?.origem === 'SISTEMA') {
      aiPausedByHuman = true
      console.log('AI agent paused: human agent (SISTEMA) is handling this lead')
    }

    // Check if WhatsApp bot is enabled and OpenAI key is available
    const { data: botConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'whatsapp_bot_enabled',
        'whatsapp_bot_system_prompt',
        'openai_api_key',
        'uazapi_url',
        'uazapi_token',
      ])

    const configMap: Record<string, string> = {}
    botConfigs?.forEach((c: { key: string; value: string }) => {
      configMap[c.key] = c.value
    })

    const botEnabled = configMap['whatsapp_bot_enabled'] === 'true'
    const openaiApiKey = configMap['openai_api_key']

    if (botEnabled && openaiApiKey && !aiPausedByHuman) {
      console.log('AI agent is enabled, generating response...')

      try {
        // Check if this is the first interaction for this lead
        const { count: messageCount } = await supabase
          .from('mensagens_cliente')
          .select('id', { count: 'exact', head: true })
          .eq('id_lead', lead.id)
          .not('id', 'eq', 0) // just to trigger count
        
        const isFirstInteraction = (messageCount || 0) <= 1 // 1 because we just inserted the current message

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

        let systemPrompt = configMap['whatsapp_bot_system_prompt'] || defaultSystemPrompt

        // First interaction: add welcome instructions
        if (isFirstInteraction) {
          console.log('First interaction detected, using welcome prompt')
          systemPrompt += `\n\n--- INSTRUÇÃO ESPECIAL: PRIMEIRA INTERAÇÃO ---
Esta é a PRIMEIRA mensagem deste cliente. Você DEVE:
1. Dar as boas-vindas calorosas à CB Asesoria
2. Se apresentar como assistente virtual da CB Asesoria
3. Explicar brevemente que a CB Asesoria é especializada em assessoria de imigração na Espanha
4. Pedir educadamente o NOME COMPLETO e o E-MAIL do cliente para cadastro
5. Exemplo: "Para que possamos te atender da melhor forma, poderia me informar seu nome completo e seu e-mail? 😊"
NÃO responda a pergunta do cliente ainda. Primeiro faça o acolhimento e peça os dados.
--- FIM DA INSTRUÇÃO ESPECIAL ---`
        }

        // Try to extract name/email from the current message and update contact
        const extracted = extractNameAndEmail(String(message.body || ''))
        if (extracted.name || extracted.email) {
          const updateData: Record<string, string> = {}
          if (extracted.name && (contact.full_name.startsWith('WhatsApp ') || contact.full_name === message.name)) {
            updateData.full_name = extracted.name
            contact.full_name = extracted.name
            console.log('Extracted and updating name:', extracted.name)
          }
          if (extracted.email) {
            updateData.email = extracted.email
            console.log('Extracted and updating email:', extracted.email)
          }
          if (Object.keys(updateData).length > 0) {
            await supabase.from('contacts').update(updateData).eq('id', contact.id)
            console.log('Contact updated with extracted data:', updateData)
          }
        }

        // For audio/media-only messages without text, use a placeholder for AI context
        const messageForAI = message.body || (mediaType ? `[Cliente enviou um ${mediaType === 'ptt' ? 'áudio' : mediaType}]` : '')
        
        // Get conversation history and knowledge base context
        const [history, knowledgeContext] = await Promise.all([
          getConversationHistory(supabase, lead.id),
          messageForAI ? getKnowledgeBaseContext(supabase, messageForAI) : Promise.resolve(''),
        ])

        console.log(`Knowledge base context: ${knowledgeContext.length} chars`)

        // Generate AI response
        const aiResponse = await generateAIResponse(
          history,
          messageForAI,
          contact.full_name,
          systemPrompt.replace('{nome}', contact.full_name),
          openaiApiKey,
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
      console.log(`AI agent skipped: botEnabled=${botEnabled}, hasOpenAIKey=${!!openaiApiKey}, pausedByHuman=${aiPausedByHuman}`)
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
