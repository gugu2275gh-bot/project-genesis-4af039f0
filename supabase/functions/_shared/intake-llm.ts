// @ts-nocheck
/**
 * Chamada de LLM usada pelo aproveitamento da 1ª mensagem (intake).
 *
 * Resiliente por design: tenta o Gemini direto (chave própria) com uma nova
 * tentativa em 429/5xx e, se ainda falhar, cai no Lovable AI Gateway. Qualquer
 * falha vira exceção com mensagem legível — quem chama registra o motivo.
 */

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GATEWAY_MODEL = 'google/gemini-3.1-flash-lite'
const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function callGeminiDirect(key: string, prompt: string): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 400, temperature: 0 },
      }),
    },
  )
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const err = new Error(`gemini ${resp.status} ${body.slice(0, 160)}`)
    ;(err as any).status = resp.status
    throw err
  }
  const data = await resp.json()
  return String(data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '')
}

async function callGateway(key: string, prompt: string): Promise<string> {
  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Você extrai dados. Responda apenas com JSON válido.' },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`gateway ${resp.status} ${body.slice(0, 160)}`)
  }
  const data = await resp.json()
  return String(data?.choices?.[0]?.message?.content || '')
}

/**
 * Devolve a função de LLM do intake, ou `null` quando nenhuma credencial está
 * configurada (nesse caso o intake é ignorado e o motivo fica no log).
 */
export function createIntakeLLM(env: {
  geminiKey?: string | null
  lovableKey?: string | null
}): ((prompt: string) => Promise<string>) | null {
  const geminiKey = env.geminiKey || ''
  const lovableKey = env.lovableKey || ''
  if (!geminiKey && !lovableKey) return null

  return async (prompt: string): Promise<string> => {
    const errors: string[] = []

    if (geminiKey) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const out = await callGeminiDirect(geminiKey, prompt)
          if (out.trim()) return out
          errors.push('gemini resposta vazia')
          break
        } catch (e) {
          const status = Number((e as any)?.status || 0)
          errors.push(e instanceof Error ? e.message : String(e))
          const retryable = status === 429 || (status >= 500 && status < 600)
          if (!retryable || attempt === 1) break
          await sleep(400)
        }
      }
    }

    if (lovableKey) {
      try {
        const out = await callGateway(lovableKey, prompt)
        if (out.trim()) return out
        errors.push('gateway resposta vazia')
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    throw new Error(errors.join(' | ') || 'sem provedor disponível')
  }
}
