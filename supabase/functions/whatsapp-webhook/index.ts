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
    // Quick-reply / button responses (Twilio envia Body=título + ButtonPayload=id).
    // Priorizamos o ButtonPayload (identificador estável YES/NO) sobre o texto do
    // botão — assim a máquina de estados recebe um token determinístico
    // independentemente do idioma do rótulo exibido ao cliente.
    const buttonPayload = (payload as any).ButtonPayload || (payload as any).ButtonText || undefined
    let bodyText = payload.Body || ''
    if (buttonPayload) {
      const p = String(buttonPayload).trim().toUpperCase()
      if (p === 'YES') bodyText = 'sim'
      else if (p === 'NO') bodyText = 'no'
      else if (!bodyText) bodyText = String(buttonPayload)
    }
    return {
      from: phone,
      body: bodyText,
      messageId: payload.MessageSid,
      type: numMedia > 0 ? type : 'text',
      name: payload.ProfileName,
      mediaUrl,
      mimetype,
      buttonPayload: buttonPayload || undefined,
    } as any
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
  detectChatLanguageOrNull,
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
  getNextScriptedQuestion,
  getShortAck,
  isQuestionAboutEmail,
  isQuestionAboutFullName,
  isAutoGeneratedContactName,
  hasValidEmail,
  getEmailReaskQuestion,
  getEmailQuestion,
  getPostHandoffWaitSuffix,
  preHandoffSummarySent,
  handoffTransferSent,
  classifyYesNo,
  isQuestionAboutLocationSpain,
} from './lib/questions.ts'

import {
  FULL_NAME_DENYLIST_PATTERNS,
  isLikelyFullNameAnswer,
  findExplicitFullNameAnswer,
  stripNameIntroPrefix,
} from './lib/name-extraction.ts'

import {
  forceSkipFullNameIfAlreadyKnown,
  forceReaskEmailIfMissing,
  forceAdvanceFromEntryDateQuestion,
  forceAdvanceFromInterestQuestion,
  forceAdvanceFromEmpadronadoQuestion,
  forceReaskFullNameIfSingleWord,
  forceReaskLocationSpainIfAmbiguous,
  isLikelyQuestionLoop,
  lockConfirmedFieldsInResponse,
  sanitizeLocationQuestion,
  forceCorrectBlockForLocation,
  enforceBlockCompletion,
  stripCrossBranchQuestion,
  // forceServicesMessageAfterInterest / ensureServicesAttachedToInterest: removidos com M5/M6.

  computeDeterministicFunnelPatch,
  extractOutsideProgressPatch,
  extractEmpadronadoSincePatch,
  preventRepeatedCanonicalQuestion,
  stripRepeatedOpener,
  stripLockedSentinel,
  stripAlreadySentCanonicalBlocks,
  dedupOpenerAcrossBubbles,
  enforceReplayPreambleLanguage,
  stripPreambleBeforePreHandoff,
  stripRepeatedPreHandoff,
  enforceCanonicalPreHandoff,
  ensurePreHandoffContinuity,
  blockLocationReaskIfKnown,
  enforceCanonicalLanguage,
  isLocked,
  lock,
  stripDuplicateShortOpeners,
  composeAckPlusScripted,
} from './lib/overrides.ts'

import {
  loadFunnelState,
  applyTurnUpdates,
  mergeOutsideProgress,
  buildStateDirective,
  isContactNameTrustworthy,
  syncFunnelFromCapturedData,
} from './lib/funnel-state.ts'

import { classifyOffTopic, getOffTopicAckPhrase, stripReAskOfCapturedFields, type CapturedSnapshot } from './lib/offtopic.ts'
import { isValidSpanishCity } from './lib/spanish-cities.ts'
import { normalizeQueue, pushPending, getReplayPreamble, type PendingItem } from './lib/parking.ts'
import { logTurn } from './lib/turn-log.ts'

// Wave 10 — máquina de estados determinística (fonte oficial do fluxo)
import { buildConversationContext } from './lib/conversation-context.ts'
import { decideTurn, applyTurnDecision, type TurnDecision } from './lib/turn-orchestrator.ts'
import { resolveCurrentStep, getStepDef } from './lib/flow-machine.ts'

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
import { getMediaPlaceholder, sendWhatsAppMessage, sendOutgoingIdempotent } from './lib/twilio.ts'
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

  let __concurrentLockKeyOuter: string | null = null
  let __supabaseOuter: any = null
  const releaseConcurrentLock = async () => {
    if (__concurrentLockKeyOuter && __supabaseOuter) {
      try {
        await __supabaseOuter.from('message_dedup').delete().eq('message_id', __concurrentLockKeyOuter)
      } catch (_e) { /* non-blocking */ }
      __concurrentLockKeyOuter = null
    }
  }

  try {
    const supabase = deps.supabase ?? createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    __supabaseOuter = supabase


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
        await logTurn({ supabase, exit_reason: 'DUPLICATE_MSG_ID', message_id: message.messageId, phone: message.from, inbound_text: message.body })
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
            const { data: signedUrlData, error: signedErr } = await supabase.storage
              .from('whatsapp-media')
              .createSignedUrl(filePath, 60 * 60 * 24 * 365)
            if (signedErr || !signedUrlData?.signedUrl) {
              console.error('Signed URL error:', signedErr)
            } else {
              storedMediaUrl = signedUrlData.signedUrl
              console.log('Media stored at (signed):', storedMediaUrl, '(source:', downloadSource, ')')
            }
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

                      const disambigRes = await sendOutgoingIdempotent(supabase, {
                        phone: phoneNumber, leadId: lead.id, body: disambigMsg,
                      })
                      if (disambigRes.sent) {
                        await supabase.from('mensagens_cliente').insert({
                          id_lead: lead.id,
                          phone_id: parseInt(phoneNumber),
                          mensagem_IA: disambigMsg,
                          origem: 'ROUTING',
                        })
                        console.log('Multichat: disambiguation message sent')
                      } else {
                        console.log('Multichat: disambiguation skipped —', disambigRes.reason)
                      }
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

    // ========== ADAPTIVE BUFFER: wait briefly to consolidate multiple client messages ==========
    if (!skipAIAgent) {
      // Buffer adaptativo: mensagens "completas" (longas ou terminando em pontuação)
      // dispensam espera longa. Caso contrário, aguarda apenas 1.5s para consolidar
      // múltiplos balões enviados em sequência pelo cliente.
      // Buffer adaptativo: mensagens "completas" (longas ou terminando em pontuação)
      // dispensam espera longa. Caso contrário, aguarda apenas 1.5s para consolidar
      // múltiplos balões enviados em sequência pelo cliente.
      const incomingText = (displayBody || message.body || '').trim()
      const looksComplete = incomingText.length > 120 || /[.!?…]$/.test(incomingText)
      const bufferMs = looksComplete ? 300 : 1500
      console.log(`Buffer: waiting ${bufferMs}ms for additional messages (complete=${looksComplete})...`)
      await new Promise(resolve => setTimeout(resolve, bufferMs))

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

        await logTurn({ supabase, exit_reason: 'BUFFERED_NEWER', lead_id: lead.id, contact_id: contact?.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body })
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
          await logTurn({ supabase, exit_reason: 'ANTI_DUP', lead_id: lead.id, contact_id: contact?.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body, details: { recentOutbound: recentOutbound[0] } })
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

    // POST-HANDOFF ACK GUARD: se o funil já sinalizou handoff (pre_handoff_sent
    // ou handoff_sent = true) e o cliente enviou apenas um ack curto
    // ("ok", "obrigada", "vale", "gracias", "thanks", "hum", emoji-only, etc.),
    // NÃO deve haver reengajamento pela IA. O especialista humano assumirá.
    try {
      if (!aiPausedByHuman) {
        const { data: fs } = await supabase
          .from('lead_funnel_state')
          .select('pre_handoff_sent, handoff_sent')
          .eq('lead_id', lead.id)
          .maybeSingle()
        const handoffReached = !!(fs?.pre_handoff_sent || fs?.handoff_sent)
        const handoffFinal = !!fs?.handoff_sent
        const inboundText = String(displayBody || message.body || '').trim()
        const normalizedInbound = inboundText.toLowerCase().replace(/[.!?…\s]+$/g, '').trim()
        const ACK_RE = /^(ok|okay|okey|k|kk|vale|blz|beleza|certo|claro|perfeito|entendi|entendido|obrigad[oa]|obrigada|obrigado|valeu|gracias|muchas gracias|thanks|thank you|thx|ty|merci|hum+|mmh+|hmm+|aha+|humm+|👍|🙏|👌|✅|😊|🙂)$/i
        // Detecção ampla de agradecimentos PT/ES/EN/FR:
        // - "obrigado", "obrigada de novo", "muito obrigado mesmo", "obg", "brigado"
        // - "vale", "vale gracias", "gracias", "muchas gracias", "mil gracias", "gracias de nuevo", "grato/a"
        // - "thanks", "thanks!", "thanks a lot", "thank you so much", "thx", "ty", "tks"
        // - "merci", "merci beaucoup", "danke"
        const THANKS_TOKEN = '(?:muito\\s+|muy\\s+|mui\\s+|mt\\s+|so\\s+|really\\s+|muchas\\s+|muchisimas\\s+|much[íi]simas\\s+|muitas\\s+|mil\\s+)?(?:obrigad(?:[oa]|[ãa]o|ona)|obg|brigad(?:[oa]|[ãa]o)|agradecid[oa]|grat[oa]|valeu|vlw|gracias|graci[ñn]as|grazas|mercies?|merci|danke|thanks?|thx|tks|tysm|ty|thank\\s*(?:you|u))(?:\\s+(?:mesmo|demais|mesmo\\s+assim|de\\s+novo|novamente|otra\\s+vez|de\\s+nuevo|nuevamente|a\\s+lot|so\\s+much|very\\s+much|beaucoup|mil|muito|muitas?|muchas?|mil\\s+vezes))?'
        const THANKS_ONLY_RE = new RegExp(`^(?:ok+\\s+|okay\\s+|vale\\s+|blz\\s+|beleza\\s+|perfeito\\s+|perfecto\\s+|listo\\s+)?${THANKS_TOKEN}(?:[,!.\\s]+${THANKS_TOKEN})*[!.\\s👍🙏👌✅✔️😊🙂❤️💚💛]*$`, 'i')
        const isEmojiOnly = /^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)$/u.test(inboundText)
        const isShortAck = (ACK_RE.test(normalizedInbound) || isEmojiOnly)
          && inboundText.length < 25
          && !inboundText.includes('?')
        const isThanksOnly = THANKS_ONLY_RE.test(normalizedInbound) && !inboundText.includes('?')
        // Frases de espera/aguardo PT/ES/EN/FR que também NÃO devem
        // reengajar a IA após handoff (cliente está aguardando humano).
        const WAITING_RE = /^(?:ok+[,!.\s]*)?(?:fico|vou ficar|estou|estarei|seguirei|sigo|quedo|me quedo|estoy|estar[ée]|voy a estar|i(?:'|)?ll (?:be )?wait(?:ing)?|waiting|awaiting|je (?:vais )?attend(?:s|re)?|j['\u2019]?attends?)(?=[\s,.!?]|$)(?:[\s\S]{0,60}?(?:aguard\w*|espera\w*|esperando|attente|attend\w*|wait\w*|hear(?:ing)? back|your (?:reply|response)))?[!.\s👍🙏👌✅✔️😊🙂❤️💚💛]*$/i
        const isWaitingOnly = WAITING_RE.test(inboundText) && !inboundText.includes('?')
        // Opção B: após handoff_sent=true, IA continua respondendo qualquer
        // mensagem com conteúdo — só silencia em ack/thanks/waiting/emoji puros
        // (mensagens que apenas confirmam recebimento e aguardam humano).
        if (handoffFinal && (isShortAck || isThanksOnly || isWaitingOnly || isEmojiOnly)) {
          aiPausedByHuman = true
          console.log(`[POST_HANDOFF_SILENCE] IA pausada — handoff_sent=true + ack/thanks/waiting: "${inboundText.slice(0, 40)}"`)
        } else if (handoffReached && isShortAck) {
          aiPausedByHuman = true
          console.log(`[POST_HANDOFF_ACK] pausando IA — cliente enviou ack curto "${inboundText}" após handoff`)
        } else if (isThanksOnly) {
          // Fix 5: agradecimento puro NUNCA gera resposta duplicada da IA
          aiPausedByHuman = true
          console.log(`[THANKS_ONLY_SILENCE] IA pausada — mensagem é apenas agradecimento: "${inboundText.slice(0, 40)}"`)
        } else if (isWaitingOnly) {
          aiPausedByHuman = true
          console.log(`[WAITING_ONLY_SILENCE] IA pausada — cliente sinalizou aguardo: "${inboundText.slice(0, 40)}"`)
        }
      }
    } catch (postHandoffErr) {
      console.warn('[POST_HANDOFF_ACK] non-blocking error:', postHandoffErr instanceof Error ? postHandoffErr.message : postHandoffErr)
    }


    // CONCURRENT-PROCESSING LOCK: impede que dois webhooks concorrentes
    // (mensagens do mesmo cliente com < 2s de diferença) gerem respostas
    // duplicadas. Usa message_dedup como advisory lock por lead com bucket
    // temporal de 30s.
    let concurrentLockAcquired = false
    let concurrentLockKey: string | null = null
    if (!aiPausedByHuman && !skipAIAgent) {
      try {
        const bucket = Math.floor(Date.now() / 30_000)
        concurrentLockKey = `ai_lock:${lead.id}:${bucket}`
        const { error: lockErr } = await supabase
          .from('message_dedup')
          .insert({ message_id: concurrentLockKey })
        if (lockErr) {
          // 23505 = unique_violation → outra invocação já pegou o lock
          if ((lockErr as any).code === '23505') {
            console.log('[CONCURRENT_LOCK] outra invocação já está processando este lead, saindo')
            if (webhookLog?.id) {
              await supabase.from('webhook_logs').update({ processed: true }).eq('id', webhookLog.id)
            }
            await logTurn({ supabase, exit_reason: 'ANTI_DUP', lead_id: lead.id, contact_id: contact?.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body, details: { reason: 'concurrent_lock_held', key: concurrentLockKey } })
            return new Response(
              JSON.stringify({ success: true, message: 'Skipped: concurrent processing lock held' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          } else {
            console.warn('[CONCURRENT_LOCK] insert falhou (não-bloqueante):', lockErr.message)
          }
        } else {
          concurrentLockAcquired = true
          __concurrentLockKeyOuter = concurrentLockKey
        }

      } catch (lockCatch) {
        console.warn('[CONCURRENT_LOCK] non-blocking error:', lockCatch instanceof Error ? lockCatch.message : lockCatch)
      }
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

        // === DETECÇÃO PRECOCE DE CLIENTE JÁ CADASTRADO (retorno) ===
        // Pré-handoff só roda para clientes NOVOS. Se o contato já tem nome
        // confiável + email + outro lead anterior, é um cliente retornando.
        let isReturningClient = false
        try {
          const trustedName = isContactNameTrustworthy(contact)
            && !isAutoGeneratedContactName(contact.full_name, message.name, phoneNumber)
          const hasEmail = !!(contact.email && String(contact.email).trim())
          if (trustedName && hasEmail) {
            const { count: priorLeadsCount } = await supabase
              .from('leads')
              .select('id', { count: 'exact', head: true })
              .eq('contact_id', contact.id)
              .neq('id', lead.id)
            isReturningClient = (priorLeadsCount ?? 0) > 0
          }
        } catch (rcErr) {
          console.warn('[RETURNING_CLIENT] early-detection error:', rcErr instanceof Error ? rcErr.message : rcErr)
        }


        const currentCustomerMessage = String(effectiveBody || '')
        // LANGUAGE LOCK: detectar uma única vez (1ª interação) e travar para sempre.
        // contact.preferred_language é a única fonte da verdade após a primeira detecção.
        const preferredLangMap: Record<string, ChatLanguage> = { 'pt': 'pt-BR', 'pt-BR': 'pt-BR', 'es': 'es', 'en': 'en', 'fr': 'fr' }
        const langCodeMap: Record<ChatLanguage, string> = { 'pt-BR': 'pt', 'es': 'es', 'en': 'en', 'fr': 'fr' }

        let detectedChatLanguage: ChatLanguage
        // Junta as últimas mensagens do cliente (via mensagens_cliente) para dar mais material
        // à detecção (mensagens curtas/typos como "good mroning" isoladas não disparam sinal).
        let recentUserMsgs: string[] = []
        try {
          const { data: recentRows } = await supabase
            .from('mensagens_cliente')
            .select('mensagem_cliente, created_at')
            .eq('id_lead', lead.id)
            .not('mensagem_cliente', 'is', null)
            .order('created_at', { ascending: false })
            .limit(6)
          recentUserMsgs = (recentRows || []).map((r: any) => String(r.mensagem_cliente || '')).filter(Boolean).reverse()
        } catch (_) { /* ignore */ }
        const combinedSample = [...recentUserMsgs, currentCustomerMessage].join(' \n ').trim()

        if (isFirstInteraction) {
          const positive = detectChatLanguageOrNull(combinedSample)
          if (positive) {
            detectedChatLanguage = positive
            const currentLangCode = langCodeMap[detectedChatLanguage]
            await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
            contact.preferred_language = currentLangCode
            console.log('Language locked (first detection):', detectedChatLanguage, 'sample:', combinedSample.slice(0, 120))
          } else {
            detectedChatLanguage = 'pt-BR'
            console.log('Language provisional pt-BR (no positive signal yet); will re-detect on next inbound')
          }
        } else if (contact.preferred_language && preferredLangMap[contact.preferred_language]) {
          // Re-detecção suave: nos primeiros turnos, se o cliente começa a escrever claramente
          // em outro idioma, permite trocar o lock uma vez (cobre caso do 1º msg ser typo curto).
          const locked = preferredLangMap[contact.preferred_language]
          const positive = detectChatLanguageOrNull(combinedSample)
          if (positive && positive !== locked && recentUserMsgs.length <= 4) {
            detectedChatLanguage = positive
            const currentLangCode = langCodeMap[detectedChatLanguage]
            await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
            contact.preferred_language = currentLangCode
            console.log('Language re-locked (early positive signal):', locked, '→', detectedChatLanguage)
          } else {
            detectedChatLanguage = locked
            console.log('Language locked (from contact):', detectedChatLanguage)
          }
        } else {
          detectedChatLanguage = detectChatLanguageOrNull(combinedSample) ?? 'pt-BR'
          const currentLangCode = langCodeMap[detectedChatLanguage]
          await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
          contact.preferred_language = currentLangCode
          console.log('Language locked (fallback detection):', detectedChatLanguage)
        }

        // Wave 4: carregar estado persistente do funil
        let funnelState = await loadFunnelState(supabase, lead.id, contact)

        // ============================================================
        // Wave 10 — GATE DETERMINÍSTICO (Turn Orchestrator)
        // ------------------------------------------------------------
        // Toda mensagem do cliente passa AQUI antes de qualquer cálculo
        // de etapa pelo handler legado. O orquestrador:
        //   1) constrói o ConversationContext a partir do estado persistido
        //   2) classifica off-topic / valida / decide próxima etapa
        //   3) aplica o patch via applyTurnUpdates (mesma camada legada)
        // O LLM NÃO participa dessa decisão.
        // Para NAME/EMAIL/INTEREST/LOCATION o orquestrador é autoridade
        // única; para Inside/Outside/PreHandoff/Handoff retorna
        // `pass_through` e a etapa segue tratada pelo handler legado.
        // ============================================================
        let orchestratorDecision: TurnDecision | null = null
        try {
          const ctx = buildConversationContext(funnelState, contact as any, detectedChatLanguage)
          const decision = decideTurn(ctx, currentCustomerMessage || '')
          orchestratorDecision = decision
          if (Object.keys(decision.state_patch).length > 0) {
            funnelState = await applyTurnDecision(supabase, funnelState, decision)
          }
          console.log('[ORCHESTRATOR]', JSON.stringify({
            current_step: decision.current_step,
            next_step: decision.next_step,
            action: decision.action.kind,
            patched: Object.keys(decision.state_patch),
          }))
        } catch (orchErr) {
          console.warn('[ORCHESTRATOR] non-blocking error:', orchErr instanceof Error ? orchErr.message : orchErr)
        }




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

## REGRA DE DATAS — FORMATO ÚNICO DD/MM/YYYY (CRÍTICO — APLICA-SE A TODO O FLUXO)
- SEMPRE que precisar pedir uma data ao cliente (entrada na Espanha, nascimento, validade de documento, agendamento, "desde quando", etc.), explicite o formato esperado: **DD/MM/AAAA** em PT/ES/FR ou **DD/MM/YYYY** em EN, com um exemplo curto (ex.: "22/05/2025").
- SEMPRE que repetir, confirmar ou ecoar uma data ao cliente, escreva-a no formato **DD/MM/YYYY** (ex.: "22/05/2025"), nunca em formato livre como "22 de maio" ou "May 22".
- Se o cliente responder uma data SEM o ano (ex.: "22 de maio", "22/05", "ayer", "el martes pasado"), NÃO assuma o ano. Peça novamente a data completa no formato DD/MM/AAAA, adaptando ao idioma do cliente. Exemplo: "Para evitar erros, pode me enviar a data completa no formato DD/MM/AAAA? Exemplo: 22/05/2025."
- Datas relativas ("hoje", "ontem", "anteontem", "há 3 dias", "semana passada") devem ser convertidas para DD/MM/YYYY ao confirmar/repetir, usando a DATA DE REFERÊNCIA acima.
- NUNCA aceite datas em outros formatos sem confirmar. Não use MM/DD/YYYY mesmo quando o cliente parecer estar em EN — a empresa padroniza DD/MM/YYYY globalmente.

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
3. (E-mail removido do onboarding — NÃO peça e-mail. Vá direto do nome para a próxima pergunta.)
4. **Origem**: como conheceu a CB Asesoría (Instagram, Google, indicação, etc.). Se for indicação, perguntar o nome de quem indicou.
5. **Localização atual**: pergunte EXATAMENTE como mensagem ÚNICA, sem juntar com outra (NUNCA use "|||" aqui): "${t.askLocationSpain}". É uma pergunta SIM/NÃO. NUNCA use a forma disjuntiva "ou ainda está em outro país" / "o aún estás en otro país" / "or still in another country". Se a resposta for negativa, NÃO pergunte em qual país a pessoa está — siga direto para o bloco "fora da Espanha". Aguarde a resposta antes de seguir.
6. **Aprofundamento conforme localização** — escolha APENAS UM bloco e siga UMA pergunta por vez, aguardando a resposta entre cada uma (NUNCA junte com "|||", NUNCA despeje a lista toda):
   - **Se FORA da Espanha** — siga nesta ordem exata, frase por frase (traduza fielmente ao idioma do cliente):
     1. "Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário." (apenas aviso, já emende com a primeira pergunta abaixo na MESMA mensagem OU envie sozinha e siga na próxima — não repita esse aviso depois)
     2. "Qual sua idade?" — se o cliente disser só a idade, registre; se vier data, melhor ainda. Não force formato.
     3. "Você esteve na Europa nos últimos 6 meses?"
     4. "Possui familiar europeu ou residente legal na Espanha?"
     5. "Você trabalha remoto?"
     6. (A6 removida — não pergunte sobre formação superior.)
   - **Se JÁ NA ESPANHA** — siga nesta ordem exata, frase por frase, UMA por vez aguardando resposta entre cada (NUNCA junte com "|||", NUNCA despeje a lista toda; traduza fielmente ao idioma do cliente):
     1. "Perfeito. Agora preciso entender como está sua situação aqui." (apenas aviso — pode ser mensagem isolada ou emendada com a próxima pergunta; não repita esse aviso depois)
     2. "Qual foi a data exata da sua entrada na Espanha?" — SEMPRE peça já indicando o formato esperado **DD/MM/AAAA** (ex.: 22/05/2025). Em EN use **DD/MM/YYYY**. Em FR use **JJ/MM/AAAA**.
         - Só aceite a data de entrada se o cliente informar dia, mês e ano. Se faltar o ano (ex.: "20 de abril", "20/04", "ayer", "semana pasada"), peça novamente no formato DD/MM/AAAA com exemplo, antes de avançar.
         - Ao confirmar/ecoar a data ao cliente, use sempre o formato DD/MM/YYYY (ex.: "20/04/2025"). Nunca escreva "20 de abril" sem o ano.
         - Se a data informada for ANTERIOR OU IGUAL à data de hoje (ver "DATA DE REFERÊNCIA"), aceite sem questionar — mesmo que tenha sido há poucos dias, semanas ou meses. NÃO sugira anos alternativos.
         - NUNCA pergunte se a data está "no futuro" nem peça confirmação por suspeita de ano errado — o sistema valida isso automaticamente. Apenas aceite a data e siga.
     3. "Você está empadronado?"
     4. "Se sim, desde quando?" (só faça se a resposta anterior for afirmativa; se negativa, pule)
     5. "Em qual cidade você está empadronado?" (só faça se empadronado)
 7. **Pré-Handoff + Handoff (BPMN-3) — UMA ÚNICA RODADA, 3 mensagens** — assim que o aprofundamento (A ou B) terminar, envie as 3 frases abaixo NA MESMA RESPOSTA, separadas pelo delimitador "|||" (3 bolhas), nesta ordem exata, traduzidas fielmente ao idioma travado:
   - "Perfeito, já consigo ter uma visão inicial do seu caso."
   - "Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei."
   - "Vou encaminhar suas informações para um especialista analisar com mais profundidade."
   NÃO faça novas perguntas. NÃO insira "modo tira-dúvidas" ANTES dessas 3 mensagens. APÓS o envio, todas as próximas respostas vêm da Base de Conhecimento e DEVEM terminar com a frase localizada de "aguarde um especialista" (a infraestrutura adiciona automaticamente — não a duplique).
 8. **Pós-Handoff (KB)** — depois das 3 mensagens acima, responda dúvidas APENAS com base na KB, de forma breve e clara, no idioma travado. NÃO repita H1-H3. NÃO peça novamente nenhum dado já coletado.

**IMPORTANTE**: NÃO pergunte "qual seu interesse" nem apresente o catálogo de serviços em nenhum momento do onboarding. NÃO pergunte e-mail. Vá direto do nome para a pergunta de localização.

## PERGUNTAS FORA DO ROTEIRO (Base de Conhecimento)
- REGRA CRÍTICA: enquanto o cadastro inicial (objetivos 2 a 6) NÃO estiver concluído, NÃO responda dúvidas técnicas do cliente (ex.: autorização de regresso, arraigo, NIE, valores, prazos, documentos). Em vez disso, reconheça brevemente a pergunta UMA ÚNICA VEZ, diga que primeiro precisa terminar de coletar os dados para encaminhar ao especialista certo, e retome EXATAMENTE a próxima pergunta pendente do roteiro.
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

        // First interaction (cliente NOVO): reinforce welcome behavior.
        // Cliente já cadastrado (isReturningClient) NÃO entra no fluxo de abertura —
        // recebe uma saudação de retorno pelo nome e vai direto para a dúvida.
        if (isFirstInteraction && !isReturningClient) {
          console.log('First interaction detected (novo cliente), using welcome flow')
          const _tpl = getPromptTemplates(detectedChatLanguage)
          systemPrompt += `\n\n--- INSTRUÇÃO ESPECIAL: PRIMEIRA INTERAÇÃO ---
Esta é a PRIMEIRA mensagem deste cliente. Você DEVE responder com EXATAMENTE estas duas mensagens, nesta ordem, separadas pelo delimitador "|||" (sem nenhum outro texto antes, depois ou entre elas). NÃO traduza, NÃO altere, NÃO resuma — use literalmente:

${_tpl.openingLine1}|||${_tpl.openingLine2}

Regras:
- NÃO responda à pergunta do cliente ainda. Apenas envie essas duas mensagens de abertura.
- NÃO omita a segunda mensagem. NÃO remova o delimitador "|||".
- NÃO adicione nenhuma pergunta extra, assinatura, nem mais texto.
--- FIM DA INSTRUÇÃO ESPECIAL ---`
        } else if (isReturningClient) {
          console.log('[RETURNING_CLIENT] usando saudação de retorno (sem pré-handoff)')
          const firstName = (contact.full_name || '').split(/\s+/)[0] || ''
          systemPrompt += `\n\n--- INSTRUÇÃO ESPECIAL: CLIENTE JÁ CADASTRADO ---
Este cliente JÁ ESTÁ cadastrado (nome e e-mail conhecidos, histórico anterior com a CB).
NÃO refaça o cadastro, NÃO peça nome, NÃO peça e-mail, NÃO envie a abertura padrão de "perguntas rápidas".
Cumprimente pelo primeiro nome ("${firstName}") de forma calorosa e curta, diga que é bom falar novamente, e em UMA frase pergunte como pode ajudar hoje — JÁ no idioma travado da conversa.
Depois, responda normalmente à dúvida do cliente usando a Base de Conhecimento quando aplicável.
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
          const explicitCurrentName = stripNameIntroPrefix(String(messageForAI).trim())
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
        let { data: leadInterest } = await supabase
          .from('leads')
          .select('service_interest, service_type_id, notes')
          .eq('id', lead.id)
          .maybeSingle()
        // Detect "short ack" messages ("ok", "sim", "claro", "entendi", emojis…).
        // These carry no topical content by themselves and MUST NOT trigger a
        // topic reclassification — they should inherit the topic from the
        // ongoing conversation (previous user + assistant turns). Otherwise
        // the KB returns unrelated PDFs (e.g. user was talking about ARRAIGO
        // SOCIAL, replies "Ok", and the agent suddenly answers about
        // RESIDÊNCIA NÃO LUCRATIVA).
        const SHORT_ACK_RE = /^\s*(ok+|okay|okey|vale|d[ae]le|claro|entendi|entendido|perfeito|perfecto|sim|si|sí|yes|s[ií]m|n[ãa]o|no|tudo bem|todo bien|listo|combinado|👍|✅|✔️|🙏|👌)[\s!?.…]*$/i
        const rawTrim = (rawCustomerMessage || '').trim()
        const isShortAck = rawTrim.length > 0 && rawTrim.length <= 25 && SHORT_ACK_RE.test(rawTrim)

        // Build a "topical conversation" text: when current msg is an ack,
        // weigh the previous user turns + recent assistant content; otherwise
        // weigh the current message strongly.
        const recentUserText = (history || [])
          .filter((m: any) => m.role === 'user')
          .slice(-5)
          .map((m: any) => String(m.content || ''))
          .join('\n')
        const recentAssistantText = assistantMsgs.slice(-3).map(m => m.content).join(' ')

        const currentMessageTopicHint = isShortAck
          ? await detectKnowledgeTopicHint(
              supabase,
              `${recentUserText}\n${lastAssistantQuestion || ''}\n${recentAssistantText}`,
            )
          : await detectKnowledgeTopicHint(supabase, rawCustomerMessage || '')
        let topicHint = currentMessageTopicHint

        // If we still don't have a topic, try the broader recent-conversation
        // context BEFORE falling back to the lead's persisted service_interest
        // — the conversation is more reliable than a stale lead field that
        // might map to a different KB document family.
        if (!topicHint) {
          topicHint = await detectKnowledgeTopicHint(
            supabase,
            `${recentUserText}\n${recentAssistantText}\n${lastAssistantQuestion || ''}\n${rawCustomerMessage || ''}`,
          )
        }
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
        if (isShortAck) {
          console.log(`[KB] short-ack detected ("${rawTrim}") — inherited topic from recent conversation: "${topicHint}"`)
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

        // M5/M6 (interesse/catálogo) removidos do onboarding — o fluxo pula
        // direto de e-mail para localização. Nenhuma captura de interesse aqui.




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

        // === GATE CLIENTE JÁ CADASTRADO (retorno) ===
        // isReturningClient já foi computado no topo do agent block (linha ~1200).
        // Aqui aplicamos o efeito: pré-popular o funil para pular o pré-handoff.
        if (isReturningClient) {
          console.log('[RETURNING_CLIENT] cliente já cadastrado — pulando pré-handoff e indo direto para modo livre')
          try {
            const patch: Record<string, unknown> = {
              name_confirmed: true,
              email_confirmed: true,
              pre_handoff_sent: true,
              handoff_sent: true,
              step: 'livre',
              updated_at: new Date().toISOString(),
            }
            await supabase.from('lead_funnel_state').update(patch).eq('lead_id', lead.id)
            funnelStateLive = { ...funnelStateLive, ...patch } as any
          } catch (rcuErr) {
            console.warn('[RETURNING_CLIENT] funnel pre-populate failed:', rcuErr instanceof Error ? rcuErr.message : rcuErr)
          }
          nameMissing = false
          emailMissing = false
        }



        // === Patch determinístico turn-a-turn (multi-idioma) ===
        // Captura localização/interesse/data/empadronamento/cidade ANTES de chamar a IA,
        // baseado APENAS em (previousQuestion, rawCustomerMessage). Sem LLM, sem heurística.
        try {
          const detPatch = computeDeterministicFunnelPatch(lastAssistantMessage, rawCustomerMessage)
          if (Object.keys(detPatch).length > 0) {
            const safe: Record<string, unknown> = {}
            if (detPatch.location_known && !funnelStateLive.location_known) safe.location_known = detPatch.location_known
            const currentInterestEmpty = !funnelStateLive.interest_confirmed
              || ['SEM_SERVICO', 'OUTRO', ''].includes(String(funnelStateLive.interest_confirmed).toUpperCase())
            if (detPatch.interest_confirmed && currentInterestEmpty) safe.interest_confirmed = detPatch.interest_confirmed
            if (detPatch.entry_date_confirmed && !funnelStateLive.entry_date_confirmed) safe.entry_date_confirmed = detPatch.entry_date_confirmed
            if (detPatch.empadronado_confirmed !== undefined && (funnelStateLive.empadronado_confirmed === null || funnelStateLive.empadronado_confirmed === undefined)) safe.empadronado_confirmed = detPatch.empadronado_confirmed
            if (detPatch.empadronado_city && !funnelStateLive.empadronado_city) safe.empadronado_city = detPatch.empadronado_city
            if (Object.keys(safe).length > 0) {
              const isAutoLocation = safe.location_known === 'spain' && detPatch.location_source === 'auto_opener_claim'
              const overrideTag = isAutoLocation ? 'auto_location_spain_from_opener' : 'deterministic_pre_ai'
              funnelStateLive = await applyTurnUpdates(supabase, funnelStateLive, safe as any, { override_applied: overrideTag })
              if (funnelStateLive.interest_confirmed) serviceMissing = false
              if (isAutoLocation) {
                ;(funnelStateLive as any).__justAutoLocationSpain = true
                if (detPatch.location_city_hint) {
                  ;(funnelStateLive as any).__justAutoLocationCity = detPatch.location_city_hint
                }
                console.log('[AUTO_LOCATION] spain from evidence:', JSON.stringify(detPatch.location_evidence || ''), 'city:', detPatch.location_city_hint || '-')
              }
              console.log('[DET_PATCH]', JSON.stringify(safe))
            }
          }
        } catch (detErr) {
          console.warn('[DET_PATCH] non-blocking error:', detErr instanceof Error ? detErr.message : detErr)
        }

        // Persistência incremental do ramo A (idade, Europa 6m, familiar, remoto, formação)
        // + B4 desde quando (empadronamiento_since) — sempre que aplicável.
        try {
          const opPatch = funnelStateLive.location_known === 'outside'
            ? extractOutsideProgressPatch(lastAssistantMessage, rawCustomerMessage)
            : {}
          const sincePatch = extractEmpadronadoSincePatch(lastAssistantMessage, rawCustomerMessage)
          const merged = { ...opPatch, ...sincePatch }
          if (Object.keys(merged).length > 0) {
            funnelStateLive = await mergeOutsideProgress(supabase, funnelStateLive, merged as any)
          }
          // Espelha B4 em contacts.empadronamiento_since quando ISO parseável.
          if (sincePatch.b4_empadronado_since && /^\d{4}-\d{2}-\d{2}$/.test(sincePatch.b4_empadronado_since)) {
            try {
              await supabase.from('contacts')
                .update({ empadronamiento_since: sincePatch.b4_empadronado_since })
                .eq('id', contact.id)
            } catch (cErr) {
              console.warn('[B4_PERSIST] contacts.empadronamiento_since update failed:', cErr instanceof Error ? cErr.message : cErr)
            }
          }
        } catch (opErr) {
          console.warn('[OUTSIDE_PROGRESS] non-blocking error:', opErr instanceof Error ? opErr.message : opErr)
        }


        // Detecção de localização: buscar a RESPOSTA imediatamente após a pergunta
        // canônica de localização. Usa o detector compartilhado isQuestionAboutLocationSpain,
        // que reconhece TANTO a forma longa ("Hoje você já está na Espanha?") quanto a
        // forma curta ("¿Estás en España?", "Está na Espanha?", "Are you in Spain?",
        // "Êtes-vous en Espagne ?").
        let locationAnswer = ''
        for (let i = 0; i < history.length - 1; i++) {
          const m = history[i]
          if (m.role === 'assistant' && isQuestionAboutLocationSpain(m.content)) {
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
        const yesNoVerdict = classifyYesNo(ans)
        // Seed flags a partir do estado persistido — evita que, em turnos
        // subsequentes (quando a mensagem atual não é sim/não), as flags fiquem
        // ambas false e o fallback scripted retorne vazio, travando a conversa.
        const persistedLoc = funnelStateLive.location_known
        let userOutsideSpain = yesNoVerdict === 'no' || persistedLoc === 'outside'
        let userInSpain = yesNoVerdict === 'yes' || persistedLoc === 'spain'

        // Reforço turn-a-turn: se a ÚLTIMA pergunta do bot foi a de localização e o
        // cliente acabou de responder sim/não, grava location_known imediatamente
        // para que o gate avance e não repita a pergunta no mesmo turno.
        try {
          if (
            !funnelStateLive.location_known
            && lastAssistantQuestion
            && isQuestionAboutLocationSpain(lastAssistantQuestion)
          ) {
            const verdictNow = classifyYesNo(String(rawCustomerMessage || ''))
            if (verdictNow === 'yes' || verdictNow === 'no') {
              const loc = verdictNow === 'yes' ? 'spain' : 'outside'
              funnelStateLive = await applyTurnUpdates(
                supabase,
                funnelStateLive,
                { location_known: loc } as any,
                { override_applied: 'location_yesno_immediate' },
              )
              if (loc === 'spain') userInSpain = true
              else userOutsideSpain = true
              console.log(`[LOCATION_IMMEDIATE] gravado location_known=${loc} a partir de resposta sim/não`)
            }
          }
        } catch (locErr) {
          console.warn('[LOCATION_IMMEDIATE] non-blocking error:', locErr instanceof Error ? locErr.message : locErr)
        }




        // Definição das 8 etapas do roteiro (na ordem)
        type Step = {
          key: string
          label: string
          done: boolean
          instruction: string
        }
        const steps: Step[] = []

        // Etapa 1 — Abertura (Msg1 + Msg2)
        // Resiliente: se qualquer etapa posterior já está gravada no funil
        // (name/email/interest/location), consideramos a abertura concluída
        // mesmo que o regex de consent (Msg2) não tenha casado no transcript.
        // Isso evita reabrir a abertura depois que o cliente já avançou (bug Gustavo).
        const aberturaSignals = sentAny(/\b(assistente virtual|asistente virtual|virtual assistant|assistante virtuelle)\b/i)
          && sentAny(/\b(perguntas? r[áa]pidas?|preguntas r[áa]pidas|quick questions?|questions rapides)\b/i)
        const aberturaStateSent = !!((funnelStateLive.outside_spain_progress || {}) as any).opener_sent
        // Auto-done SOMENTE quando há evidência de que a abertura já foi enviada
        // em turno anterior. NÃO usamos name/email/interest/location isolados como
        // sinal — na 1ª mensagem o cliente pode já mencionar o serviço desejado
        // (ex.: "quero dar entrada na nacionalidade"), o que preenche interest_confirmed
        // via extractInterestFromMessage. Isso NÃO significa que a saudação foi
        // enviada — antes exigia todos os campos, agora exigimos evidência real
        // (opener_sent flag OU regex nas mensagens já enviadas) — bug Rose Carla.
        const aberturaAutoDone = isReturningClient || aberturaStateSent
        const aberturaDone = aberturaSignals || aberturaAutoDone
        steps.push({
          key: 'abertura', label: 'ABERTURA',
          done: aberturaDone,
          instruction:
            `Envie a ABERTURA COMPLETA em DUAS mensagens curtas, EXATAMENTE nesta ordem e SEM alterar/traduzir (o idioma já está travado): (1) "${t.openingLine1}" (2) "${t.openingLine2}". A frase (2) JÁ contém a pergunta do nome — NÃO adicione outra pergunta, NÃO peça e-mail, NÃO peça localização agora. Envie AS DUAS frases juntas nesta mesma resposta.`,
        })


        // Etapa 2 — Nome (Msg3)
        steps.push({
          key: 'nome', label: 'NOME COMPLETO',
          done: !nameMissing,
          instruction:
            `Pergunte APENAS o NOME COMPLETO do cliente. Envie EXATAMENTE esta frase, JÁ no idioma travado da conversa, sem traduzir nem alterar: "${t.askName}". Se o cliente fez outra pergunta, agradeça em UMA frase ("${t.oneMomentPlease}") e em seguida faça SOMENTE a pergunta do nome.`,
        })

        // Etapa 3 — Email REMOVIDA do fluxo. Segue direto de NOME → LOCALIZAÇÃO.

        // Etapa 4 — Interesse (M5/M6) REMOVIDA do onboarding. O fluxo pula
        // direto de e-mail para localização. `catalogSent` mantido como
        // constante fixa `false` só para compatibilidade dos call sites
        // legados que ainda o passam para helpers (getNextScriptedQuestion).
        const catalogSent = false



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
            `Pergunte APENAS: "${t.askLocationSpain}" — pergunta SIM/NÃO, JÁ no idioma travado da conversa, NÃO traduza nem altere. PROIBIDO usar a forma disjuntiva "ou ainda está em outro país" / "o aún estás en otro país" / "or still in another country". Se a resposta for negativa, NÃO pergunte em qual país a pessoa está — siga direto para o bloco "fora da Espanha". Aguarde a resposta antes de avançar.`,
        })

        // Etapa 6 — Aprofundamento conforme localização
        let aprofundamentoDone = false
        let aprofundamentoInstruction = ''
        if (userInSpain) {
          // Bloco B — Na Espanha (B1-B5)
          const bIntro = sentAny(/\bagora preciso entender como est[áa] sua situa[çc][ãa]o aqui|ahora necesito entender|now i need to understand\b/i)
          const askedEntryDate = sentAny(/\b(data (exata )?da sua entrada|fecha (exacta )?de tu entrada|cu[áa]ndo (entraste|llegaste)|date (exacte )?(de votre|of your) entr|date you entered|when did you (enter|arrive)|quand (etes|êtes)-vous (entre|arrive))\b/i)
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
          aprofundamentoDone = aIntro && askedIdade && askedEuropaEffective && askedFamiliar && askedRemoto
          aprofundamentoInstruction =
            'O cliente está FORA da Espanha. Avance pelo bloco A na ordem, UMA pergunta por turno: ' +
            (!aIntro ? '(A1) "Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário." então ' : '') +
            (!askedIdade ? '(A2) "Qual sua idade?". ' :
             !askedEuropaEffective ? '(A3) "Você esteve na Europa nos últimos 6 meses?". ' :
             !askedFamiliar ? '(A4) "Possui familiar europeu ou residente legal na Espanha?". ' :
             !askedRemoto ? '(A5) "Você trabalha remoto?". ' :
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
        // BPMN-3: Etapa 7 — PRÉ-HANDOFF + HANDOFF combinados (H1|||H2|||H3 numa rodada)
        const preHandoffSentFlag = !!funnelStateLive.pre_handoff_sent
        const handoffSentFlag = !!funnelStateLive.handoff_sent
        const preHandoffDoneByRegex = sentAny(/vis[ãa]o inicial do seu caso|visi[óo]n inicial de tu caso|initial view of your case/i)
          && sentAny(/cada caso de forma individual|each case individually|caminho mais seguro/i)
        const handoffDoneByRegex = sentAny(/encaminhar suas informa[çc][õo]es|remitir tu informaci[óo]n|forward your information|transmettre vos informations/i)
          && sentAny(/encaminhar para um atendente|derivar a un agente|forward you to an agent|vous transf[ée]rer [àa] un agent/i)
        const preHandoffDoneRaw = preHandoffSentFlag || preHandoffDoneByRegex
        const handoffDoneRaw = handoffSentFlag || handoffDoneByRegex
        // GUARD: se as âncoras foram emitidas sem dados mínimos (interesse não capturado),
        // NÃO consideramos as etapas concluídas — o funil precisa voltar e capturar o
        // que falta (evita loop em aprofundamento com IA reperguntando dados já dados).
        // Só validamos aqui após conhecermos hasMinimumDataForHandoff (calculado abaixo).
        const preHandoffDone = preHandoffDoneRaw
        const handoffDone = handoffDoneRaw

        steps.push({
          key: 'preHandoff', label: 'PRÉ-HANDOFF + HANDOFF (BPMN-3)',
          done: preHandoffDone && handoffDone,
          instruction:
            'Envie EXATAMENTE 3 frases curtas, NESTA ORDEM, separadas pelo delimitador "|||" (3 bolhas em UMA resposta): (1) "Perfeito, já consigo ter uma visão inicial do seu caso." (2) "Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei." (3) "Vou encaminhar suas informações para um especialista analisar com mais profundidade." NÃO faça novas perguntas. NÃO insira "modo tira-dúvidas" ANTES dessas 3 mensagens.',
        })

        // GUARD anti-handoff prematuro: só consideramos cadastro concluído se os dados
        // mínimos foram realmente capturados. Sem isso, mesmo que o LLM vaze as frases
        // âncoras de pré-handoff/handoff, NÃO marcamos as etapas como done.
        const hasMinimumDataForHandoff =
          !!funnelStateLive.name_confirmed &&
          !!funnelStateLive.email_confirmed &&
          !!funnelStateLive.interest_confirmed &&
          funnelStateLive.location_known !== null && funnelStateLive.location_known !== undefined

        // Concluiu cadastro: KB liberada e funil = 'livre'.
        if (preHandoffDone && handoffDone && hasMinimumDataForHandoff) {
          for (const s of steps) s.done = true
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
        } else if ((preHandoffDone || handoffDone) && !hasMinimumDataForHandoff) {
          console.warn('[FUNNEL] handoff_anchor_without_data — ignorando âncoras, forçando reabertura do funil', JSON.stringify({
            leadId: lead.id,
            name_confirmed: !!funnelStateLive.name_confirmed,
            email_confirmed: !!funnelStateLive.email_confirmed,
            interest_confirmed: !!funnelStateLive.interest_confirmed,
            location_known: funnelStateLive.location_known,
            preHandoffDone, handoffDone,
          }))
          // Desmarca etapas de pré-handoff/handoff para forçar o funil a voltar
          // e capturar dados faltantes (tipicamente `interesse`), evitando loop
          // no aprofundamento com IA reperguntando dados já preenchidos.
          for (const s of steps) {
            if (s.key === 'preHandoff') s.done = false
          }
        }

        // Próxima etapa pendente
        const nextStepRaw = steps.find(s => !s.done)
        // GUARD FREE MODE: se o orquestrador declarou free_mode (handoff_sent ou
        // step='livre'), o gate NÃO reativa — mesmo que algum campo do funil
        // pareça "não feito", não reabrimos etapas depois do handoff.
        const orchestratorFreeMode = orchestratorDecision?.action.kind === 'free_mode'
          || !!funnelStateLive.handoff_sent
          || funnelStateLive.step === 'livre'
        const nextStep = orchestratorFreeMode ? undefined : nextStepRaw
        const flowComplete = !nextStep // todas as 7 primeiras etapas concluídas → KB liberada
        const collectionGateActive = !flowComplete
        if (orchestratorFreeMode) {
          console.log('[ORCHESTRATOR_FREE_MODE] gate disabled', JSON.stringify({
            handoff_sent: !!funnelStateLive.handoff_sent,
            step: funnelStateLive.step,
            decision: orchestratorDecision?.action.kind,
          }))
        }


        // ---------- Wave 9: fila de off-topics (parking) ----------
        // Durante o pré-handoff, qualquer mensagem que não seja resposta válida à
        // pergunta corrente é parqueada (perguntas E pedidos). Após o pré-handoff,
        // a fila é drenada automaticamente.
        let pendingQueue: PendingItem[] = normalizeQueue((funnelStateLive as any).pending_questions || [])
        let parkedThisTurn: PendingItem | null = null
        try {
          if (collectionGateActive && rawCustomerMessage) {
            // Repetition guard: ignora silenciosamente mensagens que apenas repetem
            // um dado já confirmado (ex.: cliente reenvia o nome após o bot já tê-lo
            // capturado). Evita que vire "off-topic" e gere o prefixo de parking.
            const normRepeat = (s: string) => String(s || '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/\p{Diacritic}/gu, '')
              .replace(/[^a-z0-9@. ]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            const msgNorm = normRepeat(rawCustomerMessage)
            const recentConfirmed: string[] = []
            try {
              const ans = (funnelStateLive as any)?.answers || {}
              for (const k of Object.keys(ans)) {
                const v = ans[k]?.value
                if (typeof v === 'string') recentConfirmed.push(v)
              }
            } catch (_) { /* noop */ }
            if (contact?.full_name) recentConfirmed.push(String(contact.full_name))
            if (contact?.email) recentConfirmed.push(String(contact.email))
            // Global name guard: se o nome já está confirmado e a mensagem parece
            // um nome próprio (2+ palavras alfabéticas, sem @/dígito), silencia.
            const looksLikeName = /^[\p{L}'\- ]{3,}$/u.test(rawCustomerMessage.trim())
              && rawCustomerMessage.trim().split(/\s+/).length >= 2
              && !/[@\d]/.test(rawCustomerMessage)
            const isRepeatOfConfirmed = recentConfirmed.some(v => {
              const vn = normRepeat(v)
              if (!vn || vn.length < 3) return false
              return vn === msgNorm || (vn.length >= 5 && (vn.includes(msgNorm) || msgNorm.includes(vn)))
            })
            const nameAlreadyConfirmed = !!(funnelStateLive as any)?.name_confirmed
            // Se o Turn Orchestrator decidiu re-perguntar (reask_current) OU
            // avançar (advance) para a etapa atual, NÃO silenciamos — precisamos
            // que o bot responda (re-pergunte). O guard de repetição só vale
            // quando a mensagem é um eco espontâneo, não uma resposta que o
            // orquestrador já classificou como precisando de re-ask.
            const orchestratorHandled = orchestratorDecision &&
              (orchestratorDecision.action.kind === 'reask_current' || orchestratorDecision.action.kind === 'advance')
            const silentlyIgnore = !orchestratorHandled && (isRepeatOfConfirmed || (nameAlreadyConfirmed && looksLikeName))

            if (silentlyIgnore) {
              console.log(`[REPETITION_GUARD] silenced echo of confirmed data: "${rawCustomerMessage.slice(0, 80)}"`)
            } else if (orchestratorDecision && (orchestratorDecision.action.kind === 'advance' || orchestratorDecision.action.kind === 'reask_current')) {
              // O Turn Orchestrator já é a autoridade da etapa atual: se ele
              // aceitou (advance) ou rejeitou pedindo de novo (reask), NÃO
              // duplicamos a classificação aqui — caso contrário a etapa NOVA
              // re-avaliaria a mesma mensagem como off-topic (ex.: "tie" aceito
              // como INTEREST e re-classificado contra LOCATION).
              console.log(`[PARK] skip (orchestrator=${orchestratorDecision.action.kind})`)
            } else {
              const off = classifyOffTopic(rawCustomerMessage, lastAssistantQuestion, { collectionGateActive: true, currentStep: nextStep?.key as any })

              if (off) {
                const before = pendingQueue.length
                pendingQueue = pushPending(pendingQueue, { text: rawCustomerMessage, kind: off.kind })
                if (pendingQueue.length !== before || (pendingQueue[pendingQueue.length - 1]?.text === rawCustomerMessage)) {
                  parkedThisTurn = pendingQueue[pendingQueue.length - 1]
                  await supabase
                    .from('lead_funnel_state')
                    .update({ pending_questions: pendingQueue, updated_at: new Date().toISOString() })
                    .eq('lead_id', lead.id)
                  ;(funnelStateLive as any).pending_questions = pendingQueue
                  console.log(`[PARK] enfileirado (${off.kind}) durante cadastro: "${rawCustomerMessage.slice(0, 80)}" | total=${pendingQueue.length}`)
                }
              }
            }
          }
        } catch (parkErr) {
          console.warn('[PARK] non-blocking error:', parkErr instanceof Error ? parkErr.message : parkErr)
        }

        // Compat com lógica legada de pending_question (para KB query pós-handoff)
        let pendingQuestionToAnswer: string | null = null
        if (!collectionGateActive && (funnelStateLive as any).pending_question && pendingQueue.length === 0) {
          pendingQuestionToAnswer = (funnelStateLive as any).pending_question
          try {
            await supabase
              .from('lead_funnel_state')
              .update({ pending_question: null, updated_at: new Date().toISOString() })
              .eq('lead_id', lead.id)
            ;(funnelStateLive as any).pending_question = null
          } catch (_) { /* best-effort */ }
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
            (parkedThisTurn
              ? `6. ⚠️ ALERTA OFF-TOPIC: o cliente desviou do roteiro com "${parkedThisTurn.text.slice(0, 200)}". JÁ ANOTAMOS internamente para responder no fim. Sua resposta DEVE começar EXATAMENTE assim (traduzido para ${langName}): "${getOffTopicAckPhrase(detectedChatLanguage)}" e em seguida fazer SOMENTE a próxima pergunta do roteiro acima. PROIBIDO responder a dúvida agora. PROIBIDO mencionar serviços, valores ou catálogo. UMA frase de acolhimento + a próxima pergunta. Nada mais.\n`
              : '') +
            `[FIM DO GATE]`
          console.log(`[GATE] step=${nextStep.key} done=${steps.filter(s=>s.done).length}/${steps.length} inSpain=${userInSpain} outside=${userOutsideSpain}`)
        } else {
          console.log(`[GATE] flow complete — KB liberada (handoff=${handoffDone})`)
          // BPMN-3 MODO PÓS-HANDOFF: H1-H3 já foram enviados. Toda resposta vem da KB
          // e termina com o sufixo localizado de "aguarde um especialista".
          messageForAI = `${messageForAI}\n\n[MODO PÓS-HANDOFF (BPMN-3) — INSTRUÇÃO INTERNA, NÃO REPITA AO CLIENTE]\n` +
            `IDIOMA OBRIGATÓRIO E TRAVADO DA RESPOSTA: ${langName}. Definido no início da conversa, NÃO MUDA.\n` +
            `As 3 mensagens H1-H3 (pré-handoff + handoff) JÁ FORAM ENVIADAS. NÃO repita nenhuma delas.\n` +
            `\n## SUA ÚNICA TAREFA AGORA\n` +
            `O cliente está aguardando o especialista, mas fez uma DÚVIDA FACTUAL. Você DEVE responder a dúvida usando os trechos da Base de Conhecimento (KB) abaixo. NÃO repita o handoff. NÃO diga "vou encaminhar". NÃO diga "vou pedir ao especialista". Apenas RESPONDA a dúvida em 2-5 frases claras, no idioma travado.\n` +
            `\n## EXEMPLOS DO QUE NUNCA FAZER (frases PROIBIDAS literalmente, em qualquer idioma):\n` +
            `❌ "Vou encaminhar suas informações para um especialista" / "Voy a remitir tu información" / "I will forward your information" / "Je vais transmettre vos informations"\n` +
            `❌ "Vou pedir ao especialista" / "Le pediré al especialista" / "I'll ask the specialist"\n` +
            `❌ "Analisamos cada caso individualmente" / "Analizamos cada caso"\n` +
            `❌ "Em breve um de nossos especialistas..." (a infraestrutura adiciona como sufixo automaticamente — não escreva)\n` +
            `❌ "Ótima pergunta, te explico assim que terminarmos" (o cadastro acabou)\n` +
            `\n## REGRAS\n` +
            `1. Responda a dúvida usando EXCLUSIVAMENTE a KB fornecida no contexto. Seja direto, 2-5 frases. Idioma: ${langName}.\n` +
            `2. Se a KB realmente não tiver a informação, diga honestamente em UMA frase: "Sobre isso, o especialista confirmará os detalhes com você." (traduzido). NUNCA invente prazos/valores/requisitos.\n` +
            `3. NÃO peça novamente nenhum dado já coletado (nome, e-mail, interesse, localização, idade, data de entrada, empadronamento).\n` +
            `4. A frase de "aguarde um especialista" é anexada AUTOMATICAMENTE pela infra — sua resposta deve conter APENAS o conteúdo da dúvida.\n` +
            (pendingQuestionToAnswer
              ? `5. PRIORIDADE MÁXIMA: o cliente havia feito esta pergunta DURANTE o cadastro e ficou aguardando: "${pendingQuestionToAnswer}". Responda-a AGORA com base na KB. Comece com a frase de retomada NO IDIOMA TRAVADO (${langName}): "${getReplayPreamble(detectedChatLanguage)}". JAMAIS use "Como prometi" em português se ${langName} não for português — use exatamente a frase traduzida acima.\n`
              : '') +
            `[FIM DO MODO PÓS-HANDOFF]`
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
        resolvedSystemPrompt += buildStateDirective(funnelStateLive, detectedChatLanguage)

        // Confirmação leve quando a localização foi auto-detectada neste turno.
        // Adapta o texto conforme (a) evidência incluiu cidade ou só país e
        // (b) já sabemos a data de entrada — evitando re-perguntar o que já temos.
        if ((funnelStateLive as any).__justAutoLocationSpain) {
          const lang = detectedChatLanguage
          const city = String((funnelStateLive as any).__justAutoLocationCity || '').trim()
          const hasEntryDate = !!funnelStateLive.entry_date_confirmed
          const place = {
            pt: city ? `em ${city}` : 'na Espanha',
            es: city ? `en ${city}` : 'en España',
            en: city ? `in ${city}` : 'in Spain',
            fr: city ? `à ${city}` : 'en Espagne',
          }
          // Próxima pergunta: se já temos a data de entrada, pulamos para empadronamento;
          // caso contrário, pedimos a data. Nunca re-perguntamos "você está na Espanha?".
          const nextAsk = hasEntryDate
            ? {
                pt: 'você já está empadronada em alguma cidade?',
                es: '¿ya estás empadronada en alguna ciudad?',
                en: 'are you already registered (empadronada) in any city?',
                fr: 'êtes-vous déjà inscrite (empadronada) dans une ville ?',
              }
            : {
                pt: 'me conta desde quando você chegou.',
                es: 'cuéntame desde cuándo llegaste.',
                en: 'tell me since when you arrived.',
                fr: 'dites-moi depuis quand vous êtes arrivée.',
              }
          const header = {
            pt: '## LOCALIZAÇÃO AUTO-DETECTADA',
            es: '## LOCALIZACIÓN AUTO-DETECTADA',
            en: '## AUTO-DETECTED LOCATION',
            fr: '## LOCALISATION AUTO-DÉTECTÉE',
          }
          const rule = {
            pt: `A cliente mencionou espontaneamente que JÁ ESTÁ ${place.pt.toUpperCase()}. NÃO pergunte de novo se ela está na Espanha${city ? ' nem em que cidade mora' : ''}${hasEntryDate ? ' nem quando chegou (já sabemos)' : ''}. Confirme de leve NA MESMA frase e já emende a próxima pergunta. Ex.: "Perfeito, então você já está ${place.pt}, certo? ${nextAsk.pt.charAt(0).toUpperCase() + nextAsk.pt.slice(1)}"`,
            es: `La clienta mencionó espontáneamente que YA ESTÁ ${place.es.toUpperCase()}. NO vuelvas a preguntar si está en España${city ? ' ni en qué ciudad vive' : ''}${hasEntryDate ? ' ni cuándo llegó (ya lo sabemos)' : ''}. Confirma de forma suave EN LA MISMA frase y enlaza la siguiente pregunta. Ej.: "Perfecto, entonces ya estás ${place.es}, ¿verdad? ${nextAsk.es.charAt(0).toUpperCase() + nextAsk.es.slice(1)}"`,
            en: `The client spontaneously mentioned she is ALREADY ${place.en.toUpperCase()}. Do NOT ask again if she is in Spain${city ? ' or in which city she lives' : ''}${hasEntryDate ? ' or when she arrived (we already know)' : ''}. Softly confirm IN THE SAME sentence and chain the next question. Ex.: "Great, so you're already ${place.en}, right? ${nextAsk.en.charAt(0).toUpperCase() + nextAsk.en.slice(1)}"`,
            fr: `La cliente a mentionné spontanément qu'elle EST DÉJÀ ${place.fr.toUpperCase()}. NE redemandez PAS si elle est en Espagne${city ? ' ni dans quelle ville elle vit' : ''}${hasEntryDate ? " ni quand elle est arrivée (nous le savons déjà)" : ''}. Confirmez doucement DANS LA MÊME phrase et enchaînez la question suivante. Ex.: "Parfait, vous êtes donc déjà ${place.fr}, n'est-ce pas ? ${nextAsk.fr.charAt(0).toUpperCase() + nextAsk.fr.slice(1)}"`,
          }
          const key = (lang === 'es' || lang === 'en' || lang === 'fr') ? lang : 'pt'
          resolvedSystemPrompt += `\n\n${header[key]}\n${rule[key]}`
        }



        if (kbStrictMode) {
          if (!knowledgeContext) {
            console.log('[KB-STRICT] No KB match found — sending standard fallback message')
            try {
              const kbRes = await sendOutgoingIdempotent(supabase, {
                phone: phoneNumber, leadId: lead.id, body: kbStrictFallback, language: detectedChatLanguage,
              })
              if (kbRes.sent) {
                await supabase.from('mensagens_cliente').insert({
                  id_lead: lead.id,
                  tipo: 'TEXTO',
                  conteudo: kbStrictFallback,
                  direcao: 'SAINDO',
                  origem: 'AGENTE_IA',
                })
              } else {
                console.log('[KB-STRICT] Skipped duplicate fallback —', kbRes.reason)
              }
            } catch (e) {
              console.error('[KB-STRICT] Failed to send fallback:', e instanceof Error ? e.message : e)
            }
            await releaseConcurrentLock()
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

        // SHORT-CIRCUIT determinístico do FLUXO CANÔNICO (Msg1..Msg6):
        // Para clientes NOVOS (!isReturningClient), não confiamos no LLM para emitir
        // as bolhas canônicas — usamos as frases já traduzidas em lib/language.ts.
        // Cada gate exige que a ÚLTIMA pergunta do assistente seja a do passo anterior,
        // para não atropelar quando o cliente pergunta algo fora do roteiro.
        const tt = getPromptTemplates(detectedChatLanguage)
        const lastAsstLc = String(lastAssistantMessage || '').toLowerCase()
        const lastWasConsent = /(perguntas? r[áa]pidas?|preguntas? r[áa]pidas?|quick questions?|questions rapides)/i.test(lastAsstLc)
        const lastWasNameQ = /(nome completo|nombre completo|full name|nom complet)/i.test(lastAsstLc)
        const lastWasEmailQ = /(e[- ]?mail|correo|courriel)/i.test(lastAsstLc) && /\?/.test(lastAsstLc)
        // Robustez Msg4: aceita também o caso em que a última msg do usuário PARECE um nome
        // (mesmo que lastAssistantMessage tenha sido reescrito/perdido).
        const userJustAnsweredName = isLikelyFullNameAnswer(rawCustomerMessage || '')

        // OFF-TOPIC determinístico: se o cliente desviou do roteiro durante o cadastro,
        // resposta = ACK ("Anotado…") + reiteração da pergunta canônica corrente,
        // SEM "Obrigado.", SEM "Perfeito." e SEM passar pelo LLM.
        if (collectionGateActive && parkedThisTurn && nextStep) {
          try {
            const scriptedOT = getNextScriptedQuestion(nextStep.key as any, detectedChatLanguage, {
              userInSpain,
              userOutsideSpain,
              assistantTranscript: allAssistant,
              entryDateConfirmed: funnelStateLive.entry_date_confirmed,
              locationKnown: funnelStateLive.location_known,
              empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
              empadronadoCity: funnelStateLive.empadronado_city,
              empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
              preHandoffSent: !!funnelStateLive.pre_handoff_sent,
              handoffSent: !!funnelStateLive.handoff_sent,
              outsideProgress: (funnelStateLive.outside_spain_progress || {}) as any,
              catalogSent,
            })
            if (scriptedOT && scriptedOT.trim().length > 0) {
              const ackOT = getOffTopicAckPhrase(detectedChatLanguage)
              aiResponse = scriptedOT.includes('|||')
                ? `${ackOT}|||${scriptedOT}`
                : `${ackOT}|||${scriptedOT}`
              console.log('[OFFTOPIC_SHORTCIRCUIT] gate=' + nextStep.key + ' lang=' + detectedChatLanguage)
            }
          } catch (otErr) {
            console.warn('[OFFTOPIC_SHORTCIRCUIT] non-blocking error:', otErr instanceof Error ? otErr.message : otErr)
          }
        }

        // REASK determinístico: se o Turn Orchestrator disse `reask_current`,
        // NUNCA passamos pelo LLM. Apenas repetimos LITERALMENTE a pergunta
        // canônica da etapa atual — sem "obrigado", sem "vamos finalizar",
        // sem qualquer texto adicional. O cliente respondeu algo inválido
        // (ex.: repetiu o nome no passo do e-mail); insistimos na mesma
        // pergunta até obter resposta válida.
        if (!aiResponse && orchestratorDecision?.action.kind === 'reask_current' && nextStep) {
          try {
            const scriptedReask = getNextScriptedQuestion(nextStep.key as any, detectedChatLanguage, {
              userInSpain,
              userOutsideSpain,
              assistantTranscript: allAssistant,
              entryDateConfirmed: funnelStateLive.entry_date_confirmed,
              locationKnown: funnelStateLive.location_known,
              empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
              empadronadoCity: funnelStateLive.empadronado_city,
              empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
              preHandoffSent: !!funnelStateLive.pre_handoff_sent,
              handoffSent: !!funnelStateLive.handoff_sent,
              outsideProgress: (funnelStateLive.outside_spain_progress || {}) as any,
              catalogSent,
            })
            if (scriptedReask && scriptedReask.trim().length > 0) {
              aiResponse = scriptedReask
              console.log('[REASK_SHORTCIRCUIT] step=' + nextStep.key + ' lang=' + detectedChatLanguage + ' — repetindo pergunta canônica sem chit-chat')
            }
          } catch (rErr) {
            console.warn('[REASK_SHORTCIRCUIT] non-blocking error:', rErr instanceof Error ? rErr.message : rErr)
          }
        }


        if (aiResponse) {
          // already produced by OFFTOPIC short-circuit
        } else if (isFirstInteraction && !isReturningClient) {
          aiResponse = `${tt.openingLine1}|||${tt.openingLine2}`
          console.log('[OPENER_SHORTCIRCUIT] abertura canônica enviada em', detectedChatLanguage)
        } else if (!isReturningClient && aberturaDone && nameMissing && lastWasConsent) {
          aiResponse = tt.askName
          console.log('[CANONICAL_SHORTCIRCUIT] msg3 askName em', detectedChatLanguage)
        } else if (!isReturningClient && !nameMissing && !funnelStateLive.location_known && (lastWasNameQ || userJustAnsweredName)) {
          aiResponse = tt.askLocationSpain
          console.log('[CANONICAL_SHORTCIRCUIT] msg7 askLocationSpain (skipping email) em', detectedChatLanguage)
        } else {
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

        const outsideProgressLive = (funnelStateLive.outside_spain_progress || {}) as any
        const outsideSpainNextQuestion = getOutsideSpainNextQuestion(detectedChatLanguage, allAssistant, {
          entryDateConfirmed: funnelStateLive.entry_date_confirmed,
          locationKnown: funnelStateLive.location_known,
          outsideProgress: outsideProgressLive,
        })
        const blockFlags = {
          locationKnown: funnelStateLive.location_known,
          entryDateConfirmed: funnelStateLive.entry_date_confirmed,
          empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
          empadronadoCity: funnelStateLive.empadronado_city,
          assistantTranscript: allAssistant,
          outsideProgress: outsideProgressLive,
          nameKnown: !nameMissing,
          emailKnown: !emailMissing,
        }
        aiResponse = forceSkipFullNameIfAlreadyKnown(aiResponse, detectedChatLanguage, !nameMissing, emailMissing)
        aiResponse = forceReaskFullNameIfSingleWord(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !nameMissing)
        aiResponse = forceReaskEmailIfMissing(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, !emailMissing)
        aiResponse = forceReaskLocationSpainIfAmbiguous(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
        aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, allAssistant)
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
        // BLOCK-LOCK: impede que a IA misture perguntas dos blocos Espanha vs fora
        aiResponse = forceCorrectBlockForLocation(aiResponse, detectedChatLanguage, blockFlags)
        aiResponse = enforceBlockCompletion(aiResponse, detectedChatLanguage, blockFlags)
        // Anti-repetição da ABERTURA (Msg1 greeting + Msg2 consent + re-greeting pós-nome).
        aiResponse = stripRepeatedOpener(aiResponse, detectedChatLanguage, blockFlags)
        // Anti-repetição global: se IA repetiu pergunta canônica já feita, força próxima pendente.
        aiResponse = preventRepeatedCanonicalQuestion(aiResponse, detectedChatLanguage, blockFlags)
        // M5/M6 removidos: sem anexação de catálogo nem force-services.


        // ===== HARD-LOCK FINAL: pré-handoff determinístico =====
        // Durante o gate, substitui o texto da IA pela próxima pergunta canônica
        // do roteiro (zero invenção). Preserva reasks já travados (nome/email/Spain).
        if (collectionGateActive && nextStep && !isLocked(aiResponse)) {
          const scripted = getNextScriptedQuestion(nextStep.key as any, detectedChatLanguage, {
            userInSpain,
            userOutsideSpain,
            assistantTranscript: allAssistant,
            entryDateConfirmed: funnelStateLive.entry_date_confirmed,
            locationKnown: funnelStateLive.location_known,
            empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
            empadronadoCity: funnelStateLive.empadronado_city,
            empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
            preHandoffSent: !!funnelStateLive.pre_handoff_sent,
            handoffSent: !!funnelStateLive.handoff_sent,
            outsideProgress: outsideProgressLive,
            catalogSent,
          })
          if (scripted && scripted.trim().length > 0) {
            const ack = (nextStep.key === 'abertura' || !lastAssistantQuestion)
              ? ''
              : (parkedThisTurn
                ? getOffTopicAckPhrase(detectedChatLanguage)
                : getShortAck(detectedChatLanguage, lastAssistantQuestion, rawCustomerMessage))
            // Para etapas com múltiplas bolhas (abertura, interesse Msg5+Msg6,
            // pré-handoff H1|||H2|||H3), o ack vira a 1ª bolha; senão prefixa a única bolha.
            // composeAckPlusScripted descarta o ack quando ele duplicaria a abertura
            // curta da frase canônica (ex.: ack="Obrigado." + scripted="Obrigado. Qual...").
            const composed = composeAckPlusScripted(ack, scripted, detectedChatLanguage)
            console.log(`[GATE-HARD-LOCK] step=${nextStep.key} replacing AI output with canonical script (len=${composed.length})`)
            aiResponse = lock(composed)
          }
        }

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
            aiResponse = forceCorrectBlockForLocation(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = enforceBlockCompletion(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = stripRepeatedOpener(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = preventRepeatedCanonicalQuestion(aiResponse, detectedChatLanguage, blockFlags)
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
            aiResponse = forceReaskLocationSpainIfAmbiguous(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
            aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, allAssistant)
            aiResponse = forceAdvanceFromEntryDateQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage, outsideSpainNextQuestion)
            aiResponse = forceAdvanceFromEmpadronadoQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
            aiResponse = lockConfirmedFieldsInResponse(aiResponse, detectedChatLanguage, { nameKnown: !nameMissing, emailKnown: !emailMissing, interestKnown: !serviceMissing, locationKnown: !!funnelStateLive.location_known })
            aiResponse = sanitizeLocationQuestion(aiResponse, detectedChatLanguage)
            aiResponse = forceCorrectBlockForLocation(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = enforceBlockCompletion(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = stripRepeatedOpener(aiResponse, detectedChatLanguage, blockFlags)
            aiResponse = preventRepeatedCanonicalQuestion(aiResponse, detectedChatLanguage, blockFlags)
            // M5/M6 removidos: sem force-services aqui.

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
            const candidate = String(leadInterest?.service_interest || '').trim()
            if (candidate && !['SEM_SERVICO', 'OUTRO'].includes(candidate.toUpperCase())) {
              patch.interest_confirmed = candidate
            }
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
          // Honra o sentinel anti-clobber: se a resposta foi travada por uma
          // validação determinística (ex.: cidade espanhola inválida), não retoca.
          try {
            if (isLocked(aiResponse)) throw new Error('locked: skip F4')
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
            // Remove sentinel anti-clobber antes de enviar (não deve aparecer ao cliente)
            let aiResponseClean = stripLockedSentinel(aiResponse)
            // BPMN-v2 defesa: remove qualquer preâmbulo inventado pelo LLM antes do H1.
            aiResponseClean = stripPreambleBeforePreHandoff(aiResponseClean)
            // BPMN-v2: após pre_handoff_sent=true, descarta reemissões de H1/H2/H3.
            aiResponseClean = stripRepeatedPreHandoff(aiResponseClean, detectedChatLanguage, {
              preHandoffSent: !!funnelStateLive.pre_handoff_sent,
            })
            // Padroniza texto do pré-handoff: substitui paráfrases do LLM pelo literal
            // canônico (H1/H2/H3) em PT/ES/EN/FR — sempre que aplicável.
            aiResponseClean = enforceCanonicalPreHandoff(aiResponseClean, detectedChatLanguage, {
              preHandoffSent: !!funnelStateLive.pre_handoff_sent,
              handoffSent: !!funnelStateLive.handoff_sent,
            })
            aiResponseClean = stripLockedSentinel(aiResponseClean)

            // Safety net final: purga perguntas cross-branch (INSIDE ↔ OUTSIDE)
            // que escaparam a forceCorrectBlockForLocation/enforceBlockCompletion.
            // Se a resposta ficar sem pergunta, é preferível não enviar nada.
            try {
              const scrubbed = stripCrossBranchQuestion(aiResponseClean, funnelStateLive.location_known)
              if (scrubbed !== aiResponseClean) {
                // Se a limpeza removeu TUDO ou deixou só ack sem pergunta,
                // cai para a próxima pergunta canônica do ramo correto.
                if (!scrubbed || scrubbed.length < 12 || !/\?/.test(scrubbed)) {
                  if (funnelStateLive.location_known === 'outside') {
                    const canonical = getOutsideSpainNextQuestion(detectedChatLanguage, allAssistant, {
                      entryDateConfirmed: funnelStateLive.entry_date_confirmed,
                      locationKnown: funnelStateLive.location_known,
                      outsideProgress: (funnelStateLive.outside_spain_progress || {}) as any,
                    })
                    aiResponseClean = canonical || scrubbed
                  } else {
                    aiResponseClean = scrubbed
                  }
                } else {
                  aiResponseClean = scrubbed
                }
              }
            } catch (scrubErr) {
              console.warn('[CROSS_BRANCH_SCRUB] non-blocking error:', scrubErr instanceof Error ? scrubErr.message : scrubErr)
            }

            // Hard dedup: descarta blocos canônicos (catálogo, pergunta de
            // interesse) e parágrafos quase-literais já enviados antes.
            try {
              const recentAssistant = history.filter((m) => m.role === 'assistant').slice(-3).map((m) => String(m.content || ''))
              aiResponseClean = stripAlreadySentCanonicalBlocks(
                aiResponseClean,
                allAssistant,
                detectedChatLanguage,
                {
                  nameKnown: !nameMissing,
                  emailKnown: !emailMissing,
                  interestKnown: !serviceMissing,
                  locationKnown: !!funnelStateLive.location_known,
                },
                recentAssistant,
              )
            } catch (dedupErr) {
              console.warn('[DEDUP] non-blocking error:', dedupErr instanceof Error ? dedupErr.message : dedupErr)
            }

            // Dedup de opener entre bolhas (evita "Perfecto.|||Perfecto. ...")
            try {
              aiResponseClean = dedupOpenerAcrossBubbles(aiResponseClean)
            } catch (opErr) {
              console.warn('[OPENER_DEDUP] non-blocking error:', opErr instanceof Error ? opErr.message : opErr)
            }

            // GUARD ABERTURA: se a abertura ainda não foi concluída e a resposta
            // contém apenas a Msg1 (saudação) sem a Msg2 (pergunta de consentimento),
            // anexa Msg2 canônica no idioma travado. Cobre o caso do LLM que emite
            // só metade da abertura (bug PT observado).
            try {
              if (!aberturaDone) {
                const tt2 = getPromptTemplates(detectedChatLanguage)
                const greetingRe = /(obrigad[oa] por (falar|escrever|entrar)|gracias por (hablar|escribir|contact)|thank(s)? you for (reaching|contacting|writing)|merci de (nous|m['’]avoir) contact)/i
                const consentRe = /(perguntas? r[áa]pidas?|preguntas? r[áa]pidas?|quick questions?|questions rapides)/i
                if (greetingRe.test(aiResponseClean) && !consentRe.test(aiResponseClean)) {
                  aiResponseClean = `${aiResponseClean.trim()}|||${tt2.openingLine2}`
                  console.log('[OPENER_GUARD] Msg2 anexada (faltava pergunta de consentimento)')
                }
              }
            } catch (guardErr) {
              console.warn('[OPENER_GUARD] non-blocking error:', guardErr instanceof Error ? guardErr.message : guardErr)
            }

            // Rede de segurança: força o preâmbulo de retomada no idioma travado
            try {
              aiResponseClean = enforceReplayPreambleLanguage(aiResponseClean, detectedChatLanguage)
            } catch (langErr) {
              console.warn('[REPLAY_PREAMBLE_LANG] non-blocking error:', langErr instanceof Error ? langErr.message : langErr)
            }

            // HARD-LOCK localização: se já sabemos onde o cliente está, nunca re-perguntar.
            try {
              aiResponseClean = blockLocationReaskIfKnown(aiResponseClean, detectedChatLanguage, {
                locationKnown: funnelStateLive.location_known,
                entryDateConfirmed: funnelStateLive.entry_date_confirmed,
                empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
                empadronadoCity: funnelStateLive.empadronado_city,
                empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
                assistantTranscript: allAssistant,
                outsideProgress: outsideProgressLive,
                preHandoffSent: !!funnelStateLive.pre_handoff_sent,
                handoffSent: !!funnelStateLive.handoff_sent,
              })
              aiResponseClean = stripLockedSentinel(aiResponseClean)
            } catch (locErr) {
              console.warn('[LOCATION_LOCK] non-blocking error:', locErr instanceof Error ? locErr.message : locErr)
            }

            // Enforçador final de idioma das perguntas canônicas (corrige PT→ES leak)
            try {
              aiResponseClean = enforceCanonicalLanguage(aiResponseClean, detectedChatLanguage)
            } catch (langErr) {
              console.warn('[CANONICAL_LANG] non-blocking error:', langErr instanceof Error ? langErr.message : langErr)
            }


            // BPMN-3 MODO PÓS-HANDOFF: se H1-H3 já foram enviados, anexa o sufixo
            // localizado de "aguarde um especialista" ao final da resposta (uma única bolha).
            const wasHandoffSentBefore = !!funnelStateLive.handoff_sent
            if (wasHandoffSentBefore) {
              const suffix = getPostHandoffWaitSuffix(detectedChatLanguage)
              // não duplica se a IA por engano colocou parte do sufixo OU se o
              // corpo já contém a frase curta de "aguarde um especialista" (sufixo pós-handoff ou
              // template equivalente em qualquer um dos 4 idiomas suportados).
              const lower = aiResponseClean.toLowerCase()
              const sigPT = 'em breve um de nossos especialistas'
              const sigES = 'en breve uno de nuestros especialistas'
              const sigEN = 'one of our specialists'
              const sigFR = 'un de nos spécialistes'
              const waitShortRe = /(aguarde um especialista|aguarda un especialista|espera a un especialista|wait for a specialist|please wait for a specialist|attendez un sp[ée]cialiste|patientez.{0,20}sp[ée]cialiste)/i
              const alreadyHasSuffix =
                lower.includes(sigPT) || lower.includes(sigES) || lower.includes(sigEN) || lower.includes(sigFR) ||
                waitShortRe.test(aiResponseClean)
              if (!alreadyHasSuffix) {
                aiResponseClean = `${aiResponseClean.trim()}\n\n${suffix}`
              }
            }

            // ÚLTIMA camada: colapsa aberturas curtas duplicadas ("Obrigado. Obrigado.",
            // "Perfeito. Perfeito.", "Gracias. Gracias.", etc.) — rede de segurança final.
            try {
              const before = aiResponseClean
              aiResponseClean = stripDuplicateShortOpeners(aiResponseClean, detectedChatLanguage)
              if (before !== aiResponseClean) {
                console.log('[STRIP_DUP_OPENERS] collapsed duplicate short opener(s)')
              }
            } catch (dupErr) {
              console.warn('[STRIP_DUP_OPENERS] non-blocking error:', dupErr instanceof Error ? dupErr.message : dupErr)
            }

            // GUARD anti re-ask universal: remove qualquer bolha que peça novamente
            // um campo já capturado no pré-handoff (nome, e-mail, interesse, localização,
            // data de entrada, cidade de empadronamiento, idade).
            try {
              const capturedSnap: CapturedSnapshot = {
                fullName: !nameMissing,
                email: !emailMissing,
                phone: true, // WhatsApp sempre tem telefone
                interest: !serviceMissing,
                locationSpain: !!funnelStateLive.location_known,
                entryDate: !!funnelStateLive.entry_date_confirmed,
                empadronamientoCity: !!funnelStateLive.empadronado_city,
                age: !!(funnelStateLive as any).age_confirmed,
              }
              const stripped = stripReAskOfCapturedFields(aiResponseClean, capturedSnap)
              if (stripped.removed.length > 0) {
                console.log(`[GUARD] suppressed re-ask of captured field(s): ${stripped.removed.join(', ')}`)
                aiResponseClean = stripped.text
              }
            } catch (guardErr) {
              console.warn('[GUARD] reask strip non-blocking error:', guardErr instanceof Error ? guardErr.message : guardErr)
            }

            let parts = aiResponseClean.split('|||').map(p => p.trim()).filter(Boolean)

            // GUARD anti-handoff prematuro: se ainda não temos os dados mínimos,
            // removemos das partes qualquer frase de pré-handoff/handoff que o LLM
            // tenha vazado. Evita o caso em que Gemini envia "Já consigo ter uma
            // visão inicial..." na primeira interação e o funil é dado como concluído.
            if (!hasMinimumDataForHandoff) {
              const handoffAnchorRe = /(vis[ãa]o inicial do seu caso|visi[óo]n inicial de tu caso|initial view of your case|cada caso de forma individual|each case individually|caminho mais seguro|camino m[áa]s seguro|encaminhar suas informa[çc][õo]es|remitir tu informaci[óo]n|forward your information|transmettre vos informations|encaminhar (você )?para um atendente|derivar a un agente|forward you to an agent|vous transf[ée]rer [àa] un agent|à disposi[çc][ãa]o para ajudar|a disposici[óo]n para ayudar)/i
              const before = parts.length
              parts = parts
                .map(p => p
                  .split(/(?<=[.!?])\s+/)
                  .filter(s => !handoffAnchorRe.test(s))
                  .join(' ')
                  .trim()
                )
                .filter(Boolean)
              if (parts.length !== before) {
                console.warn('[GUARD] handoff_anchor_stripped — frases removidas por falta de dados mínimos. parts_before=', before, 'parts_after=', parts.length)
              }
            }

            // GUARD "uma pergunta por vez" durante APROFUNDAMENTO.
            // Durante Inside/Outside deepening o LLM deve fazer UMA pergunta por rodada
            // e aguardar a resposta. Se emitir múltiplas bolhas contendo perguntas
            // (ex.: "data de entrada?|||está empadronado?"), mantemos apenas até a
            // primeira bolha com "?" e descartamos as demais.
            try {
              if (nextStep?.key === 'aprofundamento' && parts.length > 1) {
                const hasQ = (s: string) => /[?？¿]/.test(s)
                const firstQIdx = parts.findIndex(hasQ)
                if (firstQIdx >= 0) {
                  const anyExtraQ = parts.slice(firstQIdx + 1).some(hasQ)
                  if (anyExtraQ) {
                    const kept = parts.slice(0, firstQIdx + 1)
                    console.warn('[GUARD] aprofundamento_one_question_per_turn — dropped extra question bubbles. before=', parts.length, 'after=', kept.length)
                    parts = kept
                  }
                }
              }
            } catch (oneQErr) {
              console.warn('[GUARD] one-question guard non-blocking error:', oneQErr instanceof Error ? oneQErr.message : oneQErr)
            }

            // Continuidade do pré-handoff: completa H1/H2/H3 se algum estiver faltando.
            // Só roda se já temos dados mínimos — sem isso, NÃO devemos completar handoff.
            if (hasMinimumDataForHandoff) {
              parts = ensurePreHandoffContinuity(parts, detectedChatLanguage, {
                preHandoffSent: !!funnelStateLive.pre_handoff_sent,
                handoffSent: !!funnelStateLive.handoff_sent,
              })
            }

            // ===== REDE DE SEGURANÇA: parts vazio =====
            // Se todos os chunks foram descartados (dedup, suppress, fallback empty),
            // NÃO encerramos silenciosamente. Geramos a próxima pergunta canônica do roteiro
            // com base no estado do funil para evitar travamento da conversa.
            if (parts.length === 0) {
              try {
                const fallbackScripted = nextStep ? getNextScriptedQuestion(nextStep.key as any, detectedChatLanguage, {
                  userInSpain,
                  userOutsideSpain,
                  assistantTranscript: allAssistant,
                  entryDateConfirmed: funnelStateLive.entry_date_confirmed,
                  locationKnown: funnelStateLive.location_known,
                  empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
                  empadronadoCity: funnelStateLive.empadronado_city,
                  empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
                  preHandoffSent: !!funnelStateLive.pre_handoff_sent,
                  handoffSent: !!funnelStateLive.handoff_sent,
                  outsideProgress: outsideProgressLive,
                  catalogSent,
                }) : ''
                if (fallbackScripted && fallbackScripted.trim().length > 0) {
                  parts = fallbackScripted.split('|||').map(p => p.trim()).filter(Boolean)
                  console.warn('[SAFETY_NET] parts=0 após dedup — usando próxima pergunta canônica:', nextStep?.key, '| parts=', parts.length)
                }
              } catch (sErr) {
                console.warn('[SAFETY_NET] non-blocking error:', sErr instanceof Error ? sErr.message : sErr)
              }
            }

            // ===== REDE DE SEGURANÇA 2: resposta sem ação durante o gate =====
            // Se o gate de coleta está ativo e o conteúdo é só uma transição
            // vazia (sem '?' e sem âncoras de pré-handoff/handoff), substitui
            // pela próxima pergunta canônica do roteiro. Evita o caso do print
            // em que o bot mandou "Ótimo! Vamos seguir com as perguntas rápidas..."
            // e a conversa travou esperando uma ação do usuário.
            if (parts.length > 0 && collectionGateActive && nextStep) {
              const joined = parts.join(' ')
              const hasQuestion = /\?/.test(joined)
              const hasHandoffAnchor = preHandoffSummarySent(joined) || handoffTransferSent(joined)
              if (!hasQuestion && !hasHandoffAnchor) {
                try {
                  const fallbackScripted = getNextScriptedQuestion(nextStep.key as any, detectedChatLanguage, {
                    userInSpain,
                    userOutsideSpain,
                    assistantTranscript: allAssistant,
                    entryDateConfirmed: funnelStateLive.entry_date_confirmed,
                    locationKnown: funnelStateLive.location_known,
                    empadronadoConfirmed: funnelStateLive.empadronado_confirmed,
                    empadronadoCity: funnelStateLive.empadronado_city,
                    empadronadoSinceConfirmed: (funnelStateLive as any).empadronamiento_since,
                    preHandoffSent: !!funnelStateLive.pre_handoff_sent,
                    handoffSent: !!funnelStateLive.handoff_sent,
                    outsideProgress: outsideProgressLive,
                    catalogSent,
                  })
                  if (fallbackScripted && fallbackScripted.trim().length > 0) {
                    const fallbackParts = fallbackScripted.split('|||').map(p => p.trim()).filter(Boolean)
                    // Preserva o ack curto da IA como primeira bolha (se for curto e sem pergunta)
                    const firstPart = parts[0] || ''
                    const isShortAck = firstPart.length < 80 && !/\?/.test(firstPart)
                    parts = isShortAck ? [firstPart, ...fallbackParts] : fallbackParts
                    console.warn('[SAFETY_NET_2] resposta sem ação durante gate — anexando próxima pergunta canônica:', nextStep.key, '| parts agora=', parts.length)
                  }
                } catch (sErr) {
                  console.warn('[SAFETY_NET_2] non-blocking error:', sErr instanceof Error ? sErr.message : sErr)
                }
              }
            }

            // Se ainda assim sobrou vazio, registra como AI_FAILED para o watchdog tentar recuperar.
            if (parts.length === 0) {
              console.warn('[SAFETY_NET] parts ainda vazio após fallback — registrando AI_FAILED')
              await logTurn({
                supabase,
                exit_reason: 'AI_FAILED',
                lead_id: lead.id,
                contact_id: contact.id,
                phone: phoneNumber,
                message_id: message.messageId,
                inbound_text: message.body,
                ai_error: 'empty_after_dedup_and_safety_net',
                funnel_step_before: funnelStateLive?.step ?? null,
              })
              await releaseConcurrentLock()
              return new Response(JSON.stringify({ success: true, aiResponseSent: false, reason: 'empty_after_dedup' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })

            }
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i]

              const sendRes = await sendOutgoingIdempotent(supabase, {
                phone: phoneNumber, leadId: lead.id, body: part, language: detectedChatLanguage,
              })
              if (!sendRes.sent) {
                console.log(`[SEND_DEDUP] skipped part ${i + 1}/${parts.length} —`, sendRes.reason)
              } else {
                await supabase.from('mensagens_cliente').insert({
                  id_lead: lead.id,
                  phone_id: parseInt(phoneNumber),
                  mensagem_IA: part,
                  origem: 'IA',
                })

                await supabase.from('interactions').insert({
                  lead_id: lead.id,
                  contact_id: contact.id,
                  channel: 'WHATSAPP',
                  direction: 'OUTBOUND',
                  content: part,
                  origin_bot: true,
                })
              }

              if (i < parts.length - 1) {
                await new Promise(r => setTimeout(r, 350))
              }
            }

            console.log('AI response sent and stored successfully (parts:', parts.length, ')')

            await logTurn({
              supabase,
              exit_reason: 'REPLIED',
              lead_id: lead.id,
              contact_id: contact.id,
              phone: phoneNumber,
              message_id: message.messageId,
              inbound_text: message.body,
              response_chars: parts.reduce((a: number, p: string) => a + (p?.length || 0), 0),
              funnel_step_before: funnelStateLive?.step ?? null,
              funnel_step_after: funnelStateLive?.step ?? null,
              details: { parts: parts.length },
            })

            // BPMN-3: persiste flags pre_handoff_sent / handoff_sent ao detectar H1-H2 / H3.
            // Combina o que foi enviado NESTE turno com o transcript histórico do assistente
            // — assim, se as âncoras foram emitidas em um turno anterior (quando faltava
            // dado mínimo) e o dado foi capturado agora, os flags persistem retroativamente.
            try {
              const sentJoined = parts.join('\n')
              const combinedTranscript = `${allAssistant}\n${sentJoined}`
              const anchorPreSeen = preHandoffSummarySent(combinedTranscript)
              const anchorHandSeen = handoffTransferSent(combinedTranscript)
              // (A) Persistir flags SEMPRE que as âncoras H1-H3 foram emitidas,
              // mesmo sem dados mínimos completos — evita loop de reemissão.
              // Dados faltantes são sinalizados via notificação (C).
              const newPreSent = !funnelStateLive.pre_handoff_sent && anchorPreSeen
              const newHandSent = !funnelStateLive.handoff_sent && anchorHandSeen
              if (newPreSent || newHandSent) {
                const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
                if (newPreSent) patch.pre_handoff_sent = true
                if (newHandSent) {
                  patch.handoff_sent = true
                  patch.step = 'livre'
                  patch.last_human_handoff_at = new Date().toISOString()
                }
                await supabase.from('lead_funnel_state').update(patch).eq('lead_id', lead.id)
                funnelStateLive = { ...funnelStateLive, ...patch } as typeof funnelStateLive
                console.log('[BPMN-3] flags persisted:', JSON.stringify(patch))

                // (C) Escalonamento: notificar atendimento quando handoff é emitido.
                if (newHandSent) {
                  try {
                    const dataGaps: string[] = []
                    if (!funnelStateLive.name_confirmed) dataGaps.push('nome')
                    if (!funnelStateLive.email_confirmed) dataGaps.push('e-mail')
                    if (!funnelStateLive.interest_confirmed) dataGaps.push('interesse')
                    if (!funnelStateLive.location_known) dataGaps.push('localização')
                    const gapsSuffix = dataGaps.length > 0
                      ? ` ⚠️ Dados incompletos: ${dataGaps.join(', ')}.`
                      : ''
                    const title = dataGaps.length > 0
                      ? 'Handoff WhatsApp com dados incompletos'
                      : 'Handoff WhatsApp — cliente aguardando especialista'
                    const contactName = contact?.full_name || phoneNumber
                    const notifMsg = `${contactName} concluiu o pré-atendimento e aguarda um especialista.${gapsSuffix}`

                    const recipients: string[] = []
                    if (lead.assigned_to_user_id) {
                      recipients.push(lead.assigned_to_user_id)
                    } else {
                      const { data: attRoles } = await supabase
                        .from('user_roles')
                        .select('user_id')
                        .in('role', ['ATENCAO_CLIENTE', 'ATENDENTE_WHATSAPP'])
                      for (const r of attRoles || []) {
                        if (r?.user_id && !recipients.includes(r.user_id)) recipients.push(r.user_id)
                      }
                    }
                    for (const uid of recipients) {
                      await supabase.from('notifications').insert({
                        user_id: uid,
                        title,
                        message: notifMsg,
                        type: 'whatsapp_handoff',
                      })
                    }
                    console.log(`[HANDOFF_NOTIF] enviada para ${recipients.length} destinatário(s). gaps=${dataGaps.join('|') || 'none'}`)
                  } catch (notifErr) {
                    console.warn('[HANDOFF_NOTIF] non-blocking error:', notifErr instanceof Error ? notifErr.message : notifErr)
                  }
                }
              }
            } catch (flagErr) {
              console.warn('[BPMN-3] flag persist non-blocking error:', flagErr instanceof Error ? flagErr.message : flagErr)
            }

            // Wave 9: REPLAY automático da fila de off-topics — drena assim que o
            // pré-handoff (H1+H2+H3) for emitido. Cada item vira UMA bolha extra,
            // respondida pela KB, com preâmbulo "Como prometido...". O sufixo
            // pós-handoff é anexado APENAS à última bolha do replay.
            try {
              const preNowSent = !!funnelStateLive.pre_handoff_sent
              let replayQueue = normalizeQueue((funnelStateLive as any).pending_questions || [])
              if (preNowSent && replayQueue.length > 0) {
                // Purga itens que na verdade são dados de cadastro já coletados
                // (nome, e-mail, data, cidade, yes/no, saudação, afirmação curta)
                // — não devem virar pergunta no replay.
                const collapseRepeats = (s: string) => String(s || '').replace(/([a-zA-ZáàâãéêíóôõúüñçÁÀÂÃÉÊÍÓÔÕÚÜÑÇ])\1{1,}/g, '$1')
                const GREETING_RE = /^\s*(oi+|ol[áa]+|hi+|hel+o+|hey+|hola+|buen[oa]s\s*(d[ií]as|tardes|noches)?|bom\s*dia|boa\s*(tarde|noite)|bonjour|salut|good\s*(morning|afternoon|evening))\s*[.!?]*\s*$/i
                const AFFIRM_RE = /^\s*(sim|s[íi]|yes|y|claro|correto|exato|exactly|sure|ok|okay|vale|positivo|negativo|n[ãa]o|no|nope|nunca|never|jamais|pode|pode\s+ser|podes|puede|puedes|dale|manda|vai|vamos|fala|pronto|go\s+ahead|adelante|allez(?:-?y)?)\s*[.!?]?\s*$/i
                const isCadastroData = (t: string): boolean => {
                  const s = String(t || '').trim()
                  if (!s) return true
                  if (s.length <= 4) return true // mensagens muito curtas nunca são dúvidas reais
                  const norm = collapseRepeats(s)
                  // Testa contra forma original E colapsada (cobre "hello"→"helo", "siim"→"sim")
                  if (GREETING_RE.test(s) || GREETING_RE.test(norm)) return true
                  if (AFFIRM_RE.test(s) || AFFIRM_RE.test(norm)) return true
                  if (isLikelyFullNameAnswer(s)) return true
                  if (hasValidEmail(s)) return true
                  if (isPotentialEntryDateAnswer(s)) return true
                  if (isValidSpanishCity(s)) return true
                  return false
                }
                const purgedCount = replayQueue.filter(it => isCadastroData(it.text)).length
                if (purgedCount > 0) {
                  replayQueue = replayQueue.filter(it => !isCadastroData(it.text))
                  console.log(`[REPLAY] purga ${purgedCount} item(s) que viraram dados de cadastro/saudação/afirmação`)
                  await supabase
                    .from('lead_funnel_state')
                    .update({ pending_questions: replayQueue, updated_at: new Date().toISOString() })
                    .eq('lead_id', lead.id)
                  ;(funnelStateLive as any).pending_questions = replayQueue
                }
              }
              if (preNowSent && replayQueue.length > 0) {
                // REPLAY DESATIVADO: apenas limpa a fila para não reenviar depois.
                // O especialista humano responde as dúvidas parqueadas manualmente.
                console.log(`[REPLAY] desativado — descartando ${replayQueue.length} item(ns) parqueado(s) sem responder`)
                await supabase
                  .from('lead_funnel_state')
                  .update({ pending_questions: [], updated_at: new Date().toISOString() })
                  .eq('lead_id', lead.id)
                ;(funnelStateLive as any).pending_questions = []
              }

            } catch (replayErr) {
              console.warn('[REPLAY] non-blocking error:', replayErr instanceof Error ? replayErr.message : replayErr)
            }

            // Auditoria v2-5: persiste flags A1/B1 (preâmbulos) para evitar repetição.
            try {
              const sentJoined2 = parts.join('\n')
              const op = (funnelStateLive.outside_spain_progress || {}) as any
              const a1Pat = /(seguimos pelo seu cen[áa]rio fora da espanha|seguimos por tu escenario fuera de espa[ñn]a|continue with your situation outside spain|continuons.*hors d.{1,3}espagne)/i
              const b1Pat = /(agora preciso entender sua situa[çc][ãa]o aqui|ahora necesito entender tu situaci[óo]n|now i need to understand your situation here|maintenant.*comprendre votre situation)/i
              // Opener (Msg1 greeting OU Msg2 consent) — basta um dos dois aparecer no turno enviado.
              const openerPat = /\b(obrigad[oa] por (falar|escrever|entrar|contat)|gracias por (hablar|escribir|contact)|thank(s)? you for (reaching|contacting|writing)|merci de (nous|m'avoir) contact|perguntas? r[áa]pidas?|preguntas r[áa]pidas?|quick questions?|questions rapides)/i
              const patch: Record<string, any> = {}
              if (!op.a1_scenario_sent && a1Pat.test(sentJoined2)) patch.a1_scenario_sent = true
              if (!op.b1_situation_sent && b1Pat.test(sentJoined2)) patch.b1_situation_sent = true
              if (!op.opener_sent && openerPat.test(sentJoined2)) patch.opener_sent = true
              if (Object.keys(patch).length > 0) {
                funnelStateLive = await mergeOutsideProgress(supabase, funnelStateLive, patch as any)
                console.log('[A1_B1_FLAGS] persisted:', JSON.stringify(patch))
              }
            } catch (preErr) {
              console.warn('[A1_B1_FLAGS] non-blocking error:', preErr instanceof Error ? preErr.message : preErr)
            }

            // Nota: NÃO inserimos mais marker SISTEMA de auto-pausa ao detectar handoff por padrão de texto.
            // BPMN-3 mantém a IA disponível em MODO PÓS-HANDOFF (KB + sufixo de aguardar).
            // A pausa real continua acionada quando um humano responde via UI (origem='SISTEMA').
          } catch (sendErr) {
            console.error('Failed to send AI response via Twilio:', sendErr instanceof Error ? sendErr.message : sendErr)
          }
        } else {
          console.error('Both Gemini and OpenAI failed to generate a response for lead:', lead.id)
          await logTurn({ supabase, exit_reason: 'AI_FAILED', lead_id: lead.id, contact_id: contact.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body, ai_error: 'All providers in cascade returned empty / errored', funnel_step_before: funnelStateLive?.step ?? null })
        }
      } catch (aiError) {
        console.error('AI agent error (non-blocking):', aiError instanceof Error ? aiError.message : aiError)
        await logTurn({ supabase, exit_reason: 'AI_FAILED', lead_id: lead.id, contact_id: contact.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body, ai_error: aiError instanceof Error ? aiError.message : String(aiError), funnel_step_before: funnelStateLive?.step ?? null })
        // AI errors don't block the webhook processing
      }
    } else {
      console.log(`AI agent skipped: botEnabled=${botEnabled}, hasGeminiKey=${!!geminiApiKey}, pausedByHuman=${aiPausedByHuman}, skipReactivation=${skipAIAgent}`)
      const reason: 'BOT_DISABLED' | 'PAUSED_BY_HUMAN' | 'AI_SKIPPED' = !botEnabled || !geminiApiKey ? 'BOT_DISABLED' : aiPausedByHuman ? 'PAUSED_BY_HUMAN' : 'AI_SKIPPED'
      await logTurn({ supabase, exit_reason: reason, lead_id: lead.id, contact_id: contact.id, phone: phoneNumber, message_id: message.messageId, inbound_text: message.body, details: { botEnabled, hasGeminiKey: !!geminiApiKey, pausedByHuman: aiPausedByHuman, skipReactivation: skipAIAgent } })
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

    await releaseConcurrentLock()
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
    await releaseConcurrentLock()
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
