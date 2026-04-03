import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { audioUrl, messageId } = await req.json()

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: 'audioUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiKey = Deno.env.get('CBAsesoria_Key')
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'AI key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the audio file
    let audioBuffer: ArrayBuffer
    let mimeType = 'audio/ogg'

    // Check if it's a Twilio URL that needs auth
    if (audioUrl.includes('api.twilio.com')) {
      const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
      const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      const resp = await fetch(audioUrl, {
        headers: { Authorization: `Basic ${authHeader}` },
      })
      if (!resp.ok) throw new Error(`Twilio fetch failed: ${resp.status}`)
      const ct = resp.headers.get('content-type')?.split(';')[0].trim()
      if (ct) mimeType = ct
      audioBuffer = await resp.arrayBuffer()
    } else {
      const resp = await fetch(audioUrl)
      if (!resp.ok) throw new Error(`Audio fetch failed: ${resp.status}`)
      const ct = resp.headers.get('content-type')?.split(';')[0].trim()
      if (ct) mimeType = ct
      audioBuffer = await resp.arrayBuffer()
    }

    // Convert to base64
    const uint8 = new Uint8Array(audioBuffer)
    let binary = ''
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i])
    }
    const base64Audio = btoa(binary)

    console.log('Audio fetched, size:', audioBuffer.byteLength, 'mime:', mimeType)

    // Send to Gemini for transcription
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: 'Você é um transcritor de áudio. Transcreva o áudio recebido fielmente, mantendo o idioma original do falante. Retorne APENAS o texto transcrito, sem comentários adicionais. Se o áudio estiver inaudível ou vazio, responda "[áudio inaudível]".',
            }],
          },
          contents: [{
            role: 'user',
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Audio,
                },
              },
              { text: 'Transcreva este áudio.' },
            ],
          }],
          generationConfig: { maxOutputTokens: 2000 },
        }),
      }
    )

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      console.error('Gemini transcription error:', geminiResponse.status, errText)
      throw new Error(`Gemini API error: ${geminiResponse.status}`)
    }

    const geminiData = await geminiResponse.json()
    const transcription = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[áudio inaudível]'

    console.log('Transcription result:', transcription.substring(0, 200))

    // If messageId provided, update the message in the database
    if (messageId) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      await supabase
        .from('mensagens_cliente')
        .update({ mensagem_cliente: transcription })
        .eq('id', messageId)

      console.log('Updated message', messageId, 'with transcription')
    }

    return new Response(JSON.stringify({ transcription }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Transcription error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
