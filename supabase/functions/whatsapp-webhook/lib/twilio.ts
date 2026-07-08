// @ts-nocheck
// Wave 3b step 7: Twilio gateway + media placeholder
import type { ChatLanguage } from './language.ts'

export function getMediaPlaceholder(mediaType: string, language: ChatLanguage): string {
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

/**
 * Sanitiza sequências de pontuação estranhas que às vezes surgem quando a IA
 * concatena um canonical já finalizado com "?" adicional
 * (ex.: "(exemplo: 22/05/2025).?" → "(exemplo: 22/05/2025)?").
 */
export function sanitizeOutgoingText(text: string): string {
  if (!text) return text
  return text
    .replace(/([)\]\d])\s*\.\s*\?/g, '$1?')
    .replace(/\s+\?/g, '?')
    .replace(/\?\s*\?+/g, '?')
    .replace(/\.\s*\?/g, '?')
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio'
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')

  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    console.error('Twilio Gateway credentials not configured')
    throw new Error('Twilio Gateway not configured')
  }

  const TWILIO_FROM_NUMBER = 'whatsapp:+34654378464'
  const cleanMessage = sanitizeOutgoingText(message)
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
      Body: cleanMessage,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Twilio Gateway send error:', errorText)
    throw new Error(`Twilio API error: ${response.status}`)
  }

  console.log('Message sent successfully via Twilio')
}

/**
 * Envia uma mensagem via Twilio Content Template (ex: quick reply buttons).
 * Requer um ContentSid já aprovado no Twilio/Meta.
 */
export async function sendTwilioContentTemplate(
  phone: string,
  contentSid: string,
  contentVariables?: Record<string, string>,
): Promise<void> {
  const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio'
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
    throw new Error('Twilio Gateway not configured')
  }
  const TWILIO_FROM_NUMBER = 'whatsapp:+34654378464'
  const body: Record<string, string> = {
    To: `whatsapp:+${phone}`,
    From: TWILIO_FROM_NUMBER,
    ContentSid: contentSid,
  }
  if (contentVariables && Object.keys(contentVariables).length > 0) {
    body.ContentVariables = JSON.stringify(contentVariables)
  }
  console.log('Sending Twilio Content Template:', { phone, contentSid })
  const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TWILIO_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Twilio Gateway template send error:', errorText)
    throw new Error(`Twilio API error: ${response.status}`)
  }
  console.log('Template sent successfully via Twilio:', contentSid)
}

/**
 * Normaliza texto para comparação de duplicidade:
 * - lowercase, remove acentos, colapsa espaços, strip pontuação repetida.
 */
export function normalizeForDedup(text: string): string {
  if (!text) return ''
  return sanitizeOutgoingText(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s?!.,]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Envio idempotente + guarda de near-duplicate.
 *
 * Estratégia:
 *  1. Guarda cross-process: insere hash em `message_dedup` (unique). Se conflito → skip.
 *     Hash cobre janela de 60s (bucket temporal) por lead+conteúdo normalizado.
 *  2. Guarda near-duplicate: consulta `mensagens_cliente` últimos 90s do mesmo lead
 *     e compara conteúdo normalizado; se idêntico → skip.
 *  3. Se passar nas duas, chama sendWhatsAppMessage.
 *
 * Retorna { sent: boolean, reason?: string }.
 */
export async function sendOutgoingIdempotent(
  supabase: any,
  args: { phone: string; leadId: string | null; body: string; windowSeconds?: number },
): Promise<{ sent: boolean; reason?: string }> {
  const { phone, leadId, body } = args
  const windowSec = args.windowSeconds ?? 60
  const norm = normalizeForDedup(body)
  if (!norm) return { sent: false, reason: 'empty_body' }

  const bucket = Math.floor(Date.now() / (windowSec * 1000))
  const dedupKey = `out:${leadId || 'nolead'}:${phone}:${bucket}:${norm.slice(0, 500)}`
  const hash = await sha256Hex(dedupKey)

  // (1) idempotência via unique constraint
  const { error: dupErr } = await supabase
    .from('message_dedup')
    .insert({ message_id: `send:${hash}` })
  if (dupErr) {
    const msg = String(dupErr.message || '')
    if (msg.includes('duplicate') || msg.includes('unique') || (dupErr as any).code === '23505') {
      console.log('[SEND_DEDUP] skipping duplicate (hash hit):', hash.slice(0, 12))
      return { sent: false, reason: 'dedup_hash' }
    }
    console.warn('[SEND_DEDUP] message_dedup insert failed (continuing):', msg)
  }

  // (2) near-duplicate: última mensagem IA/ROUTING nos últimos 90s
  if (leadId) {
    const since = new Date(Date.now() - 90_000).toISOString()
    const { data: recents } = await supabase
      .from('mensagens_cliente')
      .select('mensagem_IA, created_at')
      .eq('id_lead', leadId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5)
    if (Array.isArray(recents)) {
      for (const r of recents) {
        const txt = (r as any).mensagem_IA || ''
        if (!txt) continue
        if (normalizeForDedup(txt) === norm) {
          console.log('[SEND_DEDUP] skipping near-duplicate (last 90s match)')
          return { sent: false, reason: 'near_duplicate' }
        }
      }
    }
  }

  await sendWhatsAppMessage(phone, body)
  return { sent: true }
}
