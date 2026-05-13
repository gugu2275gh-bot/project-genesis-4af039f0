// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  // Twilio format (form-encoded, converted to object)
  MessageSid?: string;
  From?: string;
  Body?: string;
  ProfileName?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  // Meta/Cloud API format
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
  message?: string | Record<string, unknown>;
  name?: string;
  source?: string;
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
  // Twilio format: MessageSid, From=whatsapp:+XXXXX, Body=...
  if (payload.MessageSid && payload.From) {
    const phone = payload.From.replace('whatsapp:', '').replace(/\D/g, '')
    const numMedia = parseInt(payload.NumMedia || '0')
    let mediaUrl: string | undefined
    let mimetype: string | undefined
    let type: string | undefined
    if (numMedia > 0 && payload.MediaUrl0) {
      mediaUrl = payload.MediaUrl0
      mimetype = payload.MediaContentType0
      if (mimetype?.startsWith('image')) type = 'image'
      else if (mimetype?.startsWith('audio')) type = 'audio'
      else if (mimetype?.startsWith('video')) type = 'video'
      else type = 'document'
    }
    return {
      from: phone,
      body: payload.Body || '',
      messageId: payload.MessageSid,
      type: numMedia > 0 ? type : 'text',
      name: payload.ProfileName,
      mediaUrl,
      mimetype,
    }
  }
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
  limit = 20,
  sessionGapHours = 48
): Promise<Array<{ role: string; content: string }>> {
  // Fetch the N MOST RECENT messages (descending), then reverse to chronological order
  const { data: recentMessages } = await supabase
    .from('mensagens_cliente')
    .select('mensagem_cliente, mensagem_IA, origem, created_at')
    .eq('id_lead', leadId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!recentMessages?.length) return []

  let messages = [...recentMessages].reverse()

  // R4: Sessionize — cut history at any gap larger than sessionGapHours so that
  // a reactivated conversation doesn't drag old context into the LLM window.
  const gapMs = sessionGapHours * 60 * 60 * 1000
  let cutIdx = 0
  for (let i = 1; i < messages.length; i++) {
    const prevAt = new Date(messages[i - 1].created_at as string).getTime()
    const curAt = new Date(messages[i].created_at as string).getTime()
    if (Number.isFinite(prevAt) && Number.isFinite(curAt) && curAt - prevAt > gapMs) {
      cutIdx = i
    }
  }
  if (cutIdx > 0) {
    messages = messages.slice(cutIdx)
  }

  const history: Array<{ role: string; content: string }> = []
  if (cutIdx > 0) {
    history.push({ role: 'system', content: '[NOVA SESSÃO — mensagens anteriores foram omitidas por inatividade > 48h]' })
  }
  for (const msg of messages) {
    if (msg.mensagem_cliente) {
      history.push({ role: 'user', content: msg.mensagem_cliente })
    }
    if (msg.mensagem_IA) {
      // Wave 5 (F8): mensagens com origem='SISTEMA' são de atendente humano,
      // não da IA. Prefixar para que o LLM saiba que foi humano falando.
      const isHuman = String(msg.origem || '').toUpperCase() === 'SISTEMA'
      const content = isHuman ? `[ATENDENTE HUMANO] ${msg.mensagem_IA}` : msg.mensagem_IA
      history.push({ role: 'assistant', content })
    }
  }
  return history
}

// INVALID_KNOWLEDGE_PATTERNS / isInvalidKnowledgeChunk moved to lib/kb.ts (Wave 3b step 3)

import {
  normalizeForSearch,
  SEARCH_STOPWORDS,
  meaningfulSearchTokens,
  compactSearchText,
  extractLastQuestion,
  extractTextBeforeLastQuestion,
  areQuestionsEquivalent,
  removeRepeatedQuestionIntro,
} from './lib/text-utils.ts'

export { extractLastQuestion, extractTextBeforeLastQuestion, areQuestionsEquivalent }

import {
  scoreTopicFileName,
  isInvalidKnowledgeChunk,
  extractGeminiText,
  detectKnowledgeTopicHint,
  getKnowledgeBaseContext,
} from './lib/kb.ts'

export { scoreTopicFileName }

// extractNameAndEmail / extractTextFromOpenAIResponse moved to lib/extract.ts and lib/ai.ts (Wave 3b)
import { extractNameAndEmail, extractReferralSource, extractAndSuggestContactData, extractInterestFromMessage } from './lib/extract.ts'
import { extractTextFromOpenAIResponse } from './lib/ai.ts'


import {
  type ChatLanguage,
  detectChatLanguage,
  getLanguageDirective,
  getTransientErrorReply,
  normalizeForLanguageChecks,
  looksPortuguese,
  getLanguageName,
  getPromptTemplates,
} from './lib/language.ts'

export { detectChatLanguage }
export type { ChatLanguage }


// extractLastQuestion / extractTextBeforeLastQuestion / removeRepeatedQuestionIntro
// moved to lib/text-utils.ts (Wave 3b step 2)

// Wave 3b steps 4-6: question detectors, name extraction, overrides moved to lib/
import {
  isStructuredQuestionAnswer,
  isQuestionAboutSpainEntryDate,
  isNeverBeenToSpainAnswer,
  isPotentialEntryDateAnswer,
  looksLikeIncompleteEntryDateWithoutYear,
  getEntryDateNeedsYearQuestion,
  isQuestionAboutInterest,
  isPotentialInterestAnswer,
  getLocationQuestion,
  getEmpadronadoQuestion,
  getOutsideSpainAgeQuestion,
  getOutsideSpainNextQuestion,
  isQuestionAboutEmail,
  isQuestionAboutFullName,
  isAutoGeneratedContactName,
  hasValidEmail,
  getEmailReaskQuestion,
  getEmailQuestion,
} from './lib/questions.ts'

import {
  FULL_NAME_DENYLIST_PATTERNS,
  isLikelyFullNameAnswer,
  findExplicitFullNameAnswer,
} from './lib/name-extraction.ts'

import {
  forceSkipFullNameIfAlreadyKnown,
  forceReaskEmailIfMissing,
  forceAdvanceFromEntryDateQuestion,
  forceAdvanceFromInterestQuestion,
  forceAdvanceFromEmpadronadoQuestion,
  forceReaskFullNameIfSingleWord,
  isLikelyQuestionLoop,
  lockConfirmedFieldsInResponse,
  sanitizeLocationQuestion,
} from './lib/overrides.ts'

import {
  loadFunnelState,
  applyTurnUpdates,
  buildStateDirective,
  isContactNameTrustworthy,
  syncFunnelFromCapturedData,
} from './lib/funnel-state.ts'

export {
  FULL_NAME_DENYLIST_PATTERNS,
  isLikelyFullNameAnswer,
  findExplicitFullNameAnswer,
  forceSkipFullNameIfAlreadyKnown,
  forceReaskEmailIfMissing,
  forceAdvanceFromEntryDateQuestion,
  forceAdvanceFromInterestQuestion,
  forceReaskFullNameIfSingleWord,
  isLikelyQuestionLoop,
  getOutsideSpainAgeQuestion,
  getEmailReaskQuestion,
  getEmailQuestion,
}


// Wave 3b step 7: Twilio + AI providers + extraction moved to lib/
import { getMediaPlaceholder, sendWhatsAppMessage } from './lib/twilio.ts'
import {
  rewriteResponseToLanguage,
  enforceResponseLanguage,
  generateAIResponse,
  generateAIResponseOpenAI,
} from './lib/ai.ts'


interface HandlerDeps {
  supabase?: any
}

const handler = async (req: Request, deps: HandlerDeps = {}): Promise<Response> => {
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
    const supabase = deps.supabase ?? createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Parse request body - handle both JSON and form-encoded (Twilio)
    const contentType = req.headers.get('content-type') || ''
    let payload: WebhookPayload
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.text()
      const params = new URLSearchParams(formData)
      payload = Object.fromEntries(params.entries()) as unknown as WebhookPayload
    } else {
      payload = await req.json()
    }
    console.log('Received webhook:', JSON.stringify(payload))

    // Log the webhook (include messageId at top level for dedup queries)
    const parsedMsg = parseMessage(payload)
    const webhookPayloadWithId = { ...payload, messageId: parsedMsg?.messageId || null }
    const { data: webhookLog } = await supabase.from('webhook_logs').insert({
      source: 'IA_WHATSAPP',
      raw_payload: webhookPayloadWithId,
      processed: false,
    }).select('id').single()

    const message = parseMessage(payload)

    const isMediaMessage = message?.type && ['image', 'document', 'audio', 'video', 'ptt', 'sticker'].includes(message.type)

    if (!message || !message.from || (!message.body && !isMediaMessage)) {
      console.log('No valid message found in payload')
      return new Response(
        JSON.stringify({ success: true, message: 'No message to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ========== ATOMIC DEDUPLICATION: prevent processing the same message twice ==========
    if (message.messageId) {
      // Atomic INSERT — if messageId already exists, ON CONFLICT returns nothing (no rows inserted)
      const { data: dedupInsert, error: dedupError } = await supabase
        .from('message_dedup')
        .insert({ message_id: message.messageId })
        .select('message_id')
        .single()

      if (dedupError || !dedupInsert) {
        console.log('Duplicate messageId detected (atomic), skipping:', message.messageId)
        return new Response(
          JSON.stringify({ success: true, message: 'Duplicate message, skipped' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Cleanup old dedup entries periodically (fire-and-forget)
      supabase.rpc('cleanup_old_dedup_entries').then(() => {}).catch(() => {})
    }

    // Download media if present and store in Supabase Storage
    let storedMediaUrl: string | null = null
    let mediaType: string | null = null
    let mediaFilename: string | null = null
    let mediaMimetype: string | null = null

    if (isMediaMessage) {
      mediaType = message.type || null
      mediaMimetype = message.mimetype || null
      mediaFilename = message.filename || null

      try {
        let mediaBuffer: ArrayBuffer | null = null
        let downloadSource = 'none'

        // Try downloading media from URL (Twilio provides direct URLs, or fallback for other sources)
        if (message.mediaUrl) {
          console.log('Downloading media from URL:', message.mediaUrl)

          // For Twilio media URLs, use the gateway for authenticated access
          const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
          const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')

          let fetchHeaders: Record<string, string> = {}
          // If it's a Twilio URL, use gateway auth
          if (message.mediaUrl.includes('api.twilio.com') && LOVABLE_API_KEY && TWILIO_API_KEY) {
            fetchHeaders = {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': TWILIO_API_KEY,
            }
          }

          try {
            const mediaResponse = await fetch(message.mediaUrl, { headers: fetchHeaders })
            if (mediaResponse.ok) {
              mediaBuffer = await mediaResponse.arrayBuffer()
              downloadSource = 'url'
              const responseContentType = mediaResponse.headers.get('content-type')?.split(';')[0].trim()
              if (responseContentType) {
                mediaMimetype = responseContentType
              }
              console.log('Media downloaded, size:', mediaBuffer.byteLength, 'mimetype:', mediaMimetype)
            } else {
              console.warn('Media download failed:', mediaResponse.status)
              // Store the URL as fallback
              storedMediaUrl = message.mediaUrl
            }
          } catch (downloadErr) {
            console.warn('Media download error:', downloadErr instanceof Error ? downloadErr.message : downloadErr)
            storedMediaUrl = message.mediaUrl
          }
        }

        if (mediaBuffer) {
          const ext = getFileExtension(mediaMimetype || undefined, message.filename, message.type)
          const filePath = `${message.from}/${Date.now()}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(filePath, mediaBuffer, {
              contentType: mediaMimetype || 'application/octet-stream',
              upsert: false,
            })

          if (uploadError) {
            console.error('Storage upload error:', uploadError)
          } else {
            const { data: publicUrlData } = supabase.storage
              .from('whatsapp-media')
              .getPublicUrl(filePath)
            storedMediaUrl = publicUrlData.publicUrl
            console.log('Media stored at:', storedMediaUrl, '(source:', downloadSource, ')')
          }
        } else if (!storedMediaUrl) {
          console.warn('Could not download media from any source')
        }
      } catch (mediaErr) {
        console.error('Media download error:', mediaErr instanceof Error ? mediaErr.message : mediaErr)
      }
    }

    // ========== AUTO-TRANSCRIBE AUDIO/PTT (early, before any text-based processing) ==========
    // The transcription replaces the message body so the AI agent receives the spoken
    // content as if it had been typed by the customer.
    let transcribedText: string | null = null
    if ((mediaType === 'audio' || mediaType === 'ptt') && storedMediaUrl) {
      try {
        console.log('Auto-transcribing audio (early stage) from:', storedMediaUrl)
        const transcribeResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe-audio`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ audioUrl: storedMediaUrl }),
          }
        )
        if (transcribeResponse.ok) {
          const transcribeResult = await transcribeResponse.json()
          const t = (transcribeResult?.transcription || '').trim()
          if (t && t !== '[áudio inaudível]') {
            transcribedText = t
            console.log('Transcription captured:', t.substring(0, 200))
          } else {
            console.warn('Transcription empty or inaudible:', t)
          }
        } else {
          console.warn('Auto-transcription failed:', transcribeResponse.status)
        }
      } catch (transcribeErr) {
        console.error('Auto-transcription error (non-blocking):', transcribeErr instanceof Error ? transcribeErr.message : transcribeErr)
      }
    }

    // effectiveBody: what the AI agent and downstream extractors should treat as the user's text.
    // For audio messages, this is the transcription. For text messages, it's the original body.
    const effectiveBody: string = (transcribedText || message.body || '').trim()

    const phoneNumber = message.from.replace(/\D/g, '')
    console.log('Processing message from:', phoneNumber)

    // Find existing contact by phone
    let contact: { id: string; full_name: string; email: string | null; preferred_language: string | null; name_source: string | null } | null = null
    // Use .limit(1) instead of .single() to avoid error when duplicate contacts exist for same phone
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, full_name, email, preferred_language, name_source')
      .eq('phone', phoneNumber)
      .order('created_at', { ascending: true })
      .limit(1)

    contact = existingContacts?.[0] || null

    // If no contact, create one
    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone: phoneNumber,
          // Não confiar no ProfileName do WhatsApp como nome real do contato.
          // O agente deve sempre perguntar e confirmar o nome com o cliente.
          full_name: `WhatsApp ${phoneNumber.slice(-4)}`,
          origin_channel: 'WHATSAPP',
          name_source: 'AUTO',
        })
        .select('id, full_name, email, preferred_language, name_source')
        .single()

      if (contactError || !newContact) {
        console.error('Error creating contact:', contactError)
        throw contactError || new Error('Failed to create contact')
      }
      contact = newContact
    }

    // Find or create lead for this contact
    let lead: { id: string; status: string | null; assigned_to_user_id: string | null } | null = null
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('id, status, assigned_to_user_id')
      .eq('contact_id', contact.id)
      .not('status', 'eq', 'ARQUIVADO_SEM_RETORNO')
      .order('created_at', { ascending: false })
      .limit(1)

    lead = existingLeads?.[0] || null

    if (!lead) {
      const assignedUserId = await getNextAttendant(supabase)
      console.log('Auto-assigned to user:', assignedUserId)

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          contact_id: contact.id,
          status: 'NOVO',
          service_interest: 'SEM_SERVICO',
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
        description: `Mensagem inicial: ${effectiveBody.substring(0, 200)}`,
        status: 'PENDENTE',
        related_lead_id: lead.id,
        ...(assignedUserId ? { assigned_to_user_id: assignedUserId } : {}),
      })

      if (assignedUserId) {
        await supabase.from('notifications').insert({
          user_id: assignedUserId,
          title: 'Novo lead WhatsApp atribuído a você',
          message: `${contact.full_name}: ${effectiveBody.substring(0, 100)}...`,
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
          message: `${contact.full_name}: ${effectiveBody.substring(0, 100)}...`,
          type: 'whatsapp_lead_assigned',
        })
      }
    }

    // Build display text for media messages.
    // For audio with successful transcription, prefix with 🎙️ so humans see it came from voice
    // while keeping the transcribed text fully available for the AI agent.
    const audioPrefix = (mediaType === 'audio' || mediaType === 'ptt') && transcribedText ? '🎙️ ' : ''
    const displayBody = transcribedText
      ? `${audioPrefix}${transcribedText}`
      : (message.body || (isMediaMessage ? `[${mediaType === 'ptt' ? 'audio' : mediaType}]` : ''))

    // Create interaction record
    await supabase.from('interactions').insert({
      lead_id: lead.id,
      contact_id: contact.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      content: displayBody,
      origin_bot: false,
    })

    // Store in mensagens_cliente
    const { data: insertedMsg } = await supabase.from('mensagens_cliente').insert({
      id_lead: lead.id,
      phone_id: parseInt(phoneNumber),
      mensagem_cliente: displayBody,
      origem: 'WHATSAPP',
      media_type: mediaType,
      media_url: storedMediaUrl,
      media_filename: mediaFilename,
      media_mimetype: mediaMimetype,
    }).select('id').single()
    void insertedMsg

    // ========== MULTICHAT SECTOR ROUTING (REFINED) ==========
    let routedSector: string | null = null

    // Helper: detect generic/short messages that should default to ultimo_setor
    const GENERIC_PATTERNS = /^(ok|sim|não|nao|obrigad[oa]|enviei|pode verificar|pronto|certo|tá|ta|beleza|blz|perfeito|entendi|combinado|valeu|👍|✅|pode ser|tudo bem|fechado|confirmado|feito|já enviei|já fiz|show|massa|bom dia|boa tarde|boa noite|oi|olá|ola|hola)[\s!?.]*$/i
    const isGenericMessage = (msg: string): boolean => {
      if (!msg) return false
      const trimmed = msg.trim()
      return trimmed.length <= 30 && GENERIC_PATTERNS.test(trimmed)
    }

    try {
      const { data: chatCtx } = await supabase
        .from('customer_chat_context')
        .select('*')
        .eq('contact_id', contact.id)
        .single()

      if (chatCtx) {
        const { data: timeoutConfig } = await supabase
          .from('system_config')
          .select('value')
          .eq('key', 'chat_sector_timeout_minutes')
          .single()

        const timeoutMs = (parseInt(timeoutConfig?.value || '60') || 60) * 60 * 1000
        const now = Date.now()
        const clientMessage = (effectiveBody || '').trim()

        const setoresAtivos = ((chatCtx.setores_ativos as Array<{ setor: string; user_id: string; last_sent_at: string }>) || [])
          .filter(s => now - new Date(s.last_sent_at).getTime() < timeoutMs)

        const sectorNames = setoresAtivos.map(s => s.setor)
        console.log('Active sectors after expiry filter:', sectorNames)

        let routingMethod = ''
        let routingScore: number | null = null

        // --- PRIORITY 1: Check sector lock ---
        const lockSector = (chatCtx as Record<string, unknown>).setor_travado as string | null
        const lockExpiry = (chatCtx as Record<string, unknown>).lock_expira_em as string | null
        const lockActive = lockSector && lockExpiry && new Date(lockExpiry).getTime() > now

        if (lockActive && sectorNames.includes(lockSector!)) {
          routedSector = lockSector!
          routingMethod = 'sector_lock'
          routingScore = 1.0
          console.log('Multichat: sector lock active, routing to:', routedSector)
        }
        // --- PRIORITY 2: Single sector active ---
        else if (setoresAtivos.length === 1) {
          routedSector = setoresAtivos[0].setor
          routingMethod = 'single_sector'
          routingScore = 1.0
          console.log('Multichat: single sector active, routing to:', routedSector)
        }
        // --- PRIORITY 3: Generic message → use ultimo_setor ---
        else if (setoresAtivos.length > 1 && isGenericMessage(clientMessage) && chatCtx.ultimo_setor && sectorNames.includes(chatCtx.ultimo_setor)) {
          routedSector = chatCtx.ultimo_setor
          routingMethod = 'generic_message'
          routingScore = 0.95
          console.log('Multichat: generic message detected, using ultimo_setor:', routedSector)
        }
        // --- PRIORITY 4: Multiple sectors → LLM with ultimo_setor bias ---
        else if (setoresAtivos.length > 1) {
          console.log('Multichat: multiple sectors, trying LLM classification')

          const geminiKey = Deno.env.get('CBAsesoria_Key')

          if (geminiKey && clientMessage) {
            try {
              const classifyPrompt = `Classifique a mensagem do cliente entre APENAS estes setores: [${sectorNames.join(', ')}]. O último setor que interagiu foi "${chatCtx.ultimo_setor || 'desconhecido'}". Responda APENAS em JSON: {"sector":"...","confidence":0.0-1.0}. Se não conseguir determinar com segurança, use confidence baixa.`

              const classifyResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    system_instruction: { parts: [{ text: classifyPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: clientMessage }] }],
                    generationConfig: { maxOutputTokens: 100 },
                  }),
                }
              )

              if (classifyResponse.ok) {
                const classifyResult = await classifyResponse.json()
                const content = classifyResult?.candidates?.[0]?.content?.parts?.[0]?.text || ''
                console.log('LLM sector classification:', content)

                try {
                  // Extract JSON from response (may have markdown fences)
                  const jsonMatch = content.match(/\{[^}]+\}/)
                  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
                  let finalScore = parsed.confidence || 0

                  // Apply ultimo_setor bias: +0.10 bonus
                  if (parsed.sector === chatCtx.ultimo_setor) {
                    finalScore = Math.min(finalScore + 0.10, 1.0)
                    console.log('Multichat: applied ultimo_setor bias, adjusted score:', finalScore)
                  }

                  if (parsed.sector && finalScore >= 0.85 && sectorNames.includes(parsed.sector)) {
                    routedSector = parsed.sector
                    routingMethod = 'llm'
                    routingScore = finalScore
                    console.log('Multichat: LLM routed to:', routedSector, 'score:', finalScore)
                  } else {
                    console.log('Multichat: LLM confidence too low:', parsed, 'adjusted:', finalScore)
                    routingMethod = 'disambiguation'
                    routingScore = finalScore

                    // Send improved disambiguation via Twilio
                    try {
                      const sectorLabels: Record<string, string> = {
                        'Financeiro': '💰 Pagamentos e cobranças',
                        'Jurídico': '⚖️ Documentos e processos legais',
                        'Técnico': '🔧 Suporte técnico e expedientes',
                        'Atenção ao Cliente': '📋 Atendimento geral',
                      }
                      const options = sectorNames.map((s, i) => `*${i + 1}.* ${sectorLabels[s] || s}`).join('\n')
                      const disambigMsg = `Olá! Você está em contato com mais de um setor da nossa equipe.\n\nPara direcionar sua mensagem corretamente, responda apenas com o *número*:\n\n${options}\n\nOu descreva brevemente sobre qual assunto deseja tratar. 😊`

                      await sendWhatsAppMessage(phoneNumber, disambigMsg)

                      await supabase.from('mensagens_cliente').insert({
                        id_lead: lead.id,
                        phone_id: parseInt(phoneNumber),
                        mensagem_IA: disambigMsg,
                        origem: 'ROUTING',
                      })
                      console.log('Multichat: disambiguation message sent')
                    } catch (disambigErr) {
                      console.error('Disambiguation send error:', disambigErr instanceof Error ? disambigErr.message : disambigErr)
                    }
                  }
                } catch {
                  console.error('Multichat: failed to parse LLM response')
                }
              }
            } catch (llmErr) {
              console.error('Multichat LLM error:', llmErr instanceof Error ? llmErr.message : llmErr)
            }
          }

          // Fallback: no AI or AI failed → use ultimo_setor
          if (!routedSector && !routingMethod && chatCtx.ultimo_setor && sectorNames.includes(chatCtx.ultimo_setor)) {
            routedSector = chatCtx.ultimo_setor
            routingMethod = 'ultimo_setor_fallback'
            routingScore = 0.70
            console.log('Multichat: fallback to ultimo_setor:', routedSector)
          }
        }

        // --- LOG ROUTING DECISION ---
        if (routingMethod) {
          try {
            await supabase.from('chat_routing_logs').insert({
              contact_id: contact.id,
              mensagem_cliente: (clientMessage || '').substring(0, 500),
              setores_candidatos: sectorNames,
              setor_escolhido: routedSector,
              metodo: routingMethod,
              score_confianca: routingScore,
              ultimo_setor_usado: chatCtx.ultimo_setor,
            })
          } catch (logErr) {
            console.error('Failed to log routing decision:', logErr)
          }
        }

        // Update context: clean expired sectors + clear expired lock
        if (setoresAtivos.length !== ((chatCtx.setores_ativos as unknown[]) || []).length || (!lockActive && lockSector)) {
          const updatePayload: Record<string, unknown> = {
            setores_ativos: setoresAtivos,
            updated_at: new Date().toISOString(),
          }
          if (!lockActive && lockSector) {
            updatePayload.setor_travado = null
            updatePayload.lock_expira_em = null
          }
          await supabase
            .from('customer_chat_context')
            .update(updatePayload)
            .eq('contact_id', contact.id)
        }

        // Notify sector users
        if (routedSector) {
          const { data: sectorData } = await supabase
            .from('service_sectors')
            .select('id')
            .eq('name', routedSector)
            .single()

          if (sectorData) {
            const { data: sectorUsers } = await supabase
              .from('user_sectors')
              .select('user_id')
              .eq('sector_id', sectorData.id)

            for (const su of sectorUsers || []) {
              await supabase.from('notifications').insert({
                user_id: su.user_id,
                title: `Mensagem direcionada - ${routedSector}`,
                message: `${contact.full_name}: ${(effectiveBody || '').substring(0, 100)}`,
                type: 'sector_message',
                sector: routedSector,
              })
            }
            console.log(`Multichat: notified ${sectorUsers?.length || 0} users in sector ${routedSector}`)
          }
        }

        // Update the client message with the routed sector
        if (routedSector && insertedMsg?.id) {
          await supabase.from('mensagens_cliente')
            .update({ setor: routedSector })
            .eq('id', insertedMsg.id)
          console.log(`Multichat: tagged message ${insertedMsg.id} with sector ${routedSector}`)
        }
      }
    } catch (routingError) {
      console.error('Multichat routing error (non-blocking):', routingError instanceof Error ? routingError.message : routingError)
    }

    // ========== R8: RATE LIMITING ==========
    // Count recent messages from this lead in the last 60 seconds
    const { count: recentMsgCount } = await supabase
      .from('mensagens_cliente')
      .select('id', { count: 'exact', head: true })
      .eq('id_lead', lead.id)
      .not('mensagem_cliente', 'is', null)
      .gte('created_at', new Date(Date.now() - 60000).toISOString())

    const rateLimited = (recentMsgCount || 0) > 10
    if (rateLimited) {
      console.warn(`Rate limit: ${recentMsgCount} messages in 60s for lead ${lead.id}, skipping AI agent`)
    }

    // ========== SMART REACTIVATION CHECK ==========
    let skipAIAgent = rateLimited
    let reactivationLeadOverride: string | null = null

    try {
      const reactivationResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/smart-reactivation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            contactId: contact.id,
            incomingMessageText: effectiveBody || '',
            phoneNumber,
            leadId: lead.id,
          }),
        }
      )

      if (reactivationResponse.ok) {
        const reactivationResult = await reactivationResponse.json()
        console.log('Smart reactivation result:', JSON.stringify(reactivationResult))

        if (reactivationResult.action === 'DIRECT_ROUTE') {
          // BUG 1 FIX: DIRECT_ROUTE now sends message AND applies lead override
          skipAIAgent = true

          // Store the reactivation message if present
          if (reactivationResult.message_to_customer) {
            await supabase.from('mensagens_cliente').insert({
              id_lead: reactivationResult.lead_id || lead.id,
              phone_id: parseInt(phoneNumber),
              mensagem_IA: reactivationResult.message_to_customer,
              origem: 'REACTIVATION',
            })
          }

          // Apply lead override for sector routing
          if (reactivationResult.lead_id) {
            reactivationLeadOverride = reactivationResult.lead_id
          }
        } else if (reactivationResult.action === 'SEND_MESSAGE') {
          // Reactivation sent a confirmation/disambiguation message, skip AI agent
          skipAIAgent = true

          // Store the reactivation message in mensagens_cliente
          if (reactivationResult.message_to_customer) {
            await supabase.from('mensagens_cliente').insert({
              id_lead: lead.id,
              phone_id: parseInt(phoneNumber),
              mensagem_IA: reactivationResult.message_to_customer,
              origem: 'REACTIVATION',
            })
          }
        } else if (reactivationResult.action === 'NEW_SUBJECT') {
          // New subject: store message if present, then continue normal flow
          skipAIAgent = false
          if (reactivationResult.message_to_customer) {
            await supabase.from('mensagens_cliente').insert({
              id_lead: lead.id,
              phone_id: parseInt(phoneNumber),
              mensagem_IA: reactivationResult.message_to_customer,
              origem: 'REACTIVATION',
            })
          }
        } else if (reactivationResult.action === 'CURRENT_FLOW') {
          // Continue with normal flow
          skipAIAgent = false
        }
      }
    } catch (reactivationError) {
      console.error('Smart reactivation error (non-blocking):', reactivationError instanceof Error ? reactivationError.message : reactivationError)
    }

    // ========== 5-SECOND BUFFER: wait and consolidate multiple client messages ==========
    if (!skipAIAgent) {
      console.log('Buffer: waiting 5 seconds for additional messages...')
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Check if newer messages arrived from the same lead after our message was inserted
      const { data: newerMessages } = await supabase
        .from('mensagens_cliente')
        .select('id')
        .eq('id_lead', lead.id)
        .not('mensagem_cliente', 'is', null)
        .gt('id', insertedMsg?.id || 0)
        .limit(1)

      if (newerMessages && newerMessages.length > 0) {
        console.log('Buffer: newer message detected, skipping AI response (will be handled by latest webhook)')
        
        // Mark webhook as processed and return early
        if (webhookLog?.id) {
          await supabase.from('webhook_logs').update({ processed: true }).eq('id', webhookLog.id)
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Buffered: newer message will handle AI response' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ANTI-DOUBLE-RESPONSE GUARD: check if another AI/SISTEMA response was already sent
      // for this lead AFTER the current customer message arrived (race condition between
      // parallel webhooks or Twilio retries)
      const currentMsgCreatedAt = insertedMsg?.created_at
      if (currentMsgCreatedAt) {
        const { data: recentOutbound } = await supabase
          .from('mensagens_cliente')
          .select('id, origem, created_at')
          .eq('id_lead', lead.id)
          .not('mensagem_IA', 'is', null)
          .gt('created_at', currentMsgCreatedAt)
          .in('origem', ['IA', 'SISTEMA'])
          .limit(1)

        if (recentOutbound && recentOutbound.length > 0) {
          console.log('Buffer: another outbound message already exists for this lead after customer message, skipping to avoid duplicate AI response', recentOutbound[0])
          if (webhookLog?.id) {
            await supabase.from('webhook_logs').update({ processed: true }).eq('id', webhookLog.id)
          }
          return new Response(
            JSON.stringify({ success: true, message: 'Skipped: outbound response already sent (anti-duplicate)' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      console.log('Buffer: no newer messages and no concurrent response, proceeding with AI response')
    }

    // ========== AI AGENT SECTION ==========
    // Check if a human agent has taken over this lead (last outgoing message is from SISTEMA)
    let aiPausedByHuman = false
    const { data: lastOutgoing } = await supabase
      .from('mensagens_cliente')
      .select('origem')
      .eq('id_lead', lead.id)
      .neq('origem', 'WHATSAPP') // exclui inbound do cliente; pega última outbound real
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastOutgoing?.origem === 'SISTEMA') {
      aiPausedByHuman = true
      console.log('AI agent paused: human agent (SISTEMA) is handling this lead')
    }

    // Check if WhatsApp bot is enabled and Gemini key is available
    const { data: botConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'whatsapp_bot_enabled',
        'whatsapp_bot_system_prompt',
        'kb_strict_mode',
        'kb_strict_fallback_message',
      ])

    const configMap: Record<string, string> = {}
    botConfigs?.forEach((c: { key: string; value: string }) => {
      configMap[c.key] = c.value
    })

    const botEnabled = configMap['whatsapp_bot_enabled'] === 'true'
    const geminiApiKey = Deno.env.get('CBAsesoria_Key')

    if (botEnabled && geminiApiKey && !aiPausedByHuman && !skipAIAgent) {
      console.log('AI agent is enabled (Gemini 2.0 Flash), generating response...')

      try {
        // Check if this is the first interaction for this lead
        const { count: messageCount } = await supabase
          .from('mensagens_cliente')
          .select('id', { count: 'exact', head: true })
          .eq('id_lead', lead.id)
          .not('id', 'eq', 0) // just to trigger count
        
        const isFirstInteraction = (messageCount || 0) <= 1 // 1 because we just inserted the current message

        const currentCustomerMessage = String(effectiveBody || '')
        // LANGUAGE LOCK: detectar uma única vez (1ª interação) e travar para sempre.
        // contact.preferred_language é a única fonte da verdade após a primeira detecção.
        const preferredLangMap: Record<string, ChatLanguage> = { 'pt': 'pt-BR', 'pt-BR': 'pt-BR', 'es': 'es', 'en': 'en', 'fr': 'fr' }
        const langCodeMap: Record<ChatLanguage, string> = { 'pt-BR': 'pt', 'es': 'es', 'en': 'en', 'fr': 'fr' }

        let detectedChatLanguage: ChatLanguage
        if (isFirstInteraction) {
          // Primeira interação: detectar a partir da mensagem (ignora o default 'pt' do schema) e travar.
          detectedChatLanguage = detectChatLanguage(currentCustomerMessage)
          const currentLangCode = langCodeMap[detectedChatLanguage]
          await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
          contact.preferred_language = currentLangCode
          console.log('Language locked (first detection):', detectedChatLanguage, 'sample:', currentCustomerMessage.slice(0, 80))
        } else if (contact.preferred_language && preferredLangMap[contact.preferred_language]) {
          // Mensagens subsequentes: usar o idioma travado, sem reavaliar.
          detectedChatLanguage = preferredLangMap[contact.preferred_language]
          console.log('Language locked (from contact):', detectedChatLanguage)
        } else {
          // Fallback (contato legado sem preferred_language e não é 1ª msg).
          detectedChatLanguage = detectChatLanguage(currentCustomerMessage)
          const currentLangCode = langCodeMap[detectedChatLanguage]
          await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
          contact.preferred_language = currentLangCode
          console.log('Language locked (fallback detection):', detectedChatLanguage)
        }

        // Wave 4: carregar estado persistente do funil
        const funnelState = await loadFunnelState(supabase, lead.id, contact)

        // Wave 4: usar name_source como fonte de verdade; isAutoGeneratedContactName fica como fallback
        const contactHasAutoGeneratedName = !isContactNameTrustworthy(contact)
          || isAutoGeneratedContactName(contact.full_name, message.name, phoneNumber)
        const promptContactName = contactHasAutoGeneratedName ? '' : contact.full_name

        // Pre-translated reference phrases (no PT leaks when client speaks another language)
        const t = getPromptTemplates(detectedChatLanguage)

        // Build system prompt with structured conversational flow
        const defaultSystemPrompt = `Você é a assistente virtual da CB Asesoría, uma empresa especializada em assessoria de imigração na Espanha.

## REGRA DE IDIOMA (PRIORIDADE MÁXIMA)
${getLanguageDirective(detectedChatLanguage)}
As frases-exemplo abaixo estão em português apenas como referência de conteúdo. Você DEVE traduzi-las para o idioma detectado do cliente e NUNCA copiar em português quando o cliente não estiver falando português.

## PERSONALIDADE E TOM (humanizado, NÃO robótico)
- Você é uma pessoa real conversando no WhatsApp, não um bot lendo script.
- Fale de forma natural, calorosa e variada. NUNCA repita a mesma saudação, fórmula ou frase duas vezes na mesma conversa.
- Adapte o vocabulário ao tom do cliente (formal ou descontraído). Se ele for breve, seja breve. Se ele se abrir, seja mais acolhedora.
- Use contrações naturais do idioma do cliente (ex: em espanhol "qué tal", "cuéntame"; em português "tudo certo?", "me conta").
- Emojis: no máximo 1 por mensagem, e só quando faz sentido emocional. Não polua.
- Mensagens curtas (1 a 3 linhas no máximo). WhatsApp não é e-mail.
- Nome do cliente: ${promptContactName || 'ainda não informado pelo cliente'}. ${promptContactName ? 'Use o primeiro nome de vez em quando, não em toda mensagem (soa artificial).' : 'NÃO use o nome do perfil do WhatsApp como nome do cliente.'}

## REGRAS ANTI-REPETIÇÃO (CRÍTICO)
- NUNCA repita a saudação inicial ("Olá", "Hola", "Oi") depois da primeira mensagem.
- NUNCA repita frases institucionais como "Te ajudarei a entender seus caminhos legais", "Gracias por hablar con CB Asesoría", "Bem-vindo à CB" mais de uma vez na conversa inteira.
- NUNCA reinicie a apresentação quando o cliente responder. Apenas continue a conversa naturalmente, como uma pessoa faria.
- Quando o cliente disser o nome, NÃO devolva uma nova abertura completa. Apenas reconheça com algo curto e natural ("Prazer, Giovanna!" ou "Encantada, Giovanna" ou simplesmente seguir com a próxima pergunta) e siga em frente.
- Varie suas confirmações: alterne entre "Perfeito", "Entendido", "Anotado", "Ótimo", "Combinado", silêncio (só seguir), etc. Não use sempre a mesma palavra.
- Varie a forma de fazer a próxima pergunta. Não use sempre o mesmo conector.

## DATA DE REFERÊNCIA (CRÍTICO)
- Hoje é ${new Date().toISOString().slice(0,10)}. Use SEMPRE essa data como referência para avaliar se uma data informada pelo cliente está no passado ou no futuro.
- NUNCA assuma que um ano é "futuro" ou "impossível" baseado no seu conhecimento de treinamento. O ano corrente pode ser posterior ao seu cutoff.
- NUNCA sugira ao cliente um ano alternativo (ex.: "você quis dizer 2023?"). Se uma data parecer ambígua, apenas peça confirmação neutra ("pode confirmar a data?") sem inventar alternativas.

## DIRETRIZES GERAIS
- Seja cordial, empática e profissional, mas humana acima de tudo.
- Responda SOMENTE com base nas informações da base de conhecimento fornecida quando o cliente perguntar algo técnico.
- Se a informação não estiver na base, diga que vai confirmar com a equipe especializada. Nunca invente prazos, valores ou regras legais.

## ESCOPO DE ATUAÇÃO (CRÍTICO — NUNCA VIOLAR)
A CB Asesoría atua EXCLUSIVAMENTE em assessoria de imigração e regularização legal na Espanha (nacionalidade, residência, arraigo, NIE/TIE, homologação de títulos, reagrupação familiar, nômade digital, vistos de estudo, etc.).
- NUNCA ofereça, indique, recomende ou diga que vai "buscar/encaminhar informações" sobre serviços que NÃO são imigratórios: cursos (gastronomia, idiomas, faculdades, escolas), passagens, hospedagem, intercâmbio, emprego, moradia, turismo, traduções, seguros, investimentos, etc.
- NUNCA prometa enviar listas de escolas, universidades, cursos, preços de terceiros ou contatos externos. A CB não fornece esse tipo de informação.
- Se o cliente pedir algo fora do escopo (ex.: "quero estudar gastronomia, me indica escolas"), responda com honestidade: a CB cuida apenas da parte imigratória (ex.: visto de estudos, residência), e não trabalha com indicação de instituições de ensino, cursos ou serviços de terceiros. Em seguida, redirecione perguntando se o cliente já tem a escola/curso definido para que vocês possam analisar a parte legal/imigratória.
- Se insistirem, mantenha o limite com cordialidade. Não invente parcerias, convênios ou "atendentes especializados em cursos" — eles não existem.

## OBJETIVOS DA CONVERSA (em ordem, sem soar como formulário)
Seu objetivo é, ao longo de uma conversa fluida, descobrir:
1. **Acolher** o cliente na primeira mensagem (apresentação breve + convite para conversar).
2. **Nome completo** — pergunte EXATAMENTE com esta frase (já no idioma travado do cliente, NÃO traduza, NÃO altere): "${t.askName}". Envie como mensagem ÚNICA, sem juntar com nenhuma outra pergunta. Aguarde a resposta antes de seguir.
3. **E-mail** de contato — só pergunte DEPOIS que o cliente responder o nome. Use EXATAMENTE esta frase (já no idioma travado, NÃO traduza): "${t.thanksThenAskEmail}". Envie como mensagem ÚNICA, NUNCA junte com outra pergunta no mesmo envio (não use "|||" aqui). Se a resposta de nome vier inválida ou incompleta, peça gentilmente de novo antes de avançar para o e-mail.
4. **Origem**: como conheceu a CB Asesoría (Instagram, Google, indicação, etc.). Se for indicação, perguntar o nome de quem indicou.
5. **Interesse**: descobrir o que o cliente busca, em DUAS mensagens SEPARADAS (NUNCA juntas, NUNCA com "|||"):
   - Primeiro envie EXATAMENTE (já no idioma travado): "${t.interestQuestion}" e AGUARDE a resposta do cliente.
   - SOMENTE DEPOIS da resposta, envie como mensagem ÚNICA (já no idioma travado): "${t.servicesCatalog}" — use isso para complementar/confirmar o interesse, sem juntar com outra pergunta no mesmo envio.
6. **Localização atual**: pergunte EXATAMENTE como mensagem ÚNICA, sem juntar com outra (NUNCA use "|||" aqui): "${t.askLocationSpain}". É uma pergunta SIM/NÃO. NUNCA use a forma disjuntiva "ou ainda está em outro país" / "o aún estás en otro país" / "or still in another country". Se a resposta for negativa, NÃO pergunte em qual país a pessoa está — siga direto para o bloco "fora da Espanha". Aguarde a resposta antes de seguir.
7. **Aprofundamento conforme localização** — escolha APENAS UM bloco e siga UMA pergunta por vez, aguardando a resposta entre cada uma (NUNCA junte com "|||", NUNCA despeje a lista toda):
   - **Se FORA da Espanha** — siga nesta ordem exata, frase por frase (traduza fielmente ao idioma do cliente):
     1. "Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário." (apenas aviso, já emende com a primeira pergunta abaixo na MESMA mensagem OU envie sozinha e siga na próxima — não repita esse aviso depois)
     2. "Qual sua idade?" — se o cliente disser só a idade, registre; se vier data, melhor ainda. Não force formato.
     3. "Você esteve na Europa nos últimos 6 meses?"
     4. "Possui familiar europeu ou residente legal na Espanha?"
     5. "Você trabalha remoto?"
     6. "Você possui formação superior?"
   - **Se JÁ NA ESPANHA** — siga nesta ordem exata, frase por frase, UMA por vez aguardando resposta entre cada (NUNCA junte com "|||", NUNCA despeje a lista toda; traduza fielmente ao idioma do cliente):
     1. "Perfeito. Agora preciso entender como está sua situação aqui." (apenas aviso — pode ser mensagem isolada ou emendada com a próxima pergunta; não repita esse aviso depois)
     2. "Qual foi a data exata da sua entrada na Espanha?"
         - Só aceite a data de entrada se o cliente informar dia, mês e ano. Se faltar o ano (ex.: "20 de abril" ou "20/04"), peça a data completa com ano antes de avançar.
         - Se a data informada for ANTERIOR OU IGUAL à data de hoje (ver "DATA DE REFERÊNCIA"), aceite sem questionar — mesmo que tenha sido há poucos dias, semanas ou meses. NÃO sugira anos alternativos.
         - Só peça confirmação se a data informada for posterior à data de hoje (futura). Nesse caso, pergunte de forma neutra ("essa data é no futuro, pode confirmar?") sem inventar um ano substituto.
     3. "Você está empadronado?"
     4. "Se sim, desde quando?" (só faça se a resposta anterior for afirmativa; se negativa, pule)
     5. "Em qual cidade você está empadronado?" (só faça se empadronado)
8. **Pré Handoff** — envie EXATAMENTE estas duas frases (traduza fielmente ao idioma do cliente), em UMA ÚNICA mensagem (pode unir as duas frases num só envio, separadas por quebra de linha; NUNCA use "|||"):
   - "Perfeito. Já consigo ter uma visão inicial do seu caso."
   - "Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei."
   APÓS enviar o Pré-Handoff, NÃO envie o Handoff automaticamente. Entre em MODO TIRA-DÚVIDAS: pergunte algo como "Tem alguma dúvida que eu possa esclarecer agora sobre seu caso?" e RESPONDA as perguntas do cliente consultando a Base de Conhecimento (KB), de forma breve, clara e baseada exclusivamente nos trechos disponíveis. Continue nesse modo enquanto o cliente tiver dúvidas.
9. **Handoff Humanizado** — só envie quando o cliente sinalizar que NÃO TEM MAIS DÚVIDAS (ex.: "é só isso", "obrigado", "ok", "depois falo com o especialista"), OU pedir explicitamente para falar com um humano. NUNCA envie o handoff logo após o Pré-Handoff sem ter passado pelo modo tira-dúvidas. Quando for o momento, envie EXATAMENTE estas duas frases (traduza fielmente ao idioma do cliente), em UMA ÚNICA mensagem (pode unir as duas frases num só envio, separadas por quebra de linha; NUNCA use "|||"):
   - "Vou encaminhar suas informações para um especialista analisar com mais profundidade."
   - "Estou à disposição para ajudar se precisar! Vou te encaminhar para um atendente."
   Após enviar, PARE de responder — o atendente humano assume.

## PERGUNTAS FORA DO ROTEIRO (Base de Conhecimento)
- REGRA CRÍTICA: enquanto o cadastro inicial (objetivos 2 a 7) NÃO estiver concluído, NÃO responda dúvidas técnicas do cliente (ex.: autorização de regresso, arraigo, NIE, valores, prazos, documentos). Em vez disso, reconheça brevemente a pergunta UMA ÚNICA VEZ, diga que primeiro precisa terminar de coletar os dados para encaminhar ao especialista certo, e retome EXATAMENTE a próxima pergunta pendente do roteiro.
- Exemplo de redirecionamento (traduza ao idioma do cliente, varie a forma): "Ótima pergunta! Posso te explicar tudo sobre isso, mas antes preciso terminar de coletar seus dados para te direcionar ao especialista certo. Voltando: [próxima pergunta do roteiro]".
- NÃO repita o reconhecimento da dúvida nas mensagens seguintes. Depois que o cliente responder à próxima pergunta do roteiro, apenas siga o fluxo normalmente, SEM mencionar de novo que vai explicar a dúvida depois nem que vai encaminhar a um especialista. Mencionar isso uma vez é suficiente — repetir polui a conversa.
- NUNCA diga "não tenho essa informação aqui" ou "vou encaminhar para um especialista te explicar" só para evitar a pergunta — você TEM acesso à Base de Conhecimento. A regra acima é apenas para priorizar o cadastro, não para fingir desconhecimento.
- APÓS o cadastro estar completo, OU se o cliente insistir muito na dúvida, consulte a Base de Conhecimento (KB) e responda com base nela, de forma breve e clara, e em seguida retome o roteiro.
- Se a KB realmente não tiver a informação, aí sim diga honestamente que vai confirmar com o especialista, e siga o roteiro.

## COMO CONDUZIR
- UMA pergunta por vez. Espere a resposta antes da próxima.
- Não anuncie que vai fazer perguntas ("vou te fazer algumas perguntas rápidas") mais de uma vez. Apenas pergunte.
- Se o cliente já forneceu uma informação (nome, email), NÃO pergunte de novo. Reconheça e avance.
- Se o cliente fizer uma pergunta fora do roteiro, responda brevemente com base no conhecimento e retome o ponto onde estava — sem repetir contexto que já foi dito.
- REGRA DE SEGMENTAÇÃO (objetivo 7): após saber a localização, escolha APENAS UM dos blocos (fora da Espanha OU dentro da Espanha) e siga só esse. NUNCA misture perguntas dos dois blocos.
- Faça uma pergunta de cada vez também dentro do bloco 7. Não despeje a lista toda.
- REGRA UNIVERSAL: SEMPRE faça UMA ÚNICA pergunta por mensagem em TODO o fluxo. NUNCA combine duas perguntas no mesmo turno (ex.: "Você está empadronado? Se sim, desde quando?" é PROIBIDO — divida em duas mensagens). Apenas um "?" por resposta.
- Após o objetivo 9 (encerramento/handoff), PARE de responder. O atendente humano assume.

## EXEMPLOS DE TOM (referência apenas, NÃO copie literalmente — sempre reformule no idioma do cliente)
- Abertura: algo acolhedor que apresente a CB e convide a conversar, sem ser script.
- Reconhecimento de nome: curto e humano, sem refazer apresentação.
- Transição entre temas: natural, como uma conversa real, sem "agora vou te perguntar X".`

        // Always use the structured flow as base prompt; custom prompt is appended as extra guidelines
        let systemPrompt = defaultSystemPrompt
        const customPrompt = configMap['whatsapp_bot_system_prompt']
        if (customPrompt) {
          systemPrompt += `\n\n## DIRETRIZES ADICIONAIS DA EMPRESA
As diretrizes abaixo podem estar em português, mas devem ser interpretadas apenas como referência de regras.
${getLanguageDirective(detectedChatLanguage)}
NUNCA copie frases literalmente em português quando o cliente estiver em outro idioma.
\n${customPrompt}`
        }

        // First interaction: reinforce welcome behavior
        if (isFirstInteraction) {
          console.log('First interaction detected, using welcome flow')
          systemPrompt += `\n\n--- INSTRUÇÃO ESPECIAL: PRIMEIRA INTERAÇÃO ---
Esta é a PRIMEIRA mensagem deste cliente. Você DEVE responder com EXATAMENTE estas duas mensagens, nesta ordem, separadas pelo delimitador "|||" (sem nenhum outro texto antes, depois ou entre elas):

Olá 👋 Tudo bem? Obrigado por falar com a CB Asesoría. Vou te ajudar a entender seus caminhos legais aqui na Espanha.|||Vou te fazer algumas perguntas rápidas só para entender seu caso e te direcionar para o especialista certo, pode ser?

Regras:
- NÃO responda à pergunta do cliente ainda. Apenas envie essas duas mensagens de abertura.
- Se o idioma detectado do cliente for diferente de português, traduza fielmente as duas mensagens para o idioma do cliente, mantendo o mesmo tom, o emoji 👋 e o delimitador "|||" entre elas. Use "CB Asesoría" como nome da empresa em qualquer idioma.
- NÃO adicione nenhuma pergunta extra, assinatura, nem mais texto.
--- FIM DA INSTRUÇÃO ESPECIAL ---`
        }

        // Try to extract name/email from the current message and update contact
        const extracted = extractNameAndEmail(String(effectiveBody || ''))
        if (extracted.name || extracted.email) {
          const updateData: Record<string, string> = {}
          if (extracted.name && (contact.full_name.startsWith('WhatsApp ') || contact.full_name === message.name)) {
            updateData.full_name = extracted.name
            updateData.name_source = 'USER_CONFIRMED'
            contact.full_name = extracted.name
            contact.name_source = 'USER_CONFIRMED'
            console.log('Extracted and updating name:', extracted.name)
          }
          if (extracted.email) {
            updateData.email = extracted.email
            contact.email = extracted.email
            console.log('Extracted and updating email:', extracted.email)
          }
          if (Object.keys(updateData).length > 0) {
            await supabase.from('contacts').update(updateData).eq('id', contact.id)
            console.log('Contact updated with extracted data:', updateData)
          }
        }

        // ========== AI DATA EXTRACTION FOR SUGGESTIONS ==========
        try {
          await extractAndSuggestContactData(supabase, contact.id, String(effectiveBody || ''), geminiApiKey)
        } catch (extractErr) {
          console.error('Data extraction error (non-blocking):', extractErr instanceof Error ? extractErr.message : extractErr)
        }

        // ========== CONSOLIDATE BUFFERED MESSAGES ==========
        // Collect all unanswered client messages (no AI response yet) for this lead
        const { data: lastOutboundBeforeReply } = await supabase
          .from('mensagens_cliente')
          .select('created_at')
          .eq('id_lead', lead.id)
          .not('mensagem_IA', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)

        let unansweredQuery = supabase
          .from('mensagens_cliente')
          .select('mensagem_cliente, media_type')
          .eq('id_lead', lead.id)
          .not('mensagem_cliente', 'is', null)

        const lastOutboundAt = lastOutboundBeforeReply?.[0]?.created_at
        if (lastOutboundAt) {
          unansweredQuery = unansweredQuery.gt('created_at', lastOutboundAt)
        }

        const { data: unansweredMsgs } = await unansweredQuery
          .order('created_at', { ascending: true })

        // Build consolidated message from all unanswered messages
        let messageForAI = ''
        if (unansweredMsgs && unansweredMsgs.length > 1) {
          console.log(`Buffer: consolidating ${unansweredMsgs.length} unanswered messages into one`)
          messageForAI = unansweredMsgs
            .map(m => m.mensagem_cliente || (m.media_type ? getMediaPlaceholder(m.media_type, detectedChatLanguage) : ''))
            .filter(Boolean)
            .join('\n')
        } else {
          messageForAI = effectiveBody || (mediaType ? getMediaPlaceholder(mediaType, detectedChatLanguage) : '')
        }

        const history = await getConversationHistory(supabase, lead.id, 80)
        // R7: Pin de dados confirmados — garante que mesmo após corte da janela
        // o LLM sempre veja os dados-chave já capturados do contato.
        {
          const pinParts: string[] = []
          const pinName = isContactNameTrustworthy(contact) ? (contact.full_name || '') : ''
          if (pinName) pinParts.push(`nome=${pinName}`)
          if (contact.email) pinParts.push(`email=${contact.email}`)
          const interestVal = (lead as Record<string, any>).interest || (lead as Record<string, any>).service_type
          if (interestVal) pinParts.push(`interesse=${interestVal}`)
          if (pinParts.length) {
            history.unshift({ role: 'system', content: `[DADOS JÁ CONFIRMADOS DO CLIENTE — não pergunte novamente] ${pinParts.join(', ')}` })
          }
        }
        const lastAssistantMessage = [...history].reverse().find((msg) => msg.role === 'assistant')?.content || ''
        const lastAssistantQuestion = extractLastQuestion(lastAssistantMessage)
        const explicitNameFromHistory = findExplicitFullNameAnswer(history)
        if (explicitNameFromHistory && !isContactNameTrustworthy(contact)) {
          const { error: nameBackfillError } = await supabase
            .from('contacts')
            .update({ full_name: explicitNameFromHistory, name_source: 'USER_CONFIRMED' })
            .eq('id', contact.id)

          if (nameBackfillError) {
            console.error('Failed to backfill explicit full name from conversation:', nameBackfillError.message)
          } else {
            contact.full_name = explicitNameFromHistory
            contact.name_source = 'USER_CONFIRMED'
            console.log('Backfilled explicit full name from prior answer:', explicitNameFromHistory)
          }
        }
        const currentMessageAsName = isQuestionAboutFullName(lastAssistantQuestion) && isLikelyFullNameAnswer(messageForAI)
        if (currentMessageAsName && !isContactNameTrustworthy(contact)) {
          const explicitCurrentName = String(messageForAI).trim()
          const { error: currentNameUpdateError } = await supabase
            .from('contacts')
            .update({ full_name: explicitCurrentName, name_source: 'USER_CONFIRMED' })
            .eq('id', contact.id)

          if (currentNameUpdateError) {
            console.error('Failed to update explicit full name from current reply:', currentNameUpdateError.message)
          } else {
            contact.full_name = explicitCurrentName
            contact.name_source = 'USER_CONFIRMED'
            console.log('Updated explicit full name from current reply:', explicitCurrentName)
          }
        }
        const rawCustomerMessage = messageForAI
        const shouldBindReplyToLastQuestion = lastAssistantQuestion
          && (isStructuredQuestionAnswer(rawCustomerMessage)
            || (isQuestionAboutInterest(lastAssistantQuestion) && isPotentialInterestAnswer(rawCustomerMessage))
            || (isQuestionAboutSpainEntryDate(lastAssistantQuestion) && isPotentialEntryDateAnswer(rawCustomerMessage)))

        if (shouldBindReplyToLastQuestion) {
          messageForAI = `O cliente respondeu à última pergunta \"${lastAssistantQuestion}\" com: ${rawCustomerMessage}`
        }

        // Build dynamic conversation state to prevent repetitions
        const assistantMsgs = history.filter(m => m.role === 'assistant')
        const userMsgs = history.filter(m => m.role === 'user')
        const alreadyGreeted = assistantMsgs.some(m =>
          /\b(hola|olá|ol[áa]|hi|hello|bonjour)\b/i.test(m.content) ||
          /soy la asistente|sou a assistente|asistente virtual|assistente virtual/i.test(m.content)
        )
        const alreadySaidSlogan = assistantMsgs.some(m =>
          /te ayudar[ée] a entender|te ajudarei a entender|gracias por hablar con cb|gracias por contactar con cb|bem-vind[oa] à cb/i.test(m.content)
        )
        const knownEmail = contact.email || ''
        const knownName = isContactNameTrustworthy(contact) ? (contact.full_name || '') : ''
        const turnsCount = assistantMsgs.length

        if (turnsCount > 0) {
          const stateLines: string[] = []
          stateLines.push(`[ESTADO DA CONVERSA — leia antes de responder]`)
          stateLines.push(`- Já houve ${turnsCount} resposta(s) sua(s) e ${userMsgs.length} mensagem(ns) do cliente.`)
          if (alreadyGreeted) stateLines.push(`- ⛔ Você JÁ se apresentou. NÃO se apresente de novo. NÃO use "Hola"/"Olá" como abertura.`)
          if (alreadySaidSlogan) stateLines.push(`- ⛔ Você JÁ disse a frase institucional ("Te ayudaré a entender..."). NÃO repita.`)
          if (knownName) stateLines.push(`- Nome do cliente já conhecido: ${knownName}. NÃO pergunte o nome de novo.`)
          if (knownEmail) stateLines.push(`- E-mail já conhecido: ${knownEmail}. NÃO peça o e-mail de novo.`)
          stateLines.push(`- Avance para a PRÓXIMA etapa do fluxo. Reconheça curto e siga em frente.`)
          stateLines.push(`[FIM DO ESTADO]\n`)
          stateLines.push(`Mensagem atual do cliente: ${messageForAI}`)
          messageForAI = stateLines.join('\n')
        }

        // Build a contextual KB query: direct questions in the current message have priority;
        // only then use the lead's service of interest for generic follow-ups.
        const { data: leadInterest } = await supabase
          .from('leads')
          .select('service_interest, service_type_id, notes')
          .eq('id', lead.id)
          .maybeSingle()
        const currentMessageTopicHint = await detectKnowledgeTopicHint(supabase, rawCustomerMessage || '')
        let topicHint = currentMessageTopicHint
        if (!topicHint && leadInterest?.service_type_id) {
          const { data: stRow } = await supabase
            .from('service_types')
            .select('name')
            .eq('id', leadInterest.service_type_id)
            .maybeSingle()
          if (stRow?.name) topicHint = stRow.name
        }
        if (!topicHint && leadInterest?.service_interest && !['SEM_SERVICO', 'OUTRO'].includes(String(leadInterest.service_interest))) {
          topicHint = String(leadInterest.service_interest).replace(/_/g, ' ')
        }
        // Try to detect topic from last assistant messages (e.g. "Residência para Práticas")
        const recentAssistantText = assistantMsgs.slice(-3).map(m => m.content).join(' ')
        if (!topicHint) {
          topicHint = await detectKnowledgeTopicHint(
            supabase,
            `${recentAssistantText}\n${lastAssistantQuestion || ''}\n${rawCustomerMessage || ''}`,
          )
        }
        // ===== FLUXO ESTRUTURADO (Roteiro CB Asesoría — Fluxo_Mensagens_WhatsApp) =====
        // Bloqueia a Base de Conhecimento até o agente concluir TODAS as etapas do roteiro,
        // na ordem definida no PDF oficial. Só libera KB após Pré-Handoff (H1+H2) enviado.
        // Fetch ALL assistant messages for this lead (not just the last 20-message window)
        // so the gate detection of completed steps doesn't reset when conversations get long.
        const { data: allAssistantRows } = await supabase
          .from('mensagens_cliente')
          .select('mensagem_IA')
          .eq('id_lead', lead.id)
          .not('mensagem_IA', 'is', null)
          .order('created_at', { ascending: true })
          .limit(500)
        const allAssistant = (allAssistantRows || [])
          .map((r: any) => String(r.mensagem_IA || ''))
          .concat(assistantMsgs.map(m => m.content))
          .join('\n')
        const userMsgsText = (history || [])
          .filter((m: any) => m.role === 'user')
          .map((m: any) => String(m.content || ''))
          .join('\n')

        const sentAny = (re: RegExp) => re.test(allAssistant)
        const userSaid = (re: RegExp) => re.test(userMsgsText) || re.test(rawCustomerMessage || '')

        // Detecção de campos básicos já capturados
        // Wave 4: name_source é a fonte de verdade; cai-back para detector heurístico
        let nameMissing = !isContactNameTrustworthy(contact)
          || isAutoGeneratedContactName(contact.full_name, message.name, phoneNumber)
        let emailMissing = !contact.email
        let serviceMissing = !leadInterest?.service_type_id
          && (!leadInterest?.service_interest
            || ['SEM_SERVICO', 'OUTRO', ''].includes(String(leadInterest.service_interest).toUpperCase()))

        // Wave 7: capturar interesse a partir de resposta livre à pergunta INTERESSE.
        // Sem isto, o cadastro fica "eternamente aberto" e a KB nunca é liberada.
        // Wave 7.1: torna a captura PERMISSIVA — qualquer mensagem do cliente que case
        // com palavra-chave de serviço (residencia, nacionalidade, estudos, etc.) é
        // capturada enquanto serviceMissing=true, independente da última pergunta do bot.
        // Isto garante recuperação retroativa se o turno em que o cliente respondeu
        // o interesse não capturou (ex.: deploy propagou no meio da conversa).
        try {
          if (serviceMissing && rawCustomerMessage) {
            const detectedInterest = extractInterestFromMessage(rawCustomerMessage)
            if (detectedInterest) {
              await supabase
                .from('leads')
                .update({ service_interest: detectedInterest, interest_confirmed: true, updated_at: new Date().toISOString() })
                .eq('id', lead.id)
              leadInterest = { ...(leadInterest || {}), service_interest: detectedInterest }
              serviceMissing = false
              console.log(`[INTEREST_CAPTURE] "${rawCustomerMessage}" -> ${detectedInterest}`)
            }
          }
        } catch (capErr) {
          console.warn('[INTEREST_CAPTURE] non-blocking error:', capErr instanceof Error ? capErr.message : capErr)
        }

        // Wave 6 (anti-repetição em divergência): sincronizar IMEDIATAMENTE o funil
        // com o que já está em contacts/leads. Isso garante que o Gate use o funil
        // persistido como única fonte de verdade e nunca reabra etapas confirmadas
        // mesmo quando o cliente sai do roteiro e volta.
        let funnelStateLive = funnelState
        try {
          const interestRawForSync = (leadInterest?.service_interest && !['SEM_SERVICO', 'OUTRO', ''].includes(String(leadInterest.service_interest).toUpperCase()))
            ? String(leadInterest.service_interest)
            : (leadInterest?.service_type_id ? 'detected' : null)
          funnelStateLive = await syncFunnelFromCapturedData(supabase, funnelState, contact, interestRawForSync)
        } catch (syncErr) {
          console.warn('[FUNNEL_SYNC] non-blocking error:', syncErr instanceof Error ? syncErr.message : syncErr)
        }
        // Recalcular flags a partir do funil sincronizado (verdade persistida)
        if (funnelStateLive.name_confirmed) nameMissing = false
        if (funnelStateLive.email_confirmed) emailMissing = false
        if (funnelStateLive.interest_confirmed) serviceMissing = false

        // Detecção de localização: buscar a RESPOSTA imediatamente após a pergunta de localização.
        // Suporta a nova pergunta yes/no ("já está na Espanha?") e a antiga disjuntiva (compatibilidade).
        const locQuestionRe = /(j[áa] est[áa]|j[áa] mora|ya est[áa]s|ya vives|already (in|live)|are you already in spain|hoje voc[êe] j[áa] est[áa] na espanha|hoy ya est[áa]s en espa[ñn]a|d[ée]j[àa] en espagne).{0,60}(espanha|espa[ñn]a|spain|espagne)/i
        let locationAnswer = ''
        for (let i = 0; i < history.length - 1; i++) {
          const m = history[i]
          if (m.role === 'assistant' && locQuestionRe.test(m.content)) {
            // Pega a próxima mensagem do usuário
            for (let j = i + 1; j < history.length; j++) {
              if (history[j].role === 'user') {
                locationAnswer = String(history[j].content || '')
                break
              }
            }
            break
          }
        }
        const ans = locationAnswer.toLowerCase().trim()
        // Negativa pura tem prioridade: "não", "no", "ainda não", "todavía no" → fora da Espanha.
        const isNegative = !!ans && (
          /^\s*(n[ãa]o|no|nope|nah|non)\b/i.test(ans)
          || /\b(ainda n[ãa]o|todav[ií]a no|not yet|pas encore)\b/i.test(ans)
          || /\b(n[ãa]o (estou|moro|vivo)|no (estoy|vivo)|i'?m not|not in spain)\b/i.test(ans)
          || /\b(brasil|portugal|argentina|m[ée]xico|mexico|colombia|chile|uruguai|uruguay|venezuela|estados unidos|eua|usa|fora|outro pa[ií]s|en otro|em outro|other country)\b/i.test(ans)
        )
        const isAffirmative = !!ans && !isNegative && (
          /^\s*(sim|si|s[ií]|yes|yep|yeah|claro|exato|exactamente|oui)\b/i.test(ans)
          || /\b(j[áa] estou|ya estoy|estou (na |em )?espanha|estoy en espa[ñn]a|i'?m in spain|aqui na espanha|aqu[ií] en espa[ñn]a)\b/i.test(ans)
          || /\b(estou|estoy|moro|vivo)\b/i.test(ans)
          || /\b(espanha|espa[ñn]a|spain|espagne|madrid|barcelona|valencia|sevilla|m[áa]laga|bilbao|alicante)\b/i.test(ans)
        )
        const userOutsideSpain = isNegative
        const userInSpain = isAffirmative


        // Definição das 8 etapas do roteiro (na ordem)
        type Step = {
          key: string
          label: string
          done: boolean
          instruction: string
        }
        const steps: Step[] = []

        // Etapa 1 — Abertura (Msg1 + Msg2)
        const aberturaDone = sentAny(/\b(obrigad[oa] por (falar|escrever|entrar)|gracias por (hablar|escribir)|thanks? for (reaching|contacting))\b/i)
          && sentAny(/\b(perguntas? r[áa]pidas?|preguntas r[áa]pidas|quick questions?|entender (seu|tu|your) caso|direcionar|derivar|direct you)\b/i)
        steps.push({
          key: 'abertura', label: 'ABERTURA',
          done: aberturaDone,
          instruction:
            'Envie a ABERTURA exatamente em duas frases curtas: (1) "Olá 😊 Tudo bem? Obrigado por falar com a CB Asesoría. Vou te ajudar a entender seus caminhos legais aqui na Espanha." (2) "Vou te fazer algumas perguntas rápidas só para entender seu caso e te direcionar para o especialista certo, pode ser?". NÃO faça nenhuma outra pergunta agora.',
        })

        // Etapa 2 — Nome (Msg3)
        steps.push({
          key: 'nome', label: 'NOME COMPLETO',
          done: !nameMissing,
          instruction:
            'Pergunte APENAS o NOME COMPLETO do cliente. Use como REFERÊNCIA (traduza fielmente para o idioma do cliente, mantendo o sentido e o tom — NUNCA envie em português se o cliente não estiver em português): "Antes de tudo, como é seu nome completo?". Se o cliente fez outra pergunta, agradeça em UMA frase (referência: "Ótima pergunta, já te explico em seguida." — também traduza) e em seguida faça SOMENTE a pergunta do nome.',
        })

        // Etapa 3 — Email (Msg4)
        steps.push({
          key: 'email', label: 'E-MAIL',
          done: !emailMissing,
          instruction:
            'Agradeça brevemente o nome e pergunte APENAS o melhor e-mail. Use como REFERÊNCIA (traduza fielmente para o idioma do cliente — NUNCA envie em português se o cliente não estiver em português): "Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?". NÃO faça outras perguntas nem responda dúvidas factuais agora.',
        })

        // Etapa 4 — Interesse (Msg5 + Msg6) — exige a pergunta explícita E a frase do catálogo
        const interesseAsked = sentAny(/me conta com calma.*o que voc[êe] busca|cu[eé]ntame con calma.*qu[eé] buscas|tell me.*what are you looking for/i)
        const catalogSent = sentAny(/trabalhamos com cidadania.*n[óo]made digital|trabajamos con (la )?ciudadan[ií]a.*n[óo]mada digital|we work with (spanish )?citizenship.*digital nomad/i)
        const interesseDone = !serviceMissing || (interesseAsked && catalogSent)
        steps.push({
          key: 'interesse', label: 'INTERESSE / SERVIÇO',
          done: interesseDone,
          instruction:
            'Pergunte sobre o interesse do cliente em DUAS mensagens curtas, nesta ordem: (1) "Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico." (2) "Trabalhamos com cidadania espanhola, nômade digital, residências, NIE, TIE, homologação de estudos, antecedentes, reagrupação e outros processos." NÃO consulte a Base de Conhecimento.',
        })

        // Etapa 5 — Localização (Msg7) — exige a pergunta exata "Espanha OU outro país"
        const localizacaoAsked = sentAny(/hoje voc[êe] j[áa] est[áa] na espanha/i)
          || sentAny(/hoy ya est[áa]s en espa[ñn]a/i)
          || sentAny(/are you already in spain today/i)
          || sentAny(/d[ée]j[àa] en espagne aujourd/i)
          // compat com pergunta antiga (disjuntiva)
          || sentAny(/(j[áa] est[áa]|j[áa] mora|ya est[áa]s|already (in|live)).{0,30}(na )?espanha?.{0,30}(ou|o)\s+(ainda |todav[ií]a |still )?(est[áa]|en )?(em |en )?outro pa[íi]s/i)
        const localizacaoAnswered = userInSpain || userOutsideSpain || !!funnelStateLive.location_known
        steps.push({
          key: 'localizacao', label: 'LOCALIZAÇÃO ATUAL',
          done: (localizacaoAsked && localizacaoAnswered) || !!funnelStateLive.location_known,
          instruction:
            'Pergunte APENAS: "Hoje você já está na Espanha?" (sim/não). NÃO use a forma disjuntiva "ou ainda está em outro país". Se a resposta for negativa, NÃO pergunte em qual país a pessoa está — siga direto para o bloco "fora da Espanha". Aguarde a resposta antes de avançar.',
        })

        // Etapa 6 — Aprofundamento conforme localização
        let aprofundamentoDone = false
        let aprofundamentoInstruction = ''
        if (userInSpain) {
          // Bloco B — Na Espanha (B1-B5)
          const bIntro = sentAny(/\bagora preciso entender como est[áa] sua situa[çc][ãa]o aqui|ahora necesito entender|now i need to understand\b/i)
          const askedEntryDate = sentAny(/\b(data (exata )?da sua entrada|fecha (exacta )?de tu entrada|date you entered)\b/i)
          const askedEmpadronado = sentAny(/voc[êe] est[áa] empadronad|est[áa]s empadronad|are you (registered|empadronad)|[êe]tes-vous empadronad/i)
          const askedDesdeQuando = sentAny(/\b(desde quando|desde cu[áa]ndo|since when|depuis quand)\b/i)
          const askedCidade = sentAny(/\b(em qual cidade|en qu[eé] ciudad|in which city|dans quelle ville)\b/i)
          aprofundamentoDone = bIntro && askedEntryDate && askedEmpadronado && askedDesdeQuando && askedCidade
          aprofundamentoInstruction =
            'O cliente JÁ ESTÁ na Espanha. Avance pelo bloco B na ordem, UMA pergunta por turno (NUNCA combine duas perguntas no mesmo turno): ' +
            (!bIntro ? '(B1) "Perfeito. Agora preciso entender como está sua situação aqui." então ' : '') +
            (!askedEntryDate ? '(B2) "Qual foi a data exata da sua entrada na Espanha?". ' :
             !askedEmpadronado ? '(B3) "Você está empadronado?" (APENAS sim/não, NÃO inclua "se sim, desde quando"). ' :
             !askedDesdeQuando ? '(B4) "Desde quando você está empadronado?". ' :
             !askedCidade ? '(B5) "Em qual cidade você está empadronado?". ' :
             'Bloco completo, avance para o Pré-Handoff.')
        } else if (userOutsideSpain) {
          // Bloco A — Fora da Espanha (A1-A6)
          const aIntro = sentAny(/\bperguntas? r[áa]pidas? s[óo] para entender melhor|preguntas r[áa]pidas? para entender mejor\b/i)
          const askedIdade = sentAny(/\b(qual sua idade|cu[áa]ntos a[ñn]os|how old)\b/i)
          const askedEuropa = sentAny(/\beuropa nos [úu]ltimos 6 meses|europa en los [úu]ltimos 6 meses|europe in the last 6 months\b/i)
          // Pular a A3 quando já temos sinais inequívocos: cliente já está na Espanha
          // OU informou data de entrada na Espanha dentro dos últimos 180 dias.
          const entryDateInLast6Months = (() => {
            const d = funnelStateLive.entry_date_confirmed
            if (!d) return false
            const t = Date.parse(d)
            if (Number.isNaN(t)) return false
            const days = (Date.now() - t) / 86_400_000
            return days >= 0 && days <= 180
          })()
          const skipEuropaQuestion = userInSpain || entryDateInLast6Months
          const askedEuropaEffective = askedEuropa || skipEuropaQuestion
          const askedFamiliar = sentAny(/\bfamiliar (europeu|europeo)|family member.*(eu|spain)\b/i)
          const askedRemoto = sentAny(/\b(trabalha remoto|trabajas? remoto|work remotely)\b/i)
          const askedFormacao = sentAny(/\b(forma[çc][ãa]o superior|formaci[óo]n superior|higher education|college degree)\b/i)
          aprofundamentoDone = aIntro && askedIdade && askedEuropaEffective && askedFamiliar && askedRemoto && askedFormacao
          aprofundamentoInstruction =
            'O cliente está FORA da Espanha. Avance pelo bloco A na ordem, UMA pergunta por turno: ' +
            (!aIntro ? '(A1) "Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário." então ' : '') +
            (!askedIdade ? '(A2) "Qual sua idade?". ' :
             !askedEuropaEffective ? '(A3) "Você esteve na Europa nos últimos 6 meses?". ' :
             !askedFamiliar ? '(A4) "Possui familiar europeu ou residente legal na Espanha?". ' :
             !askedRemoto ? '(A5) "Você trabalha remoto?". ' :
             !askedFormacao ? '(A6) "Você possui formação superior?". ' :
             'Bloco completo, avance para o Pré-Handoff.') +
            (skipEuropaQuestion ? ' IMPORTANTE: NÃO pergunte "Você esteve na Europa nos últimos 6 meses?" — já temos a informação (cliente está/entrou na Espanha recentemente).' : '')

        } else {
          aprofundamentoInstruction = 'Aguardando resposta do cliente sobre localização antes de avançar.'
        }
        steps.push({
          key: 'aprofundamento', label: 'APROFUNDAMENTO',
          done: aprofundamentoDone,
          instruction: aprofundamentoInstruction,
        })

        // Etapa 7 — Pré-Handoff (H1 + H2) — APÓS isso a KB é liberada
        const preHandoffDone = sentAny(/vis[ãa]o inicial do seu caso|visi[óo]n inicial de tu caso|initial view of your case/i)
          && sentAny(/cada caso de forma individual|each case individually|caminho mais seguro/i)
        steps.push({
          key: 'preHandoff', label: 'PRÉ-HANDOFF',
          done: preHandoffDone,
          instruction:
            'Envie o PRÉ-HANDOFF em duas frases curtas, nesta ordem: (1) "Perfeito. Já consigo ter uma visão inicial do seu caso." (2) "Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei." NÃO faça novas perguntas e NÃO envie o Handoff (encaminhar para atendente) agora. Após esta mensagem, a Base de Conhecimento será liberada e você entrará em modo tira-dúvidas usando a KB.',
        })

        // ⚡ Pré-Handoff é o sinal definitivo de "cadastro concluído". Se ele já foi enviado,
        // marca todas as etapas anteriores como done para liberar a KB imediatamente — mesmo
        // que algum regex de sub-etapa do APROFUNDAMENTO não tenha batido (ex.: a IA reformulou
        // a frase). Sem isso, perguntas factuais pós-Pré-Handoff são incorretamente adiadas.
        if (preHandoffDone) {
          for (const s of steps) s.done = true
          // Housekeeping: marca o funil como 'livre' para consistência futura.
          if (funnelStateLive.step !== 'livre') {
            try {
              await supabase
                .from('lead_funnel_state')
                .update({ step: 'livre', updated_at: new Date().toISOString() })
                .eq('lead_id', lead.id)
              funnelStateLive = { ...funnelStateLive, step: 'livre' }
            } catch (e) {
              console.warn('[FUNNEL] livre update failed:', e instanceof Error ? e.message : e)
            }
          }
        }

        // Etapa 8 — Handoff (H3 + H4) — opcional, apenas se a equipe for assumir
        const handoffDone = sentAny(/encaminhar suas informa[çc][õo]es|forward your information/i)
          && sentAny(/encaminhar para um atendente|derivar a un agente|forward you to an agent/i)

        // Próxima etapa pendente
        const nextStep = steps.find(s => !s.done)
        const flowComplete = !nextStep // todas as 7 primeiras etapas concluídas → KB liberada
        const collectionGateActive = !flowComplete

        // Wave 7: detectar pergunta factual do cliente.
        const isFactualQuestion = !!rawCustomerMessage && (
          /\?/.test(rawCustomerMessage)
          || /\b(como|quanto|qual|quais|quanto custa|preciso|posso|onde|quando|cu[áa]nto|c[óo]mo|d[óo]nde|how|what|where|when|how much)\b/i.test(rawCustomerMessage)
        )

        // Wave 7: durante o cadastro, MEMORIZAR a pergunta factual para responder
        // assim que o cadastro terminar. Após o cadastro, RECUPERAR a pergunta pendente
        // e usá-la como query da KB no lugar (ou em adição) à mensagem atual.
        let pendingQuestionToAnswer: string | null = null
        try {
          if (collectionGateActive && isFactualQuestion && !funnelStateLive.pending_question) {
            await supabase
              .from('lead_funnel_state')
              .update({ pending_question: rawCustomerMessage, updated_at: new Date().toISOString() })
              .eq('lead_id', lead.id)
            funnelStateLive = { ...funnelStateLive, pending_question: rawCustomerMessage }
            console.log(`[PENDING_Q] saved during cadastro: "${rawCustomerMessage}"`)
          } else if (!collectionGateActive && funnelStateLive.pending_question) {
            pendingQuestionToAnswer = funnelStateLive.pending_question
            await supabase
              .from('lead_funnel_state')
              .update({ pending_question: null, updated_at: new Date().toISOString() })
              .eq('lead_id', lead.id)
            funnelStateLive = { ...funnelStateLive, pending_question: null }
            console.log(`[PENDING_Q] consumed after cadastro: "${pendingQuestionToAnswer}"`)
          }
        } catch (pqErr) {
          console.warn('[PENDING_Q] non-blocking error:', pqErr instanceof Error ? pqErr.message : pqErr)
        }

        const kbQueryParts: string[] = []
        if (topicHint) kbQueryParts.push(`Tópico: ${topicHint}`)
        if (lastAssistantQuestion) kbQueryParts.push(`Pergunta anterior do agente: ${lastAssistantQuestion}`)
        if (pendingQuestionToAnswer) kbQueryParts.push(`Pergunta pendente do cliente (feita antes durante o cadastro): ${pendingQuestionToAnswer}`)
        if (rawCustomerMessage) kbQueryParts.push(`Pergunta do cliente: ${rawCustomerMessage}`)
        const kbQuery = kbQueryParts.join('\n').trim() || (rawCustomerMessage || messageForAI || '').trim()

        // KB só é consultada DEPOIS que o roteiro completo (até Pré-Handoff) for cumprido
        const knowledgeContext = (!collectionGateActive && kbQuery)
          ? await getKnowledgeBaseContext(supabase, kbQuery, topicHint || undefined)
          : ''

        const langLabel: Record<string, string> = {
          'pt-BR': 'Português (Brasil)',
          'es': 'Español',
          'en': 'English',
          'fr': 'Français',
        }
        const langName = langLabel[detectedChatLanguage] || 'Português (Brasil)'

        if (collectionGateActive && nextStep) {
          const stepsSummary = steps.map(s => `${s.done ? '✅' : '⏳'} ${s.label}`).join(' → ')
          messageForAI = `${messageForAI}\n\n[GATE DE FLUXO — INSTRUÇÃO INTERNA, NÃO REPITA AO CLIENTE]\n` +
            `IDIOMA OBRIGATÓRIO E TRAVADO DA RESPOSTA: ${langName}. Esse idioma foi definido no início da conversa e NÃO MUDA por nada — mesmo que o cliente envie a mensagem atual em outro idioma (ex.: cliente respondendo "si"/"sim"/"yes"), VOCÊ DEVE responder em ${langName}. NÃO misture idiomas. Todas as frases-modelo abaixo estão em português APENAS como referência: traduza-as fielmente para ${langName} antes de enviar — JAMAIS copie literalmente em português se ${langName} não for português.\n` +
            `Roteiro oficial CB Asesoría em andamento. Etapas: ${stepsSummary}\n` +
            `PRÓXIMA ETAPA OBRIGATÓRIA: ${nextStep.label}\n` +
            `INSTRUÇÃO: ${nextStep.instruction}\n` +
            `REGRAS RÍGIDAS:\n` +
            `1. PRIMEIRO avalie se a mensagem do cliente é RESPOSTA à última pergunta do agente. Respostas curtas (número quando perguntou idade, "sim"/"não", data, nome de cidade, "remoto"/"presencial", etc.) DEVEM ser tratadas como resposta válida — registre internamente e AVANCE imediatamente para a PRÓXIMA ETAPA pendente abaixo. NÃO repita a pergunta já respondida e NÃO use a frase "Ótima pergunta...". Só use "Ótima pergunta, te explico em detalhes assim que terminarmos esse rapidíssimo levantamento." quando o cliente fizer uma PERGUNTA FACTUAL real (preço, requisitos, prazos, documentos, "o que é", "como funciona") em vez de responder. Em qualquer caso, NÃO consulte a Base de Conhecimento ainda e envie SOMENTE a próxima etapa do roteiro.\n` +
            `2. Se o cliente fizer uma pergunta factual durante o cadastro, NÃO ALUCINE prazos, valores, requisitos ou regras. Acolha em UMA frase ("Ótima pergunta — vou te explicar em detalhe assim que terminarmos esse rapidíssimo levantamento.") e siga para a próxima etapa. Se realmente não souber, é PERMITIDO dizer "vou confirmar com o especialista" em vez de inventar — mas evite repetir essa frase na mesma conversa.\n` +
            `3. Siga o roteiro NA ORDEM. Não pule etapas. UMA pergunta principal por turno (a abertura e o pré-handoff têm 2 frases curtas).\n` +
            `4. Mantenha o tom natural, humanizado e curto. Use as frases sugeridas como base — pode adaptar levemente, mas mantenha o sentido e a ordem.\n` +
            `5. A Base de Conhecimento será liberada APÓS o Pré-Handoff (H1+H2) ser enviado e então você poderá responder em detalhes.\n` +
            `[FIM DO GATE]`
          console.log(`[GATE] step=${nextStep.key} done=${steps.filter(s=>s.done).length}/${steps.length} inSpain=${userInSpain} outside=${userOutsideSpain}`)
        } else {
          console.log(`[GATE] flow complete — KB liberada (handoff=${handoffDone})`)
          if (!handoffDone) {
            messageForAI = `${messageForAI}\n\n[MODO TIRA-DÚVIDAS — INSTRUÇÃO INTERNA, NÃO REPITA AO CLIENTE]\n` +
              `IDIOMA OBRIGATÓRIO E TRAVADO DA RESPOSTA: ${langName}. Definido no início da conversa, NÃO MUDA — mesmo se o cliente enviar mensagem em outro idioma, RESPONDA em ${langName}. NÃO misture idiomas.\n` +
              `O cadastro inicial e o Pré-Handoff já foram enviados. Agora você está em MODO TIRA-DÚVIDAS.\n` +
              `REGRAS:\n` +
              `1. Use a Base de Conhecimento (KB) fornecida no contexto para responder dúvidas do cliente de forma breve, clara e baseada exclusivamente nos trechos disponíveis.\n` +
              `2. NÃO envie o Handoff ("Vou encaminhar suas informações..." / "Vou te encaminhar para um atendente") automaticamente. Só envie o Handoff quando o cliente sinalizar que NÃO TEM MAIS DÚVIDAS (ex.: "é só isso", "obrigado", "ok") OU pedir explicitamente para falar com um humano.\n` +
              `3. Se o cliente acabou de receber o Pré-Handoff e ainda não fez perguntas, convide-o gentilmente: "Tem alguma dúvida que eu possa esclarecer agora sobre seu caso?".\n` +
              `4. Se a KB realmente não tiver a informação, diga honestamente que vai confirmar com o especialista — mas NÃO faça o handoff por isso, continue disponível para outras dúvidas.\n` +
              `5. PROIBIDO usar a frase "assim que terminarmos esse rapidíssimo levantamento" ou variações ("vou te explicar quando terminar o levantamento", etc.). O levantamento JÁ ACABOU. Se o cliente fez uma pergunta factual ("o que é X", "como funciona Y", prazos, valores, requisitos), RESPONDA AGORA com base na KB. Adiar a resposta neste momento é ERRO grave.\n` +
              (pendingQuestionToAnswer
                ? `6. PRIORIDADE MÁXIMA: o cliente havia feito esta pergunta DURANTE o cadastro e ficou aguardando: "${pendingQuestionToAnswer}". Responda-a AGORA, com base na KB, antes de qualquer outra coisa. Comece com algo como "Como prometi, sobre sua dúvida..." e responda objetivamente.\n`
                : '') +
              `[FIM DO MODO TIRA-DÚVIDAS]`
          }
        }

        console.log(`[KB] query currentTopic="${currentMessageTopicHint}" finalTopic="${topicHint}" len=${kbQuery.length} -> context ${knowledgeContext.length} chars`)

        // ===== STRICT KB MODE =====
        const kbStrictMode = configMap['kb_strict_mode'] === 'true'
        const kbStrictFallback = (configMap['kb_strict_fallback_message'] || '').trim()
          || 'Obrigado pela sua mensagem! Não tenho essa informação no momento. Vou encaminhar para um de nossos atendentes que entrará em contato em breve. 🙏'

        // Generate AI response (Gemini primary, OpenAI fallback)
        let aiResponse = ''
        let resolvedSystemPrompt = systemPrompt.replace('{nome}', promptContactName || '')
        // Wave 4: diretiva de estado do funil (anti F1/F4)
        resolvedSystemPrompt += buildStateDirective(funnelState, detectedChatLanguage)

        if (kbStrictMode) {
          if (!knowledgeContext) {
            console.log('[KB-STRICT] No KB match found — sending standard fallback message')
            try {
              await sendWhatsAppMessage(phoneNumber, kbStrictFallback)
              await supabase.from('mensagens_cliente').insert({
                id_lead: lead.id,
                tipo: 'TEXTO',
                conteudo: kbStrictFallback,
                direcao: 'SAINDO',
                origem: 'AGENTE_IA',
              })
            } catch (e) {
              console.error('[KB-STRICT] Failed to send fallback:', e instanceof Error ? e.message : e)
            }
            return new Response(JSON.stringify({ success: true, kb_strict_fallback: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          resolvedSystemPrompt += `\n\n## MODO ESTRITO — BASE DE CONHECIMENTO\n` +
            `Você DEVE responder EXCLUSIVAMENTE com base nos trechos da Base de Conhecimento fornecidos no contexto. ` +
            `Antes de dizer que não tem informação, procure a resposta nos trechos marcados como BASE DE CONHECIMENTO, especialmente no arquivo do tópico atual. ` +
            `Se o cliente perguntar "o que é", use a seção "O que é — Explicação do serviço" quando ela existir. ` +
            `Se perguntar requisitos/documentos, use a seção "Requisitos e documentos" quando ela existir. ` +
            `É PROIBIDO usar conhecimento geral, suposições ou inferências fora desses trechos. ` +
            `Só responda EXATAMENTE "${kbStrictFallback}" quando o contexto da base estiver vazio ou realmente não contiver a resposta. ` +
            `Não invente, não complete lacunas, não combine com conhecimento externo.`
        }

        try {
          aiResponse = await generateAIResponse(
            history,
            messageForAI,
            resolvedSystemPrompt,
            geminiApiKey,
            knowledgeContext,
            detectedChatLanguage
          )
        } catch (geminiError) {
          console.error('Gemini failed, trying OpenAI fallback:', geminiError instanceof Error ? geminiError.message : geminiError)
        }

        // Fallback to OpenAI if Gemini returned empty or failed
        if (!aiResponse) {
          console.log('Primary AI (Gemini) returned empty/failed — invoking OpenAI fallback')
          try {
            aiResponse = await generateAIResponseOpenAI(
              history,
              messageForAI,
              resolvedSystemPrompt,
              knowledgeContext,
              detectedChatLanguage
            )
            if (aiResponse) {
              console.log('OpenAI fallback succeeded, response length:', aiResponse.length)
            }
          } catch (openaiError) {
            console.error('OpenAI fallback also failed:', openaiError instanceof Error ? openaiError.message : openaiError)
          }
        }

        const outsideSpainNextQuestion = getOutsideSpainNextQuestion(detectedChatLanguage, allAssistant, {
          entryDateConfirmed: funnelStateLive.entry_date_confirmed,
          locationKnown: funnelStateLive.location_known,
        })
        aiResponse = forceSkipFullNameIfAlreadyKnown(aiResponse, detectedChatLanguage, !nameMissing, emailMissing)
        aiResponse = forceReaskFullNameIfSingleWord(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !nameMissing)
        aiResponse = forceReaskEmailIfMissing(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !emailMissing)
        aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
        aiResponse = forceAdvanceFromEntryDateQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, outsideSpainNextQuestion)
        aiResponse = forceAdvanceFromEmpadronadoQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
        // Wave 6: trava determinística pós-IA — nunca re-perguntar dado já confirmado
        aiResponse = lockConfirmedFieldsInResponse(aiResponse, detectedChatLanguage, {
          nameKnown: !nameMissing,
          emailKnown: !emailMissing,
          interestKnown: !serviceMissing,
          locationKnown: !!funnelStateLive.location_known,
        })
        aiResponse = sanitizeLocationQuestion(aiResponse, detectedChatLanguage)

        // F1-HARD: se o nome já é confiável e a IA mesmo assim perguntou nome (guard zerou ou
        // sobrou só o preâmbulo), forçar uma nova geração com instrução anti-nome explícita.
        if (!nameMissing && (!aiResponse || aiResponse.trim().length < 10)) {
          console.warn('[F1-HARD] AI tried to ask name again though name is confirmed; retrying')
          try {
            aiResponse = await generateAIResponse(
              history,
              messageForAI,
              `${resolvedSystemPrompt}\n\n## INSTRUÇÃO CRÍTICA — NOME JÁ CONFIRMADO\nO nome do cliente JÁ está confirmado (${contact.full_name}). É PROIBIDO perguntar o nome novamente. Confirme brevemente o que o cliente acabou de dizer e avance para a PRÓXIMA pergunta do roteiro que ainda não foi feita. NÃO reinicie o funil.`,
              geminiApiKey,
              knowledgeContext,
              detectedChatLanguage,
            )
            aiResponse = forceSkipFullNameIfAlreadyKnown(aiResponse, detectedChatLanguage, !nameMissing, emailMissing)
            aiResponse = lockConfirmedFieldsInResponse(aiResponse, detectedChatLanguage, { nameKnown: !nameMissing, emailKnown: !emailMissing, interestKnown: !serviceMissing, locationKnown: !!funnelStateLive.location_known })
            aiResponse = sanitizeLocationQuestion(aiResponse, detectedChatLanguage)
          } catch (e) {
            console.error('[F1-HARD] retry failed:', e instanceof Error ? e.message : e)
          }
        }
        if (aiResponse && isLikelyQuestionLoop(history, rawCustomerMessage, aiResponse)) {
          console.warn('Detected repeated-question loop, retrying with anti-repeat instruction')
          try {
            aiResponse = await generateAIResponse(
              history,
              messageForAI,
              `${resolvedSystemPrompt}\n\n## INSTRUÇÃO CRÍTICA ANTI-REPETIÇÃO\nO cliente acabou de responder à sua ÚLTIMA pergunta. NÃO repita a mesma pergunta novamente. Confirme brevemente a resposta recebida e avance para a próxima pergunta ou próxima etapa do fluxo.`,
              geminiApiKey,
              knowledgeContext,
              detectedChatLanguage,
            )
            aiResponse = forceSkipFullNameIfAlreadyKnown(aiResponse, detectedChatLanguage, !nameMissing, emailMissing)
            aiResponse = forceReaskFullNameIfSingleWord(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !nameMissing)
            aiResponse = forceReaskEmailIfMissing(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !emailMissing)
            aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
            aiResponse = forceAdvanceFromEntryDateQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, outsideSpainNextQuestion)
            aiResponse = forceAdvanceFromEmpadronadoQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
            aiResponse = lockConfirmedFieldsInResponse(aiResponse, detectedChatLanguage, { nameKnown: !nameMissing, emailKnown: !emailMissing, interestKnown: !serviceMissing, locationKnown: !!funnelStateLive.location_known })
            aiResponse = sanitizeLocationQuestion(aiResponse, detectedChatLanguage)
          } catch (retryError) {
            console.error('Anti-repeat retry failed:', retryError instanceof Error ? retryError.message : retryError)
          }
        }

        // Wave 4: persistir estado do funil após overrides
        try {
          const patch: Record<string, unknown> = {}
          if (!funnelState.name_confirmed && !nameMissing) patch.name_confirmed = true
          if (!funnelState.email_confirmed && !emailMissing) patch.email_confirmed = true
          if (!funnelState.location_known) {
            if (userInSpain) patch.location_known = 'spain'
            else if (userOutsideSpain) patch.location_known = 'outside'
          }
          if (!funnelState.interest_confirmed && !serviceMissing) {
            patch.interest_confirmed = String(leadInterest?.service_interest || 'detected')
          }
          if (Object.keys(patch).length > 0) {
            await applyTurnUpdates(supabase, funnelState, patch)
          }
        } catch (stateErr) {
          console.warn('[FUNNEL_STATE] persistence error (non-blocking):', stateErr instanceof Error ? stateErr.message : stateErr)
        }

        if (aiResponse) {
          aiResponse = removeRepeatedQuestionIntro(lastAssistantMessage, aiResponse)

          // Wave 5 (F4): dedup do bloco de catálogo. Se a resposta repete quase
          // literalmente uma das últimas 3 mensagens do assistente, força uma
          // nova geração com instrução de paráfrase + avanço.
          try {
            const lastThreeAssistant = history.filter((m) => m.role === 'assistant').slice(-3).map((m) => String(m.content || ''))
            const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
            const aiNorm = norm(aiResponse)
            const overlap = (a: string, b: string): number => {
              if (!a || !b) return 0
              const aw = new Set(a.split(' ').filter((w) => w.length > 3))
              const bw = b.split(' ').filter((w) => w.length > 3)
              if (!aw.size || !bw.length) return 0
              let hits = 0
              for (const w of bw) if (aw.has(w)) hits++
              return hits / Math.max(aw.size, bw.length)
            }
            const isCatalogEcho = lastThreeAssistant.some((prev) => {
              const sim = overlap(norm(prev), aiNorm)
              return sim >= 0.7 && /(cidadania|n[óo]made|residencia|residências|nie|tie|homologa|reagrupa|ciudadan|nationality)/i.test(prev) && /(cidadania|n[óo]made|residencia|residências|nie|tie|homologa|reagrupa|ciudadan|nationality)/i.test(aiResponse)
            })
            if (isCatalogEcho) {
              console.warn('[F4] Catálogo repetido detectado — gerando paráfrase com avanço')
              try {
                const paraphraseResp = await generateAIResponse(
                  history,
                  messageForAI,
                  `${resolvedSystemPrompt}\n\n## INSTRUÇÃO ANTI-REPETIÇÃO DE CATÁLOGO\nA frase do catálogo de serviços JÁ FOI ENVIADA recentemente. NÃO repita o catálogo. Confirme em UMA frase curta o interesse do cliente e AVANCE imediatamente para a PRÓXIMA pergunta pendente do roteiro.`,
                  geminiApiKey,
                  knowledgeContext,
                  detectedChatLanguage,
                )
                if (paraphraseResp && norm(paraphraseResp) !== aiNorm) {
                  aiResponse = paraphraseResp
                  aiResponse = forceSkipFullNameIfAlreadyKnown(aiResponse, detectedChatLanguage, !nameMissing, emailMissing)
                  aiResponse = forceReaskEmailIfMissing(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !emailMissing)
                  aiResponse = removeRepeatedQuestionIntro(lastAssistantMessage, aiResponse)
                }
              } catch (paraErr) {
                console.error('[F4] Paraphrase retry failed:', paraErr instanceof Error ? paraErr.message : paraErr)
              }
            }
          } catch (_) { /* dedup is best-effort */ }

          // R9: Single per-turn structured log for auditability
          try {
            console.log('[TURN]', JSON.stringify({
              leadId: lead.id,
              contactId: contact.id,
              lang: detectedChatLanguage,
              gateActive: collectionGateActive,
              nextStep: nextStep?.key || null,
              stepsDone: steps.filter(s => s.done).map(s => s.key),
              dataKnown: { name: !nameMissing, email: !emailMissing, service: !serviceMissing },
              location: { inSpain: userInSpain, outsideSpain: userOutsideSpain },
              kbHit: knowledgeContext.length > 0,
              kbChars: knowledgeContext.length,
              topicHint: topicHint || null,
              historyLen: history.length,
              responseChars: aiResponse.length,
            }))
          } catch (_) { /* logging is best-effort */ }

          // Send AI response via Twilio (split on "|||" delimiter for multi-message replies)
          try {
            const parts = aiResponse.split('|||').map(p => p.trim()).filter(Boolean)
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i]
              await sendWhatsAppMessage(phoneNumber, part)

              // Store each part in mensagens_cliente
              await supabase.from('mensagens_cliente').insert({
                id_lead: lead.id,
                phone_id: parseInt(phoneNumber),
                mensagem_IA: part,
                origem: 'IA',
              })

              // Create outbound interaction per part
              await supabase.from('interactions').insert({
                lead_id: lead.id,
                contact_id: contact.id,
                channel: 'WHATSAPP',
                direction: 'OUTBOUND',
                content: part,
                origin_bot: true,
              })

              // Small delay between consecutive messages so they arrive in order
              if (i < parts.length - 1) {
                await new Promise(r => setTimeout(r, 800))
              }
            }

            console.log('AI response sent and stored successfully (parts:', parts.length, ')')

            // M3/R5: Auto-pause after handoff detection (Stage 8)
            const handoffPatterns = [
              'encaminhar para um especialista',
              'encaminhar para um atendente',
              'vou te encaminhar',
              'transfer you to',
              'te voy a transferir',
              'derivar tu caso',
              'um especialista vai',
              'a specialist will',
              'un especialista va',
            ]
            const isHandoff = handoffPatterns.some(p => aiResponse.toLowerCase().includes(p))
            if (isHandoff) {
              await supabase.from('mensagens_cliente').insert({
                id_lead: lead.id,
                mensagem_IA: '🤖 Handoff automático — IA pausada após encaminhamento ao atendente.',
                origem: 'SISTEMA',
              })
              console.log('Auto-pause: AI handoff detected, inserting SISTEMA marker to pause AI')
            }
          } catch (sendErr) {
            console.error('Failed to send AI response via Twilio:', sendErr instanceof Error ? sendErr.message : sendErr)
          }
        } else {
          console.error('Both Gemini and OpenAI failed to generate a response for lead:', lead.id)
        }
      } catch (aiError) {
        console.error('AI agent error (non-blocking):', aiError instanceof Error ? aiError.message : aiError)
        // AI errors don't block the webhook processing
      }
    } else {
      console.log(`AI agent skipped: botEnabled=${botEnabled}, hasGeminiKey=${!!geminiApiKey}, pausedByHuman=${aiPausedByHuman}, skipReactivation=${skipAIAgent}`)
    }

    // Update webhook log as processed (using ID from insert, not JSONB comparison)

    // Notify assigned user about new message
    if (lead.assigned_to_user_id) {
      await supabase.from('notifications').insert({
        user_id: lead.assigned_to_user_id,
        title: 'Nova mensagem WhatsApp',
        message: `${contact.full_name}: ${effectiveBody.substring(0, 100)}...`,
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
          message: `${contact.full_name}: ${effectiveBody.substring(0, 100)}...`,
          type: 'whatsapp_message',
        })
      }
    }

    // Mark webhook log as processed to prevent deduplication
    if (webhookLog?.id) {
      await supabase.from('webhook_logs').update({ processed: true }).eq('id', webhookLog.id)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: contact.id,
        leadId: lead.id,
        assignedTo: lead.assigned_to_user_id,
        aiResponseSent: botEnabled && !!geminiApiKey,
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
}

export { handler }

if (!Deno.env.get('SKIP_SERVE')) {
  serve(handler)
}
