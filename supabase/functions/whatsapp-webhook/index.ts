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
  limit = 20
): Promise<Array<{ role: string; content: string }>> {
  // Fetch the N MOST RECENT messages (descending), then reverse to chronological order
  const { data: recentMessages } = await supabase
    .from('mensagens_cliente')
    .select('mensagem_cliente, mensagem_IA, origem, created_at')
    .eq('id_lead', leadId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!recentMessages?.length) return []

  const messages = [...recentMessages].reverse()

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

const SEARCH_STOPWORDS = new Set([
  'ok', 'pdf', 'para', 'por', 'com', 'sem', 'uma', 'das', 'dos', 'de', 'da', 'do', 'del', 'el', 'la',
  'desde', 'pais', 'origem', 'mais', 'menos', 'ano', 'anos', 'todas', 'todo', 'toda', 'sobre',
  'queria', 'quero', 'gostaria', 'saber', 'como', 'dar', 'entrada', 'informacao', 'informacoes',
])

function meaningfulSearchTokens(text: string): string[] {
  return normalizeForSearch(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SEARCH_STOPWORDS.has(token))
}

function compactSearchText(text: string): string {
  return meaningfulSearchTokens(text).join(' ')
}

function scoreTopicFileName(fileName: string, hintOrConversation: string): number {
  const fileTokens = meaningfulSearchTokens(fileName)
  if (!fileTokens.length) return 0

  const normalizedTarget = normalizeForSearch(hintOrConversation)
  const compactTarget = compactSearchText(hintOrConversation)
  const compactFile = fileTokens.join(' ')
  const hits = fileTokens.filter((token) => normalizedTarget.includes(token)).length
  if (hits === 0) return 0

  const phraseBonus = compactTarget.includes(compactFile) ? 10 : compactTarget.includes(fileTokens.filter((token) => normalizedTarget.includes(token)).join(' ')) ? 4 : 0
  const coverage = hits / fileTokens.length
  const extraPenalty = Math.max(0, fileTokens.length - hits) * 0.2
  return hits + phraseBonus + coverage - extraPenalty
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((part: any) => part?.text || '').join('').trim()
}

async function detectKnowledgeTopicHint(
  supabase: ReturnType<typeof createClient>,
  conversationText: string,
): Promise<string> {
  if (!conversationText.trim()) return ''

  const { data: rows, error } = await supabase
    .from('knowledge_base')
    .select('file_name')
    .eq('is_active', true)

  if (error || !rows?.length) return ''

  const uniqueFileNames = Array.from(new Set(rows.map((row: any) => row.file_name).filter(Boolean)))
  const ranked = uniqueFileNames
    .map((fileName) => ({ fileName, score: scoreTopicFileName(fileName, conversationText) }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || meaningfulSearchTokens(a.fileName).length - meaningfulSearchTokens(b.fileName).length)

  if (ranked[0]) {
    console.log(`[KB] Detected topic from conversation: ${ranked[0].fileName} (${ranked[0].score.toFixed(2)})`)
    return ranked[0].fileName
  }

  return ''
}

/** Generate an OpenAI embedding for a query (text-embedding-3-small, 1536 dim) */
async function generateQueryEmbedding(
  supabase: ReturnType<typeof createClient>,
  query: string,
): Promise<number[] | null> {
  let apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    const { data: configKey } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'openai_api_key')
      .single()
    apiKey = configKey?.value || null
  }
  if (!apiKey) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query.slice(0, 4000),
      }),
    })
    if (!res.ok) {
      console.error('Query embedding failed:', res.status, await res.text())
      return null
    }
    const data = await res.json()
    return data?.data?.[0]?.embedding ?? null
  } catch (err) {
    console.error('Query embedding error:', err)
    return null
  }
}

/** Retrieve relevant knowledge base content for the AI context (semantic + lexical fallback) */
async function getKnowledgeBaseContext(
  supabase: ReturnType<typeof createClient>,
  userMessage: string,
  topicHint?: string,
): Promise<string> {
  const normalizedHint = topicHint ? normalizeForSearch(topicHint) : ''
  // Preload topic-matched chunks (used as a *boost*, not as a hard lock — the agent
  // must still be able to answer about other services if the question shifts).
  let topicPreloaded: Array<{ content: string; file_name: string; chunk_index: number }> = []
  if (normalizedHint) {
    const { data: topicEntries } = await supabase
      .from('knowledge_base')
      .select('content, file_name, chunk_index')
      .eq('is_active', true)
      .order('file_name')
      .order('chunk_index')

    const validTopicEntries = (topicEntries || []).filter((entry) => !isInvalidKnowledgeChunk(entry.content))
    const bestTopic = Array.from(new Set(validTopicEntries.map((entry) => entry.file_name).filter(Boolean)))
      .map((fileName) => ({ fileName, score: scoreTopicFileName(fileName, topicHint || '') }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score || meaningfulSearchTokens(a.fileName).length - meaningfulSearchTokens(b.fileName).length)[0]

    if (bestTopic) {
      topicPreloaded = validTopicEntries.filter((entry) => entry.file_name === bestTopic.fileName).slice(0, 6)
      console.log(`[KB] Topic preload ${bestTopic.fileName} (${bestTopic.score.toFixed(2)}): ${topicPreloaded.length} chunks (will be merged with semantic)`)
    }
  }

  // 1) Try semantic search first
  const queryEmbedding = await generateQueryEmbedding(supabase, userMessage)
  if (queryEmbedding) {
    const { data: semanticMatches, error: semErr } = await supabase.rpc('match_knowledge_base', {
      query_embedding: queryEmbedding as unknown as string,
      match_count: 8,
      similarity_threshold: 0.3,
    })
    if (!semErr && Array.isArray(semanticMatches) && semanticMatches.length > 0) {
      let valid = semanticMatches.filter((entry: any) => !isInvalidKnowledgeChunk(entry.content))
      if (valid.length > 0) {
        // Boost chunks whose file_name matches the topic hint (e.g. "Residencia para Practicas")
        if (normalizedHint) {
          const hintTokens = normalizedHint.split(/\s+/).filter((w) => w.length > 3)
          valid = valid
            .map((chunk: any) => {
              const fname = normalizeForSearch(chunk.file_name || '')
              const hits = hintTokens.reduce((acc, t) => acc + (fname.includes(t) ? 1 : 0), 0)
              const boost = hits >= 2 ? 0.25 : hits === 1 ? 0.1 : 0
              return { ...chunk, similarity: (chunk.similarity || 0) + boost, _boost: boost }
            })
            .sort((a: any, b: any) => b.similarity - a.similarity)
        }
        const top3 = valid.slice(0, 3).map((c: any) => `${c.file_name}#${c.chunk_index}=${c.similarity?.toFixed(3)}${c._boost ? `(+${c._boost})` : ''}`).join(' | ')
        console.log(`[KB] Semantic returned ${valid.length} chunks. Top3: ${top3}`)
        // Put topic-preloaded chunks first so the canonical service document cannot be
        // truncated behind generic/semantic matches (e.g. "nacionalidade espanhola").
        const seen = new Set(topicPreloaded.map((c) => `${c.file_name}#${c.chunk_index}`))
        const semanticRest = valid.filter((c: any) => !seen.has(`${c.file_name}#${c.chunk_index}`))
        const merged = [
          ...topicPreloaded.map((c) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Tópico]\n${c.content}`),
          ...semanticRest.map((c: any) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Sim: ${c.similarity?.toFixed(2)}]\n${c.content}`),
        ]
        return merged.join('\n\n').substring(0, 9000)
      }
    }
    if (semErr) console.error('[KB] Semantic search error:', semErr)
  }

  // 2) Fallback to lexical keyword search (covers chunks without embeddings)
  console.log('[KB] Falling back to lexical search')
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
  const seen = new Set(topicPreloaded.map((c) => `${c.file_name}#${c.chunk_index}`))
  const lexicalRest = selected.filter((c) => !seen.has(`${c.file_name}#${c.chunk_index}`))

  return [
    ...topicPreloaded.map((c) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Tópico]\n${c.content}`),
    ...lexicalRest.map((c) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index}]\n${c.content}`),
  ].join('\n\n').substring(0, 9000)
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

  // Strong Spanish signals (must run BEFORE Portuguese to avoid false positives like
  // "española" matching \bola\b because ñ is not a JS word-character).
  if (/[¿¡ñ]/.test(sample) || /\b(hola|gracias|nombre|correo|quiero|necesito|estoy|espa[nñ]ola?|puedes|puede|ayuda|cu[aá]l|gustar[ií]a|me gusta|en mi|mi nacionalidad|por favor)\b/u.test(sample)) {
    return 'es'
  }

  // Strong Portuguese signal — uses 'u' flag so ñ is treated as a word char and
  // doesn't create false word boundaries inside Spanish words.
  if (/\b(ol[aá]|oi|obrigad[oa]|voc[eê]|n[aã]o|sim|meu|minha|nome|email|telefone|cpf|cnpj|whatsapp|preciso|quero|estou|tudo bem|bom dia|boa tarde|boa noite|valeu|brasil|portugu[eê]s|espanha)\b/u.test(sample) || /[ãõ]/.test(sample)) {
    return 'pt-BR'
  }

  // French requires explicit French words — accents alone are too ambiguous (PT/ES also use them)
  if (/\b(bonjour|bonsoir|salut|merci|s'il vous pla[iî]t|courriel|besoin|aide|espagne|comment|quel|quelle|oui|non|je suis|j'ai|monsieur|madame)\b/.test(sample)) {
    return 'fr'
  }

  if (/\b(hello|hi|thanks|thank you|name|email|need|help|spain|how|what|can you|please|good morning|good evening)\b/.test(sample)) {
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

function extractLastQuestion(text: string): string {
  const matches = text.match(/[^?\n]*\?/g)
  return matches?.map((item) => item.trim()).filter(Boolean).at(-1) || ''
}

function extractTextBeforeLastQuestion(text: string): string {
  const lastQuestion = extractLastQuestion(text)
  if (!lastQuestion) return text.trim()

  const questionIndex = text.lastIndexOf(lastQuestion)
  if (questionIndex === -1) return text.trim()

  return text.slice(0, questionIndex).trim()
}

function removeRepeatedQuestionIntro(
  previousAssistantMessage: string,
  aiResponse: string,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!previousQuestion || !nextQuestion || areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    return aiResponse
  }

  const previousIntro = extractTextBeforeLastQuestion(previousAssistantMessage)
  const nextIntro = extractTextBeforeLastQuestion(aiResponse)

  if (!previousIntro || !nextIntro) return aiResponse

  if (!areQuestionsEquivalent(previousIntro, nextIntro)) return aiResponse

  return aiResponse.slice(aiResponse.lastIndexOf(nextQuestion)).trim()
}

function isStructuredQuestionAnswer(text: string): boolean {
  const sample = normalizeForLanguageChecks(text)
  if (!sample || sample.length > 40) return false

  const raw = text.trim()
  const isDateLike = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})$/.test(raw)
  const isNumericLike = /^\d{1,4}$/.test(sample)
  const isShortFreeText = sample.length <= 20 && !sample.includes('?')

  return isDateLike || isNumericLike || [
    'sim', 'si', 's', 'yes', 'yep', 'ok', 'okay', 'claro', 'correto', 'isso', 'perfeito',
    'nao', 'não', 'no', 'not', 'talvez', 'acho que sim', 'acho que nao', 'acho que não',
  ].includes(sample) || isShortFreeText
}

function isQuestionAboutSpainEntryDate(question: string): boolean {
  const normalized = normalizeForLanguageChecks(question)
  return normalized.includes('data exata da sua entrada na espanha')
    || normalized.includes('entrada na espanha')
    || normalized.includes('fecha exacta de tu entrada a espana')
    || normalized.includes('date of your entry into spain')
    || normalized.includes('date exacte de votre entree en espagne')
}

function isPotentialEntryDateAnswer(text: string): boolean {
  const raw = text.trim()
  const normalized = normalizeForLanguageChecks(text)

  if (!raw || normalized.includes('?')) return false

  const hasSingleDate = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/.test(raw)
  const hasDateRange = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}).{0,20}(ate|até|a|to|-).{0,20}(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/i.test(raw)
  const hasMonthName = /\b(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\b/.test(normalized)
  const hasMonthYear = /\b\d{4}\b/.test(normalized) && hasMonthName

  return hasDateRange || hasSingleDate || hasMonthYear || hasMonthName
}

function isQuestionAboutInterest(question: string): boolean {
  const normalized = normalizeForLanguageChecks(question)
  return normalized.includes('o que voce busca hoje')
    || normalized.includes('que voce busca hoje')
    || normalized.includes('que busca hoy')
    || normalized.includes('what are you looking for today')
    || normalized.includes('ce que vous recherchez aujourd hui')
}

function isPotentialInterestAnswer(text: string): boolean {
  const normalized = normalizeForLanguageChecks(text)

  if (!normalized || normalized.includes('?')) return false
  if (normalized.length < 4) return false

  const interestKeywords = [
    'resid', 'residir', 'morar', 'viver', 'espanha', 'espanha', 'nacional', 'cidad', 'arraigo',
    'document', 'nie', 'tie', 'estudo', 'estudar', 'homologa', 'antecedente', 'reagrupa',
    'trabalh', 'trabalho', 'family', 'famil', 'mae', 'madre', 'mãe', 'visa', 'visto',
  ]

  return normalized.split(' ').length >= 1
    && interestKeywords.some((keyword) => normalized.includes(keyword))
}

function getLocationQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿Hoy ya estás en España o todavía estás en otro país?'
  if (language === 'en') return 'Perfect. Are you already in Spain today, or are you still in another country?'
  if (language === 'fr') return 'Parfait. Êtes-vous déjà en Espagne aujourd’hui ou êtes-vous encore dans un autre pays ?'
  return 'Perfeito. Hoje você já está na Espanha ou ainda está em outro país?'
}

function getEmpadronadoQuestion(language: ChatLanguage): string {
  if (language === 'es') return 'Perfecto. ¿Estás empadronado?'
  if (language === 'en') return 'Got it. Are you registered at the town hall (empadronado)?'
  if (language === 'fr') return 'D’accord. Êtes-vous empadronado ?'
  return 'Perfeito. Você está empadronado?'
}

function forceAdvanceFromEntryDateQuestion(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!isQuestionAboutSpainEntryDate(previousQuestion) || !isPotentialEntryDateAnswer(currentMessage)) {
    return aiResponse
  }

  if (nextQuestion && areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    return getEmpadronadoQuestion(language)
  }

  return aiResponse
}

function forceAdvanceFromInterestQuestion(
  previousAssistantMessage: string,
  currentMessage: string,
  aiResponse: string,
  language: ChatLanguage,
): string {
  const previousQuestion = extractLastQuestion(previousAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!isQuestionAboutInterest(previousQuestion) || !isPotentialInterestAnswer(currentMessage)) {
    return aiResponse
  }

  if (nextQuestion && areQuestionsEquivalent(previousQuestion, nextQuestion)) {
    return getLocationQuestion(language)
  }

  return aiResponse
}

function areQuestionsEquivalent(first: string, second: string): boolean {
  const normalizedFirst = normalizeForLanguageChecks(first)
  const normalizedSecond = normalizeForLanguageChecks(second)

  if (!normalizedFirst || !normalizedSecond) return false

  return normalizedFirst === normalizedSecond
    || normalizedFirst.includes(normalizedSecond)
    || normalizedSecond.includes(normalizedFirst)
}

function isLikelyQuestionLoop(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  aiResponse: string,
): boolean {
  const lastAssistantMessage = [...conversationHistory].reverse().find((msg) => msg.role === 'assistant')?.content || ''
  const previousQuestion = extractLastQuestion(lastAssistantMessage)
  const nextQuestion = extractLastQuestion(aiResponse)

  if (!previousQuestion || !nextQuestion) return false

  const isValidAnswer = isStructuredQuestionAnswer(currentMessage)
    || (isQuestionAboutInterest(previousQuestion) && isPotentialInterestAnswer(currentMessage))
    || (isQuestionAboutSpainEntryDate(previousQuestion) && isPotentialEntryDateAnswer(currentMessage))

  if (!isValidAnswer) return false

  return areQuestionsEquivalent(previousQuestion, nextQuestion)
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
    const rewritten = extractGeminiText(data)
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

  // CRÍTICO: regras anti-repetição posicionadas no FINAL do prompt para máximo peso no modelo
  fullSystemPrompt += `\n\n## ⛔ REGRAS FINAIS INVIOLÁVEIS (LEIA ANTES DE RESPONDER)
1. Olhe o histórico acima. Se você JÁ se apresentou em qualquer mensagem anterior (qualquer "Hola", "Olá", "Soy la asistente", "Sou a assistente"), está PROIBIDA de se apresentar de novo. Vá direto ao ponto.
2. Se você JÁ disse "Te ayudaré a entender tus caminos legales" ou "Te ajudarei a entender" antes, está PROIBIDA de repetir. Apenas continue de onde parou.
3. Se o cliente acabou de te dar uma informação (nome, e-mail, origem, interesse), reconheça com UMA palavra curta ("¡Perfecto!", "Anotado", "Genial") e faça a PRÓXIMA pergunta do fluxo. NUNCA refaça o acolhimento.
4. NÃO comece a resposta com saudação se já houve mensagens anteriores. Comece direto com o conteúdo.
5. Cada resposta deve AVANÇAR a conversa. Nunca volte uma etapa.
6. Releia as últimas 3 mensagens do histórico antes de escrever. Se sua próxima resposta soa parecida com algo que você já disse, REESCREVA de outro jeito.`

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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
      const result = extractGeminiText(data)

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

/** Fallback: Call OpenAI API when Gemini fails */
async function generateAIResponseOpenAI(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  systemPrompt: string,
  knowledgeContext: string,
  forcedLanguage: ChatLanguage
): Promise<string> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    console.error('OpenAI fallback: OPENAI_API_KEY not configured')
    return ''
  }

  console.log('OpenAI fallback: Generating response with gpt-4o-mini...')

  let fullSystemPrompt = `${systemPrompt}\n\n## IDIOMA OBRIGATÓRIO NESTA CONVERSA\n${getLanguageDirective(forcedLanguage)}`

  if (knowledgeContext) {
    fullSystemPrompt += `\n\n--- BASE DE CONHECIMENTO ---\nAs informações abaixo são sua ÚNICA fonte de verdade. Responda EXCLUSIVAMENTE com base neste conteúdo.
Se a pergunta do cliente NÃO puder ser respondida com as informações abaixo, diga educadamente que não possui essa informação no momento e sugira que entre em contato diretamente com a equipe da CB Asesoria para mais detalhes.
NUNCA invente, suponha ou use conhecimento externo. Responda apenas o que está documentado aqui:\n\n${knowledgeContext}\n--- FIM DA BASE DE CONHECIMENTO ---`
  } else {
    fullSystemPrompt += `\n\nATENÇÃO: Não há informações na base de conhecimento no momento. Responda de forma genérica e cordial, orientando o cliente a entrar em contato com a equipe da CB Asesoria para informações detalhadas.`
  }

  // CRÍTICO: regras anti-repetição posicionadas no FINAL do prompt para máximo peso
  fullSystemPrompt += `\n\n## ⛔ REGRAS FINAIS INVIOLÁVEIS (LEIA ANTES DE RESPONDER)
1. Olhe o histórico. Se você JÁ se apresentou antes, está PROIBIDA de se apresentar de novo.
2. Se você JÁ disse "Te ayudaré a entender" antes, NÃO repita.
3. Se o cliente deu uma informação, reconheça com UMA palavra curta e faça a PRÓXIMA pergunta. NUNCA refaça o acolhimento.
4. NÃO comece com saudação se já houve mensagens anteriores. Comece direto com o conteúdo.
5. Cada resposta deve AVANÇAR a conversa.`

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...conversationHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content })),
    { role: 'user' as const, content: currentMessage },
  ]

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI fallback error:', response.status, errorText)
      return ''
    }

    const data = await response.json()
    const result = data?.choices?.[0]?.message?.content?.trim() || ''

    if (!result) {
      console.warn('OpenAI fallback returned empty content')
      return ''
    }

    console.log('OpenAI fallback response received, length:', result.length)
    return result
  } catch (err) {
    console.error('OpenAI fallback exception:', err instanceof Error ? err.message : err)
    return ''
  }
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

  const TWILIO_FROM_NUMBER = 'whatsapp:+34654378464'
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

/** Extract structured contact data from a chat message using Gemini */
function extractReferralSource(messageText: string): string | null {
  const text = messageText.trim()
  const lower = text.toLowerCase()

  const referralPatterns = [
    /\b(?:vi|vim|achei|encontrei|conheci|soube|descobri|cheguei)\s+(?:voc[eê]s?|a\s+cb|a\s+empresa)?\s*(?:pelo|pela|por|no|na|atrav[eé]s\s+do|atrav[eé]s\s+da)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,40})/i,
    /\b(?:me\s+indicaram|fui\s+indicad[oa]|indicaç[aã]o\s+de|indicado\s+por|indicada\s+por)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
    /\b(?:instagram|google|facebook|tiktok|tik\s*tok|youtube|site|internet|whatsapp|amigo|amiga)\b/i,
  ]

  const match = referralPatterns.map(pattern => lower.match(pattern)).find(Boolean)
  if (!match) return null

  const rawValue = (match[1] || match[0]).replace(/\b(?:de|do|da|dos|das|um|uma|meu|minha|pelo|pela|por|no|na)\b/gi, ' ').trim()
  const normalized = rawValue.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const knownSources: Record<string, string> = {
    instagram: 'Instagram',
    google: 'Google',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    'tik tok': 'TikTok',
    youtube: 'YouTube',
    site: 'Site',
    internet: 'Internet',
    whatsapp: 'WhatsApp',
    amigo: 'Indicação de amigo',
    amiga: 'Indicação de amiga',
  }

  for (const [key, label] of Object.entries(knownSources)) {
    if (normalized.includes(key)) return label
  }

  return rawValue
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

async function extractAndSuggestContactData(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
  messageText: string,
  apiKey: string
): Promise<void> {
  if (!messageText || messageText.length < 5) return

  // Skip generic/short messages
  if (/^(ok|sim|não|nao|obrigad|oi|olá|hola|hello|bonjour|👍|✅)[\s!?.]*$/i.test(messageText.trim())) return

  const deterministicReferral = extractReferralSource(messageText)

  const prompt = `Analise a mensagem do cliente e extraia APENAS dados pessoais explicitamente mencionados.
Retorne um JSON com SOMENTE os campos que foram claramente informados na mensagem. Não invente dados.

Campos possíveis:
- full_name (nome completo)
- nationality (nacionalidade)
- country_of_origin (país de origem)
- birth_date (data de nascimento, formato YYYY-MM-DD)
- civil_status (solteiro, casado, divorciado, viuvo, uniao_estavel)
- profession (profissão)
- email (e-mail)
- cpf (CPF brasileiro, apenas dígitos, 11 caracteres - aceite formatos como "123.456.789-00", "12345678900", "123 456 789 00")
- document_number (número do documento de identidade/NIE/passaporte/DNI, se NÃO for CPF)
- address (endereço)
- spain_arrival_date (data de chegada na Espanha, formato YYYY-MM-DD)
- education_level (escolaridade)
- birth_city (cidade natal)
- birth_state (estado natal)
- is_empadronado (true/false)
- empadronamiento_city (cidade do empadronamiento)
- empadronamiento_since (data desde quando, formato YYYY-MM-DD)
- has_job_offer (true/false)
- works_remotely (true/false)
- has_eu_family_member (true/false)
- referral_name (como conheceu a empresa / quem indicou — ex.: "Instagram", "Google", "Facebook", "TikTok", "YouTube", "Indicação de amigo", "João Silva". Capture quando o cliente disser frases como "vi no Instagram", "achei no Google", "fui indicado por X", "me indicaram", "conheci pelo Facebook")

REGRA CPF: Sempre normalize o CPF removendo pontos, traços e espaços. Retorne apenas os 11 dígitos. Se o cliente informar menos ou mais que 11 dígitos, NÃO inclua o campo.

REGRA REFERRAL: Para referral_name, normalize redes sociais para o nome próprio capitalizado (ex.: "instagram" → "Instagram", "google" → "Google"). Se for nome de pessoa, mantenha em formato Title Case. Não inclua o campo se o cliente apenas mencionar a rede sem dizer que foi por onde conheceu.

REGRAS DE NORMALIZAÇÃO DE DATAS (MUITO IMPORTANTE):
Sempre converta QUALQUER formato de data informado pelo cliente para o padrão YYYY-MM-DD.
Aceite e interprete variações em português, espanhol, inglês e francês, incluindo:
- Numéricas: "02/05/1990", "2-5-90", "02.05.1990", "1990/05/02", "5/2/1990" (assuma DD/MM quando ambíguo, pois clientes são PT/ES)
- Por extenso: "2 de maio de 1990", "dois de maio de mil novecentos e noventa", "02 de mayo de 1990", "May 2nd 1990", "2 mai 1990"
- Abreviadas: "2 mai 90", "02-mai-1990", "2/mai/90"
- Relativas (use a data de hoje = ${new Date().toISOString().slice(0,10)} como referência):
  * "hoje" → data de hoje
  * "ontem" → data de hoje - 1
  * "amanhã" / "mañana" → data de hoje + 1
  * "semana passada" → data de hoje - 7
  * "mês passado" → mesmo dia, mês anterior
  * "no mês que vem dia 10" → próximo mês, dia 10
  * "cheguei há 3 meses" → data de hoje - 3 meses (use o dia 1)
- Anos com 2 dígitos: se ≤ ano atual atual (ex.: "90") assuma 19YY para datas de nascimento; para datas recentes/futuras assuma 20YY.
- Meses por nome (PT/ES/EN/FR): janeiro/enero/january/janvier=01, fevereiro/febrero/february/février=02, março/marzo/march/mars=03, abril/abril/april/avril=04, maio/mayo/may/mai=05, junho/junio/june/juin=06, julho/julio/july/juillet=07, agosto/agosto/august/août=08, setembro/septiembre/september/septembre=09, outubro/octubre/october/octobre=10, novembro/noviembre/november/novembre=11, dezembro/diciembre/december/décembre=12.

Se faltar o ANO em uma data de nascimento, NÃO inclua o campo (peça de novo depois). Para outras datas, se faltar ano, assuma o ano atual; se a data resultante já passou e o contexto for futuro (chegada/agendamento), assuma o próximo ano.

Se a mensagem não contém nenhum dado pessoal extraível, retorne: {}

Mensagem do cliente: "${messageText}"

Responda APENAS com o JSON, sem markdown, sem explicação.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
      }
    )

    if (!response.ok && !deterministicReferral) return

    const data = response.ok ? await response.json() : null
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = rawText.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    if (!jsonMatch || jsonMatch === '{}') {
      if (!deterministicReferral) return
    }

    let extracted: Record<string, string>
    try {
      extracted = jsonMatch && jsonMatch !== '{}' ? JSON.parse(jsonMatch) : {}
    } catch {
      console.warn('Failed to parse extraction JSON:', rawText.substring(0, 200))
      extracted = {}
    }

    if (deterministicReferral && !extracted.referral_name) {
      extracted.referral_name = deterministicReferral
    }

    if (Object.keys(extracted).length === 0) return

    // Get current contact data to compare
    const { data: currentContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (!currentContact) return

    const referralValue = extracted.referral_name ? String(extracted.referral_name).trim() : ''
    const currentReferral = (currentContact as Record<string, any>).referral_name

    if (referralValue && !String(currentReferral || '').trim()) {
      const { error: referralUpdateError } = await supabase
        .from('contacts')
        .update({ referral_name: referralValue })
        .eq('id', contactId)

      if (referralUpdateError) {
        console.error('Failed to update referral_name directly:', referralUpdateError.message)
      } else {
        ;(currentContact as Record<string, any>).referral_name = referralValue
        console.log(`Updated referral_name directly for contact ${contactId}: ${referralValue}`)
      }
    }

    const suggestions: Array<{ contact_id: string; field_name: string; suggested_value: string; current_value: string | null }> = []

    for (const [field, value] of Object.entries(extracted)) {
      if (!value || typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') continue
      const strValue = String(value)
      const currentValue = (currentContact as Record<string, any>)[field]
      const currentStr = currentValue != null ? String(currentValue) : null

      // Skip if same value or if name starts with WhatsApp (auto-generated)
      if (currentStr === strValue) continue
      if (field === 'full_name' && currentStr && !currentStr.startsWith('WhatsApp ')) continue
      // Skip email if already set (handled separately by existing logic)
      if (field === 'email' && currentStr) continue

      suggestions.push({
        contact_id: contactId,
        field_name: field,
        suggested_value: strValue,
        current_value: currentStr,
      })
    }

    if (suggestions.length > 0) {
      // Check for existing pending suggestions with same field to avoid duplicates
      const { data: existingPending } = await supabase
        .from('contact_data_suggestions')
        .select('field_name, suggested_value')
        .eq('contact_id', contactId)
        .eq('status', 'pending')

      const existingSet = new Set((existingPending || []).map(e => `${e.field_name}:${e.suggested_value}`))
      const newSuggestions = suggestions.filter(s => !existingSet.has(`${s.field_name}:${s.suggested_value}`))

      if (newSuggestions.length > 0) {
        await supabase.from('contact_data_suggestions').insert(newSuggestions)
        console.log(`Inserted ${newSuggestions.length} data suggestions for contact ${contactId}`)
      }
    }
  } catch (err) {
    console.error('Data extraction failed:', err instanceof Error ? err.message : err)
  }
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

    const phoneNumber = message.from.replace(/\D/g, '')
    console.log('Processing message from:', phoneNumber)

    // Find existing contact by phone
    let contact: { id: string; full_name: string; preferred_language: string | null } | null = null
    // Use .limit(1) instead of .single() to avoid error when duplicate contacts exist for same phone
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, full_name, preferred_language')
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
        .select('id, full_name, preferred_language')
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

    // ========== AUTO-TRANSCRIBE AUDIO/PTT ==========
    if ((mediaType === 'audio' || mediaType === 'ptt') && storedMediaUrl && insertedMsg?.id) {
      try {
        console.log('Auto-transcribing audio message:', insertedMsg.id)
        const transcribeResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe-audio`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              audioUrl: storedMediaUrl,
              messageId: insertedMsg.id,
            }),
          }
        )
        if (transcribeResponse.ok) {
          const transcribeResult = await transcribeResponse.json()
          console.log('Auto-transcription completed:', transcribeResult.transcription?.substring(0, 100))
        } else {
          console.warn('Auto-transcription failed:', transcribeResponse.status)
        }
      } catch (transcribeErr) {
        console.error('Auto-transcription error (non-blocking):', transcribeErr instanceof Error ? transcribeErr.message : transcribeErr)
      }
    }

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

        const currentCustomerMessage = String(message.body || '')
        // R5: Use preferred_language from contact as initial hint for language detection
        const preferredLangMap: Record<string, ChatLanguage> = { 'pt': 'pt-BR', 'pt-BR': 'pt-BR', 'es': 'es', 'en': 'en', 'fr': 'fr' }
        const langCodeMap: Record<ChatLanguage, string> = { 'pt-BR': 'pt', 'es': 'es', 'en': 'en', 'fr': 'fr' }
        const langHint = contact.preferred_language ? preferredLangMap[contact.preferred_language] : null
        const detectedFromText = detectChatLanguage(currentCustomerMessage)
        
        // Strong Portuguese signal in current message — overrides any saved hint
        const ptSample = currentCustomerMessage.toLowerCase().normalize('NFC')
        const strongPortuguese = /\b(n[aã]o|sim|obrigad[oa]|ol[aá]|oi|voc[eê]|nunca|tamb[eé]m|tudo bem|bom dia|boa tarde|boa noite|brasil|espanha|europa|portugu[eê]s|estou|quero|preciso|meu|minha|cpf|cnpj)\b/u.test(ptSample) || /[ãõ]/.test(currentCustomerMessage)

        // Language decision logic:
        // 1. Confident non-pt detection from text → use it
        // 2. Strong Portuguese signal → force pt-BR (overrides saved hint)
        // 3. Ambiguous text + saved non-pt hint → use saved
        // 4. Else pt-BR
        let detectedChatLanguage: ChatLanguage
        if (detectedFromText !== 'pt-BR') {
          detectedChatLanguage = detectedFromText
        } else if (strongPortuguese) {
          detectedChatLanguage = 'pt-BR'
        } else if (langHint && langHint !== 'pt-BR') {
          detectedChatLanguage = langHint
        } else {
          detectedChatLanguage = 'pt-BR'
        }

        // Persist when we have a confident change (non-default detection OR strong PT switch)
        const currentLangCode = langCodeMap[detectedChatLanguage]
        if (contact.preferred_language !== currentLangCode && (detectedFromText !== 'pt-BR' || strongPortuguese)) {
          await supabase.from('contacts').update({ preferred_language: currentLangCode }).eq('id', contact.id)
          contact.preferred_language = currentLangCode
          console.log('Persisted detected language on contact:', currentLangCode)
        }
        
        console.log('Detected chat language:', detectedChatLanguage, 'hint:', contact.preferred_language, 'fromText:', detectedFromText, 'message sample:', currentCustomerMessage.slice(0, 80))

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
- Nome do cliente: ${contact.full_name}. Use o primeiro nome de vez em quando, não em toda mensagem (soa artificial).

## REGRAS ANTI-REPETIÇÃO (CRÍTICO)
- NUNCA repita a saudação inicial ("Olá", "Hola", "Oi") depois da primeira mensagem.
- NUNCA repita frases institucionais como "Te ajudarei a entender seus caminhos legais", "Gracias por hablar con CB Asesoría", "Bem-vindo à CB" mais de uma vez na conversa inteira.
- NUNCA reinicie a apresentação quando o cliente responder. Apenas continue a conversa naturalmente, como uma pessoa faria.
- Quando o cliente disser o nome, NÃO devolva uma nova abertura completa. Apenas reconheça com algo curto e natural ("Prazer, Giovanna!" ou "Encantada, Giovanna" ou simplesmente seguir com a próxima pergunta) e siga em frente.
- Varie suas confirmações: alterne entre "Perfeito", "Entendido", "Anotado", "Ótimo", "Combinado", silêncio (só seguir), etc. Não use sempre a mesma palavra.
- Varie a forma de fazer a próxima pergunta. Não use sempre o mesmo conector.

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
2. **Nome completo** (se o WhatsApp não trouxe ou se está incompleto).
3. **E-mail** de contato.
4. **Origem**: como conheceu a CB Asesoría (Instagram, Google, indicação, etc.). Se for indicação, perguntar o nome de quem indicou.
5. **Interesse**: o que busca (nacionalidade, residência, estudos, arraigo, NIE/TIE, homologação, reagrupação, nômade digital, etc.).
6. **Localização atual**: já está na Espanha ou ainda em outro país?
7. **Aprofundamento conforme localização**:
   - **Se FORA da Espanha**: data de nascimento (pergunte a data de nascimento — NUNCA pergunte a idade diretamente; se o cliente disser apenas a idade, peça gentilmente a data completa para registrar na ficha); esteve na Europa nos últimos 6 meses?; tem familiar europeu ou residente legal na Espanha?; trabalha remoto?; tem formação superior?
   - **Se JÁ NA ESPANHA**: data exata de entrada; está empadronado?; desde quando?; em qual cidade?
8. **Encerramento humanizado**: dizer que vai passar para um especialista analisar com cuidado e que em breve alguém da equipe entra em contato.

## COMO CONDUZIR
- UMA pergunta por vez. Espere a resposta antes da próxima.
- Não anuncie que vai fazer perguntas ("vou te fazer algumas perguntas rápidas") mais de uma vez. Apenas pergunte.
- Se o cliente já forneceu uma informação (nome, email), NÃO pergunte de novo. Reconheça e avance.
- Se o cliente fizer uma pergunta fora do roteiro, responda brevemente com base no conhecimento e retome o ponto onde estava — sem repetir contexto que já foi dito.
- REGRA DE SEGMENTAÇÃO (objetivo 7): após saber a localização, escolha APENAS UM dos blocos (fora da Espanha OU dentro da Espanha) e siga só esse. NUNCA misture perguntas dos dois blocos.
- Faça uma pergunta de cada vez também dentro do bloco 7. Não despeje a lista toda.
- Após o objetivo 8 (encerramento/handoff), PARE de responder. O atendente humano assume.

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

        // ========== AI DATA EXTRACTION FOR SUGGESTIONS ==========
        try {
          await extractAndSuggestContactData(supabase, contact.id, String(message.body || ''), geminiApiKey)
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
          messageForAI = message.body || (mediaType ? getMediaPlaceholder(mediaType, detectedChatLanguage) : '')
        }

        const history = await getConversationHistory(supabase, lead.id)
        const rawCustomerMessage = messageForAI
        const lastAssistantMessage = [...history].reverse().find((msg) => msg.role === 'assistant')?.content || ''
        const lastAssistantQuestion = extractLastQuestion(lastAssistantMessage)
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
        const knownName = contact.full_name || ''
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
        const kbQueryParts: string[] = []
        if (topicHint) kbQueryParts.push(`Tópico: ${topicHint}`)
        if (lastAssistantQuestion) kbQueryParts.push(`Pergunta anterior do agente: ${lastAssistantQuestion}`)
        if (rawCustomerMessage) kbQueryParts.push(`Pergunta do cliente: ${rawCustomerMessage}`)
        const kbQuery = kbQueryParts.join('\n').trim() || (rawCustomerMessage || messageForAI || '').trim()
        const knowledgeContext = kbQuery
          ? await getKnowledgeBaseContext(supabase, kbQuery, topicHint || undefined)
          : ''

        console.log(`[KB] query currentTopic="${currentMessageTopicHint}" finalTopic="${topicHint}" len=${kbQuery.length} -> context ${knowledgeContext.length} chars`)

        // ===== STRICT KB MODE =====
        const kbStrictMode = configMap['kb_strict_mode'] === 'true'
        const kbStrictFallback = (configMap['kb_strict_fallback_message'] || '').trim()
          || 'Obrigado pela sua mensagem! Não tenho essa informação no momento. Vou encaminhar para um de nossos atendentes que entrará em contato em breve. 🙏'

        // Generate AI response (Gemini primary, OpenAI fallback)
        let aiResponse = ''
        let resolvedSystemPrompt = systemPrompt.replace('{nome}', contact.full_name)

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

        aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
        aiResponse = forceAdvanceFromEntryDateQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)

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
            aiResponse = forceAdvanceFromInterestQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
            aiResponse = forceAdvanceFromEntryDateQuestion(lastAssistantMessage, rawCustomerMessage, aiResponse, detectedChatLanguage)
          } catch (retryError) {
            console.error('Anti-repeat retry failed:', retryError instanceof Error ? retryError.message : retryError)
          }
        }

        if (aiResponse) {
          aiResponse = removeRepeatedQuestionIntro(lastAssistantMessage, aiResponse)

          // Send AI response via Twilio
          try {
            await sendWhatsAppMessage(phoneNumber, aiResponse)

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
