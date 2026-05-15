// @ts-nocheck
// Fila de "off-topics" parqueados durante o pré-handoff.
// Cada item representa uma dúvida ou pedido que o cliente fez fora da
// sequência de cadastro e que deve ser respondido AUTOMATICAMENTE assim que
// o pré-handoff for emitido.

export type PendingKind = 'question' | 'request'

export interface PendingItem {
  text: string
  ts: string
  kind: PendingKind
}

const MAX_QUEUE = 10
const MAX_TEXT = 500

export function normalizeQueue(raw: unknown): PendingItem[] {
  if (!Array.isArray(raw)) return []
  const out: PendingItem[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const text = String((v as any).text || '').trim().slice(0, MAX_TEXT)
    if (!text) continue
    const kind = (v as any).kind === 'request' ? 'request' : 'question'
    const ts = String((v as any).ts || new Date().toISOString())
    out.push({ text, ts, kind })
  }
  return out.slice(-MAX_QUEUE)
}

export function pushPending(queue: PendingItem[], item: { text: string; kind: PendingKind }): PendingItem[] {
  const text = String(item.text || '').trim().slice(0, MAX_TEXT)
  if (!text) return queue
  // Dedup: ignora se o último item é exatamente igual.
  const last = queue[queue.length - 1]
  if (last && last.text === text && last.kind === item.kind) return queue
  const next = [...queue, { text, kind: item.kind, ts: new Date().toISOString() }]
  return next.slice(-MAX_QUEUE)
}

export function getReplayPreamble(language: string): string {
  if (language === 'es') return 'Como prometí, sobre tu duda anterior'
  if (language === 'en') return 'As promised, about your earlier question'
  if (language === 'fr') return 'Comme promis, à propos de votre question précédente'
  return 'Como prometido, sobre sua dúvida anterior'
}
