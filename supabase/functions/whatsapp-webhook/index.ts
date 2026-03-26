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

type ChatLanguage = 'pt-BR' | 'es' | 'en' | 'fr'

function detectChatLanguage(text: string): ChatLanguage {
  const sample = text.toLowerCase().normalize('NFC')

  if (/[¿¡ñ]/.test(sample) || /\b(hola|gracias|nombre|correo|quiero|necesito|estoy|españa|puedes|puede|ayuda|como|cu[aá]l)\b/.test(sample)) {
    return 'es'
  }

  if (/[àâçéèêëîïôùûüÿœ]/.test(sample) || /\b(bonjour|merci|nom|courriel|email|besoin|aide|espagne|comment|quel)\b/.test(sample)) {
    return 'fr'
  }

  if (/\b(hello|thanks|name|email|need|help|spain|how|what|can you|please)\b/.test(sample)) {
    return 'en'
  }

  return 'pt-BR'
}

function getLanguageDirective(language: ChatLanguage): string {
  if (language === 'es') return 'RESPONDA EXCLUSIVAMENTE EM ESPANHOL. NÃO use português.'
  if (language === 'en') return 'RESPOND EXCLUSIVELY IN ENGLISH. DO NOT use Portuguese.'
  if (language === 'fr') return 'RÉPONDEZ EXCLUSIVEMENT EN FRANÇAIS. N’utilisez pas le portugais.'
  return 'RESPONDA EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL.'
}

function getTransientErrorReply(language: ChatLanguage): string {
  if (language === 'es') return 'Perdón, tuve una inestabilidad para responder ahora. ¿Puedes enviarme tu pregunta nuevamente en texto?'
  if (language === 'en') return 'Sorry, I had a temporary issue responding just now. Could you send your question again in text?'
  if (language === 'fr') return 'Désolé, j’ai eu une instabilité temporaire pour répondre. Pouvez-vous renvoyer votre question en texte ?'
  return 'Desculpe, tive uma instabilidade agora para responder. Pode me enviar novamente sua pergunta em texto?'
}

function normalizeForLanguageChecks(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksPortuguese(text: string): boolean {
  const sample = normalizeForLanguageChecks(text)
  if (!sample) return false

  const strongSignals = [
    'voce',
    'voces',
    'obrigado',
    'obrigada',
    'ola',
    'encaminhar',
    'atendente',
    'nome completo',
    'qual e',
    'seu nome',
    'posso te ajudar',
    'prazo',
    'equipe',
    'vou te',
  ]

  const weakSignals = ['por favor', 'tudo bem', 'aqui na espanha', 'me conta', 'com calma']

  const strongHits = strongSignals.filter((signal) => sample.includes(signal)).length
  if (strongHits >= 1) return true

  const weakHits = weakSignals.filter((signal) => sample.includes(signal)).length
  return weakHits >= 2
}

function getLanguageName(language: ChatLanguage): string {
  if (language === 'es') return 'espanhol'
  if (language === 'en') return 'inglês'
  if (language === 'fr') return 'francês'
  return 'português do Brasil'
}

function getMediaPlaceholder(mediaType: string, language: ChatLanguage): string {
  const mediaNames: Record<ChatLanguage, Record<string, string>> = {
    'pt-BR': { ptt: 'áudio', image: 'imagem', video: 'vídeo', document: 'documento', sticker: 'figurinha' },
    'es': { ptt: 'audio', image: 'imagen', video: 'video', document: 'documento', sticker: 'sticker' },
    'en': { ptt: 'audio', image: 'image', video: 'video', document: 'document', sticker: 'sticker' },
    'fr': { ptt: 'audio', image: 'image', video: 'vidéo', document: 'document', sticker: 'autocollant' },
  }

  const media = mediaNames[language][mediaType] || mediaType

  if (language === 'es') return `[El cliente envió un ${media}]`
  if (language === 'en') return `[Customer sent a ${media}]`
  if (language === 'fr') return `[Le client a envoyé un ${media}]`
  return `[Cliente enviou um ${media}]`
}

async function rewriteResponseToLanguage(
  text: string,
  targetLanguage: ChatLanguage,
  apiKey: string
): Promise<string> {
  if (targetLanguage === 'pt-BR') return text

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: `Reescreva EXCLUSIVAMENTE em ${getLanguageName(targetLanguage)} o texto recebido. Preserve significado, tom e estrutura. Não adicione conteúdo novo.`,
            }],
          },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { maxOutputTokens: 1000 },
        }),
      }
    )

    if (!response.ok) return text

    const data = await response.json()
    const rewritten = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return rewritten || text
  } catch {
    return text
  }
}

async function enforceResponseLanguage(
  responseText: string,
  forcedLanguage: ChatLanguage,
  apiKey: string
): Promise<string> {
  if (forcedLanguage === 'pt-BR') return responseText
  if (!looksPortuguese(responseText)) return responseText

  console.warn('Response seems to be in Portuguese while forced language is', forcedLanguage, '- applying automatic rewrite')
  const rewritten = await rewriteResponseToLanguage(responseText, forcedLanguage, apiKey)
  if (rewritten === responseText) {
    console.warn('Language rewrite returned unchanged content; keeping original response')
  }
  return rewritten
}

/** Call Google Gemini API (gemini-2.5-flash-lite) to generate an AI response */
async function generateAIResponse(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  systemPrompt: string,
  apiKey: string,
  knowledgeContext: string,
  forcedLanguage: ChatLanguage
): Promise<string> {
  let fullSystemPrompt = `${systemPrompt}\n\n## IDIOMA OBRIGATÓRIO NESTA CONVERSA\n${getLanguageDirective(forcedLanguage)}`

  if (knowledgeContext) {
    fullSystemPrompt += `\n\n--- BASE DE CONHECIMENTO ---\nAs informações abaixo são sua ÚNICA fonte de verdade. Responda EXCLUSIVAMENTE com base neste conteúdo.
Se a pergunta do cliente NÃO puder ser respondida com as informações abaixo, diga educadamente que não possui essa informação no momento e sugira que entre em contato diretamente com a equipe da CB Asesoria para mais detalhes.
NUNCA invente, suponha ou use conhecimento externo. Responda apenas o que está documentado aqui:\n\n${knowledgeContext}\n--- FIM DA BASE DE CONHECIMENTO ---`
  } else {
    fullSystemPrompt += `\n\nATENÇÃO: Não há informações na base de conhecimento no momento. Responda de forma genérica e cordial, orientando o cliente a entrar em contato com a equipe da CB Asesoria para informações detalhadas.`
  }

  const effectiveHistory = forcedLanguage === 'pt-BR'
    ? conversationHistory
    : conversationHistory.filter((msg) => msg.role === 'user' || !looksPortuguese(msg.content))

  const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  for (const msg of effectiveHistory) {
    geminiContents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })
  }

  geminiContents.push({
    role: 'user',
    parts: [{ text: currentMessage }],
  })

  console.log('Calling Gemini API with', geminiContents.length, 'messages, system prompt length:', fullSystemPrompt.length, 'forced language:', forcedLanguage)

  const MAX_RETRIES = 3
  const RETRY_DELAYS = [2000, 4000, 8000] // exponential backoff

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: fullSystemPrompt }] },
            contents: geminiContents,
            generationConfig: {
              maxOutputTokens: 1000,
            },
          }),
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Gemini API error:', response.status, errorText)

        if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt]
          console.log(`Retrying Gemini API in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw new Error(`Gemini API error: ${response.status}`)
      }

      const data = await response.json()
      const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''

      if (!result) {
        const finishReason = data?.candidates?.[0]?.finishReason || 'unknown'
        console.warn('Gemini returned empty content', { finishReason })
        return getTransientErrorReply(forcedLanguage)
      }

      console.log('Gemini response received, length:', result.length)
      return await enforceResponseLanguage(result, forcedLanguage, apiKey)
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.error('Gemini API call timed out after 45s')
        if (attempt < MAX_RETRIES - 1) {
          console.log(`Retrying after timeout (attempt ${attempt + 1}/${MAX_RETRIES})...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
          continue
        }
        throw new Error('Gemini API timeout')
      }
      throw err
    }
  }

  throw new Error('Gemini API failed after all retries')
}

/** Send WhatsApp message via Twilio Gateway */
async function sendWhatsAppMessage(
  phone: string,
  message: string,
): Promise<void> {
  const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio'
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    console.error('Twilio Gateway credentials not configured')
    throw new Error('Twilio Gateway not configured')
  }

  const TWILIO_FROM_NUMBER = 'whatsapp:+14155238886'
  console.log('Sending via Twilio Gateway:', { phone })

  const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWILIO_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: `whatsapp:+${phone}`,
      From: TWILIO_FROM_NUMBER,
      Body: message,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Twilio Gateway send error:', errorText)
    throw new Error(`Twilio API error: ${response.status}`)
  }

  console.log('Message sent successfully via Twilio')
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
        // First try UAZAPI /message/download endpoint (returns decrypted binary)
        const { data: sysConfigs } = await supabase
          .from('system_config')
          .select('key, value')
          .in('key', ['uazapi_url', 'uazapi_token'])
        
        const cfgMap: Record<string, string> = {}
        sysConfigs?.forEach((c: { key: string; value: string }) => { cfgMap[c.key] = c.value })
        const uazapiUrl = cfgMap['uazapi_url']
        const uazapiToken = cfgMap['uazapi_token']

        let mediaBuffer: ArrayBuffer | null = null
        let downloadSource = 'none'

        // Try UAZAPI download endpoint if we have messageId and credentials
        if (message.messageId && uazapiUrl && uazapiToken) {
          try {
            const downloadUrl = `${uazapiUrl.replace(/\/$/, '')}/message/download`
            console.log('Downloading media via UAZAPI:', { messageId: message.messageId, downloadUrl })
            
            const uazapiResponse = await fetch(downloadUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'token': uazapiToken,
              },
              body: JSON.stringify({ id: message.messageId }),
            })

            if (uazapiResponse.ok) {
              const contentType = uazapiResponse.headers.get('content-type') || ''
              // Some UAZAPI setups return JSON with fileURL instead of binary
              if (contentType.includes('application/json')) {
                const jsonData = await uazapiResponse.json().catch(() => null) as Record<string, unknown> | null
                console.warn('UAZAPI download returned JSON:', JSON.stringify(jsonData))

                const fileUrlFromJson =
                  (typeof jsonData?.fileURL === 'string' && jsonData.fileURL) ||
                  (typeof jsonData?.fileUrl === 'string' && jsonData.fileUrl) ||
                  (typeof jsonData?.url === 'string' && jsonData.url) ||
                  null
                const mimeFromJson = typeof jsonData?.mimetype === 'string' ? jsonData.mimetype : null

                if (fileUrlFromJson) {
                  try {
                    console.log('Downloading media from UAZAPI fileURL:', fileUrlFromJson)
                    const fileUrlResponse = await fetch(fileUrlFromJson)
                    if (fileUrlResponse.ok) {
                      mediaBuffer = await fileUrlResponse.arrayBuffer()
                      const firstBytes = new Uint8Array(mediaBuffer.slice(0, 4))
                      const isJpeg = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8
                      const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47
                      const isOgg = firstBytes[0] === 0x4F && firstBytes[1] === 0x67 && firstBytes[2] === 0x67 && firstBytes[3] === 0x53
                      const isPdf = firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && firstBytes[2] === 0x44 && firstBytes[3] === 0x46
                      const isWebp = firstBytes[0] === 0x52 && firstBytes[1] === 0x49 // RIFF

                      if (isJpeg || isPng || isOgg || isPdf || isWebp || mediaBuffer.byteLength > 1000) {
                        downloadSource = 'uazapi_fileURL'
                        mediaMimetype = mimeFromJson || fileUrlResponse.headers.get('content-type')?.split(';')[0].trim() || mediaMimetype
                        console.log('Media downloaded from UAZAPI fileURL, size:', mediaBuffer.byteLength, 'mimetype:', mediaMimetype)
                      } else {
                        console.warn('UAZAPI fileURL returned invalid/encrypted data, first bytes:', Array.from(firstBytes).map(b => b.toString(16)).join(' '))
                        mediaBuffer = null
                        storedMediaUrl = fileUrlFromJson // keep at least a clickable link
                      }
                    } else {
                      console.warn('UAZAPI fileURL download failed:', fileUrlResponse.status)
                      storedMediaUrl = fileUrlFromJson // fallback to external URL
                    }
                  } catch (fileUrlErr) {
                    console.warn('UAZAPI fileURL fetch error:', fileUrlErr instanceof Error ? fileUrlErr.message : fileUrlErr)
                    storedMediaUrl = fileUrlFromJson // fallback to external URL
                  }
                }
              } else {
                mediaBuffer = await uazapiResponse.arrayBuffer()
                // Validate it's not encrypted/invalid (check first bytes)
                const firstBytes = new Uint8Array(mediaBuffer.slice(0, 4))
                const isJpeg = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8
                const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47
                const isOgg = firstBytes[0] === 0x4F && firstBytes[1] === 0x67 && firstBytes[2] === 0x67 && firstBytes[3] === 0x53
                const isPdf = firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && firstBytes[2] === 0x44 && firstBytes[3] === 0x46
                const isWebp = firstBytes[0] === 0x52 && firstBytes[1] === 0x49 // RIFF

                if (isJpeg || isPng || isOgg || isPdf || isWebp || mediaBuffer.byteLength > 1000) {
                  downloadSource = 'uazapi'
                  // Update mimetype from response if available
                  if (contentType && !contentType.includes('octet-stream')) {
                    mediaMimetype = contentType.split(';')[0].trim()
                  }
                  console.log('Media downloaded via UAZAPI, size:', mediaBuffer.byteLength, 'mimetype:', mediaMimetype)
                } else {
                  console.warn('UAZAPI returned invalid/encrypted data, first bytes:', Array.from(firstBytes).map(b => b.toString(16)).join(' '))
                  mediaBuffer = null
                }
              }
            } else {
              console.warn('UAZAPI download failed:', uazapiResponse.status)
            }
          } catch (uazErr) {
            console.warn('UAZAPI download error:', uazErr instanceof Error ? uazErr.message : uazErr)
          }
        }

        // Fallback: try direct URL download (may return encrypted data for WhatsApp CDN)
        if (!mediaBuffer && message.mediaUrl) {
          console.log('Fallback: downloading media directly:', message.mediaUrl)
          const directResponse = await fetch(message.mediaUrl)
          if (directResponse.ok) {
            const buf = await directResponse.arrayBuffer()
            const firstBytes = new Uint8Array(buf.slice(0, 4))
            const isJpeg = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8
            const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50
            const isOgg = firstBytes[0] === 0x4F && firstBytes[1] === 0x67
            if (isJpeg || isPng || isOgg || buf.byteLength > 100000) {
              mediaBuffer = buf
              downloadSource = 'direct'
              console.log('Media downloaded directly, size:', buf.byteLength)
            } else {
              console.warn('Direct download returned encrypted/invalid data')
            }
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
        } else {
          console.warn('Could not download media from any source')
        }
      } catch (mediaErr) {
        console.error('Media download error:', mediaErr instanceof Error ? mediaErr.message : mediaErr)
      }
    }

    const phoneNumber = message.from.replace(/\D/g, '')
    console.log('Processing message from:', phoneNumber)

    // Find existing contact by phone
    let contact: { id: string; full_name: string } | null = null
    // Use .limit(1) instead of .single() to avoid error when duplicate contacts exist for same phone
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, full_name')
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
        const clientMessage = (message.body || '').trim()

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

                    // Send improved disambiguation
                    const { data: waConfig } = await supabase
                      .from('system_config')
                      .select('key, value')
                      .in('key', ['uazapi_url', 'uazapi_token'])

                    const waMap: Record<string, string> = {}
                    waConfig?.forEach((c: { key: string; value: string }) => { waMap[c.key] = c.value })

                    if (waMap['uazapi_url'] && waMap['uazapi_token']) {
                      const sectorLabels: Record<string, string> = {
                        'Financeiro': '💰 Pagamentos e cobranças',
                        'Jurídico': '⚖️ Documentos e processos legais',
                        'Técnico': '🔧 Suporte técnico e expedientes',
                        'Atenção ao Cliente': '📋 Atendimento geral',
                      }
                      const options = sectorNames.map((s, i) => `*${i + 1}.* ${sectorLabels[s] || s}`).join('\n')
                      const disambigMsg = `Olá! Você está em contato com mais de um setor da nossa equipe.\n\nPara direcionar sua mensagem corretamente, responda apenas com o *número*:\n\n${options}\n\nOu descreva brevemente sobre qual assunto deseja tratar. 😊`

                      await fetch(`${waMap['uazapi_url'].replace(/\/$/, '')}/send/text`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'token': waMap['uazapi_token'] },
                        body: JSON.stringify({ number: phoneNumber, text: disambigMsg }),
                      })

                      await supabase.from('mensagens_cliente').insert({
                        id_lead: lead.id,
                        phone_id: parseInt(phoneNumber),
                        mensagem_IA: disambigMsg,
                        origem: 'ROUTING',
                      })
                      console.log('Multichat: disambiguation message sent')
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
                message: `${contact.full_name}: ${(message.body || '').substring(0, 100)}`,
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

    // ========== SMART REACTIVATION CHECK ==========
    let skipAIAgent = false
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
            incomingMessageText: message.body || '',
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

      console.log('Buffer: no newer messages, proceeding with AI response')
    }

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

    // Check if WhatsApp bot is enabled and Gemini key is available
    const { data: botConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'whatsapp_bot_enabled',
        'whatsapp_bot_system_prompt',
        'uazapi_url',
        'uazapi_token',
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

        const currentCustomerMessage = String(message.body || '')
        const detectedChatLanguage = detectChatLanguage(currentCustomerMessage)
        console.log('Detected chat language:', detectedChatLanguage, 'message sample:', currentCustomerMessage.slice(0, 80))

        // Build system prompt with structured conversational flow
        const defaultSystemPrompt = `Você é a assistente virtual da CB Asesoría, uma empresa especializada em assessoria de imigração na Espanha.

## REGRA DE IDIOMA (PRIORIDADE MÁXIMA)
${getLanguageDirective(detectedChatLanguage)}
As frases-exemplo abaixo estão em português apenas como referência de conteúdo. Você DEVE traduzi-las para o idioma detectado do cliente e NUNCA copiar em português quando o cliente não estiver falando português.

## DIRETRIZES GERAIS
- Seja cordial, empática e profissional
- Responda SOMENTE com base nas informações da base de conhecimento fornecida
- Se a informação não estiver na base de conhecimento, diga que não possui essa informação e oriente o cliente a entrar em contato com a equipe
- Nunca invente informações legais, prazos ou valores
- Mantenha as respostas concisas para serem lidas facilmente no WhatsApp
- Use emojis com moderação para tornar a conversa amigável
- Nome do cliente: ${contact.full_name}

## FLUXO CONVERSACIONAL ESTRUTURADO
Siga este fluxo na ordem, uma etapa por vez. NÃO pule etapas. Envie as mensagens de forma natural, adaptando ligeiramente o tom conforme a conversa, mas mantendo o conteúdo e a intenção de cada etapa. TRADUZA todas as frases para o idioma do cliente.

### ETAPA 1 — ABERTURA (Confiança + Humanização)
Ao receber a primeira mensagem do cliente:
- "Olá 🙂 Tudo bem? Obrigado por falar com a CB Asesoría. Vou te ajudar a entender seus caminhos legais aqui na Espanha."
- "Vou te fazer algumas perguntas rápidas só para entender seu caso e te direcionar para o especialista certo, pode ser?"

### ETAPA 2 — COLETA DE NOME
Pergunte o nome completo:
- "Antes de tudo, como é seu nome completo?"

### ETAPA 3 — COLETA DE EMAIL
Após receber o nome, pergunte o email:
- "Obrigado. Qual é o melhor e-mail para te enviarmos orientações e acompanhar seu caso?"

### ETAPA 4 — INTERESSE (Autoridade + Redução de Ansiedade)
Após o email, pergunte sobre o interesse:
- "Me conta com calma: o que você busca hoje? Pode ser nacionalidade, residência, estudos, arraigo ou algum documento específico."
- "Trabalhamos com cidadania espanhola, nômade digital, residências, NIE, TIE, homologação de estudos, antecedentes, reagrupação e outros processos."

### ETAPA 5 — LOCALIZAÇÃO (Segmentação Natural)
- "Hoje você já está na Espanha ou ainda está em outro país?"

### ETAPA 6A — SE ESTIVER FORA DA ESPANHA
Faça as seguintes perguntas, uma por vez:
1. "Perfeito. Vou te fazer perguntas rápidas só para entender melhor seu cenário."
2. "Qual sua idade?"
3. "Você esteve na Europa nos últimos 6 meses?"
4. "Possui familiar europeu ou residente legal na Espanha?"
5. "Você trabalha remoto?"
6. "Você possui formação superior?"

### ETAPA 6B — SE JÁ ESTIVER NA ESPANHA
Faça as seguintes perguntas, uma por vez:
1. "Perfeito. Agora preciso entender como está sua situação aqui."
2. "Qual foi a data exata da sua entrada na Espanha?"
3. "Você está empadronado?"
4. "Se sim, desde quando?"
5. "Em qual cidade você está empadronado?"

### ETAPA 7 — PRÉ-HANDOFF (Valor + Segurança + Autoridade)
Após coletar todas as informações:
- "Perfeito. Já consigo ter uma visão inicial do seu caso."
- "Na CB analisamos cada caso de forma individual, sempre buscando o caminho mais seguro e dentro da lei."

### ETAPA 8 — HANDOFF HUMANIZADO (Continuidade + Expectativa Positiva)
- "Vou encaminhar suas informações para um especialista analisar com mais profundidade."
- "Estou à disposição para ajudar se precisa! Vou te encaminhar para um atendente."

## REGRAS IMPORTANTES DO FLUXO
1. Faça UMA pergunta por vez. Espere a resposta do cliente antes de avançar.
2. Quando o cliente responder com nome, email ou informações solicitadas, confirme brevemente e passe para a próxima etapa.
3. Se o cliente fizer uma pergunta fora do fluxo, responda brevemente usando a base de conhecimento e retome o fluxo.
4. Se o cliente já forneceu alguma informação anteriormente (ex: nome no perfil do WhatsApp), reconheça e pule essa etapa.
5. Nas etapas 6A e 6B, faça as perguntas uma de cada vez, NÃO todas juntas.
6. Após completar a etapa 8 (Handoff), NÃO continue respondendo. O atendente humano assumirá.`

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
Esta é a PRIMEIRA mensagem deste cliente. Comece obrigatoriamente pela ETAPA 1 (Abertura).
NÃO responda a pergunta do cliente ainda. Primeiro faça o acolhimento e inicie o fluxo.
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

        // ========== CONSOLIDATE BUFFERED MESSAGES ==========
        // Collect all unanswered client messages (no AI response yet) for this lead
        const { data: unansweredMsgs } = await supabase
          .from('mensagens_cliente')
          .select('mensagem_cliente, media_type')
          .eq('id_lead', lead.id)
          .not('mensagem_cliente', 'is', null)
          .is('mensagem_IA', null)
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
          messageForAI = message.body || (mediaType ? getMediaPlaceholder(mediaType, detectedChatLanguage) : '')
        }
        
        // Get conversation history and knowledge base context
        const [history, knowledgeContext] = await Promise.all([
          getConversationHistory(supabase, lead.id),
          messageForAI ? getKnowledgeBaseContext(supabase, messageForAI) : Promise.resolve(''),
        ])

        console.log(`Knowledge base context: ${knowledgeContext.length} chars, consolidated message length: ${messageForAI.length}`)

        // Generate AI response
        const aiResponse = await generateAIResponse(
          history,
          messageForAI,
          systemPrompt.replace('{nome}', contact.full_name),
          geminiApiKey,
          knowledgeContext,
          detectedChatLanguage
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
      console.log(`AI agent skipped: botEnabled=${botEnabled}, hasGeminiKey=${!!geminiApiKey}, pausedByHuman=${aiPausedByHuman}, skipReactivation=${skipAIAgent}`)
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
})
