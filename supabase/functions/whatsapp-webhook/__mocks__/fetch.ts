// Fetch mock helper for handler integration tests.
// Lets a test register URL-pattern handlers; falls back to 404.
// Records every call so tests can assert on outbound traffic (Twilio, Gemini, etc).

export type FetchHandler = (req: Request) => Promise<Response> | Response

export interface FetchCall {
  url: string
  method: string
  body: string | null
  headers: Record<string, string>
}

export interface FetchMock {
  calls: FetchCall[]
  on(pattern: RegExp | string, handler: FetchHandler): void
  restore(): void
  callsMatching(pattern: RegExp | string): FetchCall[]
}

export function installFetchMock(): FetchMock {
  const original = globalThis.fetch
  const handlers: Array<{ pattern: RegExp; handler: FetchHandler }> = []
  const calls: FetchCall[] = []

  const toRegex = (p: RegExp | string): RegExp => (typeof p === 'string' ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : p)

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(typeof input === 'string' ? input : input.toString(), init)
    const url = req.url
    const method = req.method
    const body = init?.body ? String(init.body) : (req.body ? await req.clone().text() : null)
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => { headers[k] = v })
    calls.push({ url, method, body, headers })

    for (const { pattern, handler } of handlers) {
      if (pattern.test(url)) {
        return handler(req)
      }
    }
    return new Response(JSON.stringify({ error: 'unmocked', url }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  return {
    calls,
    on(pattern, handler) { handlers.push({ pattern: toRegex(pattern), handler }) },
    restore() { globalThis.fetch = original },
    callsMatching(pattern) {
      const re = toRegex(pattern)
      return calls.filter((c) => re.test(c.url))
    },
  }
}
