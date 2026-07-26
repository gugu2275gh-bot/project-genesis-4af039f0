// @ts-nocheck
/**
 * Utilitários de performance do turno:
 *  - `Timings`: marcação de fases (ms) para diagnóstico de latência.
 *  - `cached`: cache em memória do isolate com TTL curto (configurações que
 *    mudam raramente: agente, textos, etapas de fluxo, llm_settings).
 *  - `fireAndForget`: tira do caminho crítico writes que não bloqueiam a
 *    resposta ao cliente (notificações, logs, interações).
 */

export class Timings {
  private t0 = Date.now()
  private last = Date.now()
  private marks: Record<string, number> = {}

  mark(name: string): void {
    const now = Date.now()
    this.marks[name] = (this.marks[name] || 0) + (now - this.last)
    this.last = now
  }

  /** Reinicia o cronômetro parcial sem registrar fase (após esperas externas). */
  reset(): void {
    this.last = Date.now()
  }

  get totalMs(): number {
    return Date.now() - this.t0
  }

  snapshot(): Record<string, number> {
    return { ...this.marks, total_ms: this.totalMs }
  }

  log(prefix = '[PERF]'): void {
    console.log(prefix, JSON.stringify(this.snapshot()))
  }
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const CACHE = new Map<string, CacheEntry>()

/** Cache de leitura com TTL (padrão 60s) no escopo do isolate. */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value as T
  const value = await loader()
  CACHE.set(key, { value, expiresAt: now + ttlMs })
  return value
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    CACHE.clear()
    return
  }
  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) CACHE.delete(key)
  }
}

/**
 * Executa a promessa fora do caminho crítico. Em Supabase Edge Functions usa
 * `EdgeRuntime.waitUntil` para garantir que o write conclua após a resposta.
 */
export function fireAndForget(promise: Promise<unknown> | (() => Promise<unknown>), label = 'bg'): void {
  let p: Promise<unknown>
  try {
    p = typeof promise === 'function' ? promise() : promise
  } catch (err) {
    console.warn(`[${label}] falhou (não bloqueante):`, err instanceof Error ? err.message : err)
    return
  }
  const guarded = Promise.resolve(p).catch((err) => {
    console.warn(`[${label}] falhou (não bloqueante):`, err instanceof Error ? err.message : err)
  })
  try {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime
    if (rt && typeof rt.waitUntil === 'function') rt.waitUntil(guarded)
  } catch (_e) {
    // Ambiente sem EdgeRuntime (testes): a promessa segue solta.
  }
}
