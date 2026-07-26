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

/** Siglas/termos curtos relevantes no domínio (ex.: TIE, NIE, EX17) */
const ACRONYM_RE = /\b([a-z]{2,5}\d{0,3})\b/g
const ACRONYM_STOPWORDS = new Set([
  'que', 'the', 'com', 'por', 'para', 'como', 'uma', 'meu', 'sua', 'seu', 'nao', 'sim',
  'qual', 'onde', 'quem', 'isso', 'esse', 'essa', 'você', 'voce', 'tem', 'ser', 'sao',
  'and', 'for', 'what', 'is', 'de', 'do', 'da', 'em', 'no', 'na', 'ou', 'e',
])

/** Extrai siglas do texto original (privilegia tokens em MAIÚSCULAS) */
function extractAcronyms(text: string): string[] {
  const out = new Set<string>()
  for (const m of (text || '').matchAll(/\b[A-ZÀ-Ú]{2,6}\d{0,3}\b/g)) {
    out.add(m[0].toLowerCase())
  }
  const normalized = normalizeForSearch(text)
  for (const m of normalized.matchAll(ACRONYM_RE)) {
    const token = m[1]
    if (token.length >= 2 && token.length <= 5 && !ACRONYM_STOPWORDS.has(token)) out.add(token)
  }
  return Array.from(out)
}

/** Busca léxica (palavras-chave + siglas) na base de conhecimento */
async function lexicalSearch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userMessage: string,
  limit = 8,
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  const { data: kbEntries } = await supabase
    .from('knowledge_base')
    .select('content, file_name, chunk_index')
    .eq('is_active', true)
    .order('file_name')
    .order('chunk_index')

  if (!kbEntries?.length) return []

  const validEntries = kbEntries.filter((entry: any) => !isInvalidKnowledgeChunk(entry.content))
  if (!validEntries.length) return []

  const normalizedQuestion = normalizeForSearch(userMessage)
  const keywords = normalizedQuestion.split(/\s+/).filter((w) => w.length > 2)
  const acronyms = extractAcronyms(userMessage)

  const scoredChunks = validEntries.map((entry: any) => {
    const normalizedContent = normalizeForSearch(entry.content)
    const normalizedFile = normalizeForSearch(entry.file_name || '')
    const keywordScore = keywords.reduce((acc, kw) => acc + (normalizedContent.includes(kw) ? 1 : 0), 0)
    const phraseBonus = normalizedContent.includes(normalizedQuestion) ? 5 : 0
    // Siglas (TIE, NIE, EX17...) valem muito: match exato de palavra inteira.
    const acronymScore = acronyms.reduce((acc, ac) => {
      const wordRe = new RegExp(`(^|[^a-z0-9])${ac}([^a-z0-9]|$)`)
      let s = 0
      if (wordRe.test(normalizedContent)) s += 4
      if (wordRe.test(normalizedFile)) s += 6
      return acc + s
    }, 0)
    return { ...entry, score: keywordScore + phraseBonus + acronymScore }
  })

  return scoredChunks
    .filter((chunk: any) => chunk.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
}

/** Retrieve relevant knowledge base content for the AI context (busca híbrida: semântica + léxica) */
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

  // 1) Semântica (limiar mais permissivo) e 2) léxica rodam SEMPRE e são mescladas.
  let semantic: any[] = []
  const queryEmbedding = await generateQueryEmbedding(supabase, userMessage)
  if (queryEmbedding) {
    const { data: semanticMatches, error: semErr } = await supabase.rpc('match_knowledge_base', {
      query_embedding: queryEmbedding as unknown as string,
      match_count: 12,
      similarity_threshold: 0.2,
    })
    if (semErr) console.error('[KB] Semantic search error:', semErr)
    if (Array.isArray(semanticMatches)) {
      semantic = semanticMatches.filter((entry: any) => !isInvalidKnowledgeChunk(entry.content))
      if (normalizedHint) {
        const hintTokens = normalizedHint.split(/\s+/).filter((w) => w.length > 3)
        semantic = semantic
          .map((chunk: any) => {
            const fname = normalizeForSearch(chunk.file_name || '')
            const hits = hintTokens.reduce((acc, t) => acc + (fname.includes(t) ? 1 : 0), 0)
            const boost = hits >= 2 ? 0.25 : hits === 1 ? 0.1 : 0
            return { ...chunk, similarity: (chunk.similarity || 0) + boost, _boost: boost }
          })
          .sort((a: any, b: any) => b.similarity - a.similarity)
      }
    }
  }

  const lexical = await lexicalSearch(supabase, userMessage, 8)

  const key = (c: any) => `${c.file_name}#${c.chunk_index}`
  const seen = new Set(topicPreloaded.map(key))
  const parts: string[] = topicPreloaded.map((c) => `[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Tópico]\n${c.content}`)

  // Léxico primeiro quando houver match forte (siglas como TIE/NIE ficam no topo).
  const strongLexical = lexical.filter((c: any) => c.score >= 4)
  for (const c of strongLexical) {
    if (seen.has(key(c))) continue
    seen.add(key(c))
    parts.push(`[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Léxico]\n${c.content}`)
  }
  for (const c of semantic) {
    if (seen.has(key(c))) continue
    seen.add(key(c))
    parts.push(`[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Sim: ${c.similarity?.toFixed(2)}]\n${c.content}`)
  }
  for (const c of lexical) {
    if (seen.has(key(c))) continue
    seen.add(key(c))
    parts.push(`[Fonte: ${c.file_name} | Bloco ${c.chunk_index} | Léxico]\n${c.content}`)
  }

  console.log(`[KB] hybrid: semantic=${semantic.length} lexical=${lexical.length} (strong=${strongLexical.length}) topic=${topicPreloaded.length} merged=${parts.length}`)

  return parts.join('\n\n').substring(0, 3500)
}

