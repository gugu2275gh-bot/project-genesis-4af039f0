import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/** Extract visible text from PDF without decompression (uncompressed streams only) */
function extractBasicText(pdfBytes: Uint8Array): string {
  const rawText = new TextDecoder('latin1').decode(pdfBytes)
  const parts: string[] = []

  // Extract text from uncompressed streams using Tj/TJ operators
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null

  while ((match = streamRegex.exec(rawText)) !== null) {
    // Check if this stream is NOT compressed (skip FlateDecode streams)
    const headerStart = Math.max(0, match.index - 500)
    const header = rawText.substring(headerStart, match.index)
    if (header.includes('FlateDecode') || header.includes('DCTDecode') || header.includes('JPXDecode')) {
      continue
    }

    const content = match[1]
    
    // TJ arrays
    const tjRegex = /\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/gi
    let tjMatch: RegExpExecArray | null
    while ((tjMatch = tjRegex.exec(content)) !== null) {
      const strRegex = /\(([^)]*)\)/g
      let strMatch: RegExpExecArray | null
      const tjParts: string[] = []
      while ((strMatch = strRegex.exec(tjMatch[1])) !== null) {
        tjParts.push(strMatch[1])
      }
      if (tjParts.length > 0) parts.push(tjParts.join(''))
    }

    // Single Tj
    const singleTjRegex = /\(([^)]*)\)\s*Tj/gi
    let sjMatch: RegExpExecArray | null
    while ((sjMatch = singleTjRegex.exec(content)) !== null) {
      if (sjMatch[1].trim()) parts.push(sjMatch[1])
    }
  }

  return parts.join(' ')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\x00/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Encode Uint8Array to base64 without stack overflow */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j])
    }
  }
  return btoa(binary)
}

/** Split text into chunks */
function chunkText(text: string, maxChars = 2000): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('. ', maxChars)
    if (splitAt < maxChars / 2) {
      splitAt = remaining.lastIndexOf(' ', maxChars)
    }
    if (splitAt < maxChars / 2) {
      splitAt = maxChars
    }

    chunks.push(remaining.slice(0, splitAt + 1).trim())
    remaining = remaining.slice(splitAt + 1).trim()
  }

  return chunks
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'ADMIN')
      .single()

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { filePath, fileName } = await req.json()

    if (!filePath || !fileName) {
      return new Response(JSON.stringify({ error: 'filePath and fileName required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Processing PDF:', fileName, 'at', filePath)

    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('knowledge-base')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError)
      return new Response(JSON.stringify({ error: 'Failed to download file' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer())
    
    // Try basic extraction first (uncompressed streams only - no DecompressionStream)
    let extractedText = ''
    try {
      extractedText = extractBasicText(pdfBytes)
      console.log(`Basic extraction result: ${extractedText.length} chars`)
    } catch (e) {
      console.error('Basic extraction error:', e)
    }

    // If basic extraction insufficient, use OpenAI to read the PDF
    if (!extractedText || extractedText.length < 50) {
      console.log('Basic extraction insufficient, using OpenAI to extract text...')
      
      let apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) {
        const { data: configKey } = await supabaseAdmin
          .from('system_config')
          .select('value')
          .eq('key', 'openai_api_key')
          .single()
        apiKey = configKey?.value || null
      }

      if (apiKey) {
        try {
          const base64Pdf = uint8ToBase64(pdfBytes)
          console.log(`PDF base64 size: ${base64Pdf.length} chars`)
          
          const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Extract ALL text content from this PDF document. Return ONLY the extracted text, preserving the original structure and paragraphs. Do not add any commentary.',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: `Extract all text from this PDF document named "${fileName}":` },
                    {
                      type: 'image_url',
                      image_url: { url: `data:application/pdf;base64,${base64Pdf}` },
                    },
                  ],
                },
              ],
              max_tokens: 16000,
            }),
          })

          if (aiResponse.ok) {
            const aiData = await aiResponse.json()
            const aiText = aiData.choices?.[0]?.message?.content?.trim()
            if (aiText && aiText.length > 50) {
              extractedText = aiText
              console.log(`OpenAI extraction succeeded: ${extractedText.length} chars`)
            } else {
              console.log('OpenAI returned insufficient text')
            }
          } else {
            const errText = await aiResponse.text()
            console.error('OpenAI extraction failed:', aiResponse.status, errText)
          }
        } catch (aiErr) {
          console.error('OpenAI extraction error:', aiErr instanceof Error ? aiErr.message : aiErr)
        }
      } else {
        console.error('No OpenAI API key found')
      }

      if (!extractedText || extractedText.length < 50) {
        return new Response(JSON.stringify({ 
          error: 'Não foi possível extrair texto do PDF. Verifique se a chave da OpenAI está configurada em Configurações > Sistema.' 
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    console.log(`Final extracted ${extractedText.length} chars from PDF`)

    // Delete any existing entries for this file
    await supabaseAdmin
      .from('knowledge_base')
      .delete()
      .eq('file_path', filePath)

    // Chunk and store
    const chunks = chunkText(extractedText)
    console.log(`Split into ${chunks.length} chunks`)

    for (let i = 0; i < chunks.length; i++) {
      const { error: insertError } = await supabaseAdmin
        .from('knowledge_base')
        .insert({
          file_name: fileName,
          file_path: filePath,
          content: chunks[i],
          chunk_index: i,
          created_by_user_id: user.id,
          is_active: true,
        })

      if (insertError) {
        console.error('Insert error for chunk', i, ':', insertError)
        throw insertError
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      chunks: chunks.length,
      totalChars: extractedText.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Process PDF error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
