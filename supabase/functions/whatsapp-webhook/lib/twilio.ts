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
