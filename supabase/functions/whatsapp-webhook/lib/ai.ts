// @ts-nocheck
// Wave 3b step 7b: AI providers (Gemini + OpenAI fallback) and language enforcement
import {
  type ChatLanguage,
  getLanguageDirective,
  getLanguageName,
  getTransientErrorReply,
  looksPortuguese,
} from './language.ts'
import { extractGeminiText } from './kb.ts'

export function extractTextFromOpenAIResponse(data: Record<string, unknown>): string {
  const choice0 = Array.isArray(data.choices) && data.choices.length > 0
    ? (data.choices[0] as Record<string, unknown>)
    : null

  const message = choice0 && typeof choice0.message === 'object'
    ? (choice0.message as Record<string, unknown>)
    : null

  if (message && typeof message.content === 'string') return message.content.trim()

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

  if (choice0 && typeof choice0.text === 'string') return choice0.text.trim()
  if (typeof data.output_text === 'string') return data.output_text.trim()

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

export async function rewriteResponseToLanguage(
  text: string,
  targetLanguage: ChatLanguage,
  apiKey: string,
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
      },
    )

    if (!response.ok) return text
    const data = await response.json()
    const rewritten = extractGeminiText(data)
    return rewritten || text
  } catch {
    return text
  }
}

export async function enforceResponseLanguage(
  responseText: string,
  forcedLanguage: ChatLanguage,
  _apiKey: string,
): Promise<string> {
  if (forcedLanguage === 'pt-BR') return responseText
  if (!looksPortuguese(responseText)) return responseText

  // Otimização de latência: o rewrite Gemini extra adicionava 1-3s por turno.
  // A diretiva de idioma reforçada no system prompt + filtro de histórico já
  // bastam na prática. Aqui apenas registramos para auditoria.
  console.warn('Response seems to be in Portuguese while forced language is', forcedLanguage, '- skipping extra rewrite (latency optimization)')
  return responseText
}

export async function generateAIResponse(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  systemPrompt: string,
  apiKey: string,
  knowledgeContext: string,
  forcedLanguage: ChatLanguage,
): Promise<string> {
  let fullSystemPrompt = `${systemPrompt}\n\n## IDIOMA OBRIGATÓRIO NESTA CONVERSA\n${getLanguageDirective(forcedLanguage)}`

  if (knowledgeContext) {
    fullSystemPrompt += `\n\n--- BASE DE CONHECIMENTO ---\nAs informações abaixo são sua ÚNICA fonte de verdade. Responda EXCLUSIVAMENTE com base neste conteúdo.
Se a pergunta do cliente NÃO puder ser respondida com as informações abaixo, diga educadamente que não possui essa informação no momento e sugira que entre em contato diretamente com a equipe da CB Asesoria para mais detalhes.
NUNCA invente, suponha ou use conhecimento externo. Responda apenas o que está documentado aqui:\n\n${knowledgeContext}\n--- FIM DA BASE DE CONHECIMENTO ---`
  } else {
    fullSystemPrompt += `\n\nATENÇÃO: Não há informações na base de conhecimento no momento. Responda de forma genérica e cordial, orientando o cliente a entrar em contato com a equipe da CB Asesoria para informações detalhadas.`
  }

  fullSystemPrompt += `\n\n## ⛔ REGRAS FINAIS INVIOLÁVEIS (LEIA ANTES DE RESPONDER)
1. Olhe o histórico acima. Se você JÁ se apresentou em qualquer mensagem anterior (qualquer "Hola", "Olá", "Soy la asistente", "Sou a assistente"), está PROIBIDA de se apresentar de novo. Vá direto ao ponto.
2. Se você JÁ disse "Te ayudaré a entender tus caminos legales" ou "Te ajudarei a entender" antes, está PROIBIDA de repetir. Apenas continue de onde parou.
3. Se o cliente acabou de te dar uma informação (nome, e-mail, origem, interesse), reconheça com UMA palavra curta ("¡Perfecto!", "Anotado", "Genial") e faça a PRÓXIMA pergunta do fluxo. NUNCA refaça o acolhimento.
4. NÃO comece a resposta com saudação se já houve mensagens anteriores. Comece direto com o conteúdo.
5. Cada resposta deve AVANÇAR a conversa. Nunca volte uma etapa.
6. Releia as últimas 3 mensagens do histórico antes de escrever. Se sua próxima resposta soa parecida com algo que você já disse, REESCREVA de outro jeito.`

  const filteredHistory = forcedLanguage === 'pt-BR'
    ? conversationHistory
    : conversationHistory.filter((msg) => msg.role === 'user' || !looksPortuguese(msg.content))

  // Otimização de latência: limita às últimas 24 mensagens (≈12 turnos).
  // O suficiente para contexto do roteiro sem sobrecarregar o prompt.
  const HISTORY_LIMIT = 24
  const effectiveHistory = filteredHistory.length > HISTORY_LIMIT
    ? filteredHistory.slice(-HISTORY_LIMIT)
    : filteredHistory

  const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = []

  for (const msg of effectiveHistory) {
    geminiContents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })
  }

  geminiContents.push({ role: 'user', parts: [{ text: currentMessage }] })

  console.log('Calling Gemini API with', geminiContents.length, 'messages, system prompt length:', fullSystemPrompt.length, 'forced language:', forcedLanguage)

  const MAX_RETRIES = 3
  const RETRY_DELAYS = [2000, 4000, 8000]

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
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: controller.signal,
        },
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

export async function generateAIResponseOpenAI(
  conversationHistory: Array<{ role: string; content: string }>,
  currentMessage: string,
  systemPrompt: string,
  knowledgeContext: string,
  forcedLanguage: ChatLanguage,
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

  fullSystemPrompt += `\n\n## ⛔ REGRAS FINAIS INVIOLÁVEIS (LEIA ANTES DE RESPONDER)
1. Olhe o histórico. Se você JÁ se apresentou antes, está PROIBIDA de se apresentar de novo.
2. Se você JÁ disse "Te ayudaré a entender" antes, NÃO repita.
3. Se o cliente deu uma informação, reconheça com UMA palavra curta e faça a PRÓXIMA pergunta. NUNCA refaça o acolhimento.
4. NÃO comece com saudação se já houve mensagens anteriores. Comece direto com o conteúdo.
5. Cada resposta deve AVANÇAR a conversa.`

  const trimmedHistory = conversationHistory.length > 24
    ? conversationHistory.slice(-24)
    : conversationHistory
  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...trimmedHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content })),
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
