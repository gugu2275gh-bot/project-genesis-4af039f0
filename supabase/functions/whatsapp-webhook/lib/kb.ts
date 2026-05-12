// Knowledge base retrieval (semantic + lexical) and topic detection.
// Extracted from index.ts (Wave 3b, step 3).

import {
  normalizeForSearch,
  meaningfulSearchTokens,
  compactSearchText,
} from './text-utils.ts'

const INVALID_KNOWLEDGE_PATTERNS = [
  /unable to extract text from pdf/i,
  /cannot extract text from pdf/i,
  /can't extract text from pdf/i,
  /i\s*(?:am|'m)\s*unable to extract/i,
  /forne[çc]a o texto/i,
  /provide the text or key points/i,
  /não (?:consigo|foi possível) extrair/i,
]

export function isInvalidKnowledgeChunk(content: string): boolean {
  const normalized = (content || '').trim()
  if (!normalized) return true
  return INVALID_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function scoreTopicFileName(fileName: string, hintOrConversation: string): number {
  const fileTokens = meaningfulSearchTokens(fileName)
  if (!fileTokens.length) return 0

  const normalizedTarget = normalizeForSearch(hintOrConversation)
  const compactTarget = compactSearchText(hintOrConversation)
  const compactFile = fileTokens.join(' ')
  const hits = fileTokens.filter((token) => normalizedTarget.includes(token)).length
  if (hits === 0) return 0

  // R6: lexical filename match acts as a TIEBREAKER, not as a strong boost.
  // Semantic search (embeddings) is the primary signal; we only nudge when the
  // file name is a near-exact phrase match.
  const phraseBonus = compactTarget.includes(compactFile) ? 3 : 0
  const coverage = hits / fileTokens.length
  const extraPenalty = Math.max(0, fileTokens.length - hits) * 0.2
  return hits + phraseBonus + coverage - extraPenalty
}

export function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((part: any) => part?.text || '').join('').trim()
}

export async function detectKnowledgeTopicHint(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationText: string,
): Promise<string> {
  if (!conversationText.trim()) return ''

  const { data: rows, error } = await supabase
    .from('knowledge_base')
    .select('file_name')
    .eq('is_active', true)

  if (error || !rows?.length) return ''

  const uniqueFileNames = Array.from(new Set(rows.map((row: any) => row.file_name).filter(Boolean))) as string[]
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
  // deno-lint-ignore no-explicit-any
  supabase: any,
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
export async function getKnowledgeBaseContext(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userMessage: string,
  topicHint?: string,
): Promise<string> {
  const normalizedHint = topicHint ? normalizeForSearch(topicHint) : ''
  let topicPreloaded: Array<{ content: string; file_name: string; chunk_index: number }> = []
  if (normalizedHint) {
    const { data: topicEntries } = await supabase
      .from('knowledge_base')
      .select('content, file_name, chunk_index')
      .eq('is_active', true)
      .order('file_name')
      .order('chunk_index')

    const validTopicEntries = (topicEntries || []).filter((entry: any) => !isInvalidKnowledgeChunk(entry.content))
    const bestTopic = Array.from(new Set(validTopicEntries.map((entry: any) => entry.file_name).filter(Boolean)))
      .map((fileName) => ({ fileName: fileName as string, score: scoreTopicFileName(fileName as string, topicHint || '') }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score || meaningfulSearchTokens(a.fileName).length - meaningfulSearchTokens(b.fileName).length)[0]

    if (bestTopic) {
      topicPreloaded = validTopicEntries.filter((entry: any) => entry.file_name === bestTopic.fileName).slice(0, 6)
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

  // 2) Fallback to lexical keyword search
  console.log('[KB] Falling back to lexical search')
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('content, file_name, chunk_index')
    .eq('is_active', true)
    .order('file_name')
    .order('chunk_index')

  if (!kbEntries?.length) return ''

  const validEntries = kbEntries.filter((entry: any) => !isInvalidKnowledgeChunk(entry.content))
  if (!validEntries.length) return ''

  const normalizedQuestion = normalizeForSearch(userMessage)
  const keywords = normalizedQuestion.split(/\s+/).filter((w) => w.length > 2)

  const scoredChunks = validEntries.map((entry: any) => {
    const normalizedContent = normalizeForSearch(entry.content)
    const keywordScore = keywords.reduce((acc, kw) => acc + (normalizedContent.includes(kw) ? 1 : 0), 0)
    const phraseBonus = normalizedContent.includes(normalizedQuestion) ? 5 : 0
    return { ...entry, score: keywordScore + phraseBonus }
  })

  const relevant = scoredChunks
    .filter((chunk: any) => chunk.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 8)

  const selected = relevant.length > 0 ? relevant : validEntries.slice(0, 8)
  const seen = new Set(topicPreloaded.map((c) => `${c.file_name}#${c.chunk_index}`))
  const lexicalRest = selected.filter((c: any) => !seen.has(`${c.file_name}#${c.chunk_index}`))

  return [
    ...topicPreloaded.map((c) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Tópico]\n${c.content}`),
    ...lexicalRest.map((c: any) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index}]\n${c.content}`),
  ].join('\n\n').substring(0, 9000)
}
