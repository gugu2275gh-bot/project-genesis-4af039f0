import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { inflate, inflateRaw } from "https://esm.sh/pako@2.1.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const MIN_EXTRACTED_TEXT_LENGTH = 10

/** Extract text operators from a PDF content stream */
function extractTextFromStream(streamText: string): string {
  const parts: string[] = []

  // Extract text from TJ arrays: [(text) -kern (text)] TJ
  const tjRegex = /\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/gi
  let match: RegExpExecArray | null
  while ((match = tjRegex.exec(streamText)) !== null) {
    const inner = match[1]
    const strRegex = /\(([^)]*)\)/g
    let strMatch: RegExpExecArray | null
    const tjParts: string[] = []
    while ((strMatch = strRegex.exec(inner)) !== null) {
      tjParts.push(strMatch[1])
    }
    if (tjParts.length > 0) parts.push(tjParts.join(''))
  }

  // Extract Tj operator: (text) Tj
  const singleTjRegex = /\(([^)]*)\)\s*Tj/gi
  while ((match = singleTjRegex.exec(streamText)) !== null) {
    if (match[1].trim()) parts.push(match[1])
  }

  return parts.join(' ')
}

/** Extract text from PDF bytes (supports FlateDecode without DecompressionStream) */
function extractTextFromPDF(pdfBytes: Uint8Array): string {
  const rawText = new TextDecoder('latin1').decode(pdfBytes)
  const extractedTexts: string[] = []

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null

  while ((match = streamRegex.exec(rawText)) !== null) {
    const headerStart = Math.max(0, match.index - 500)
    const header = rawText.substring(headerStart, match.index)
    const streamContentStr = match[1]

    let streamText = ''

    if (header.includes('FlateDecode')) {
      try {
        const streamBytes = new Uint8Array(streamContentStr.length)
        for (let i = 0; i < streamContentStr.length; i++) {
          streamBytes[i] = streamContentStr.charCodeAt(i) & 0xff
        }

        let decompressed: Uint8Array | null = null
        try {
          decompressed = inflate(streamBytes)
        } catch {
          try {
            decompressed = inflateRaw(streamBytes)
          } catch {
            decompressed = null
          }
        }

        if (decompressed) {
          streamText = new TextDecoder('latin1').decode(decompressed)
        }
      } catch {
        // Ignore decompression errors for individual streams
      }
    } else if (!header.includes('DCTDecode') && !header.includes('JPXDecode')) {
      // Try direct extraction for uncompressed text streams
      streamText = streamContentStr
    }

    if (!streamText) continue

    const text = extractTextFromStream(streamText)
    if (text.trim()) extractedTexts.push(text)
  }

  return extractedTexts.join(' ')
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

    let extractedText = ''
    try {
      extractedText = extractTextFromPDF(pdfBytes)
      console.log(`Basic extraction result: ${extractedText.length} chars`)
    } catch (e) {
      console.error('Basic extraction error:', e)
    }

    // Fallback to OpenAI only if low text extracted
    if (!extractedText || extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
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
          const formData = new FormData()
          const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })
          formData.append('file', pdfBlob, fileName)
          formData.append('purpose', 'assistants')

          console.log('Uploading PDF to OpenAI Files API...')
          const uploadResponse = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData,
          })

          if (!uploadResponse.ok) {
            const uploadErr = await uploadResponse.text()
            console.error('OpenAI file upload failed:', uploadResponse.status, uploadErr)
            throw new Error(`OpenAI upload failed (${uploadResponse.status})`)
          }

          const uploadData = await uploadResponse.json()
          const fileId = uploadData.id
          console.log(`PDF uploaded to OpenAI, file_id: ${fileId}`)

          const aiResponse = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              input: [
                {
                  role: 'system',
                  content: 'Extract ALL text content from this PDF document. Return ONLY the extracted text, preserving original structure and paragraphs. Do not add commentary.',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'input_file', file_id: fileId },
                    { type: 'input_text', text: `Extract all text from "${fileName}".` },
                  ],
                },
              ],
              max_output_tokens: 12000,
            }),
          })

          if (aiResponse.ok) {
            const aiData = await aiResponse.json()
            const aiText = (
              (typeof aiData.output_text === 'string' ? aiData.output_text : '') ||
              aiData.output?.filter((o: any) => o.type === 'message')
                ?.flatMap((o: any) => o.content)
                ?.filter((c: any) => c.type === 'output_text')
                ?.map((c: any) => c.text)
                ?.join('\n') || ''
            ).trim()

            if (aiText.length >= MIN_EXTRACTED_TEXT_LENGTH) {
              extractedText = aiText
              console.log(`OpenAI extraction succeeded: ${extractedText.length} chars`)
            } else {
              console.log(`OpenAI returned insufficient text: ${aiText.length} chars`)
            }
          } else {
            const errText = await aiResponse.text()
            console.error('OpenAI extraction failed:', aiResponse.status, errText)
          }

          // Cleanup uploaded file
          try {
            await fetch(`https://api.openai.com/v1/files/${fileId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${apiKey}` },
            })
          } catch {
            // Ignore cleanup failures
          }
        } catch (aiErr) {
          console.error('OpenAI extraction error:', aiErr instanceof Error ? aiErr.message : aiErr)
        }
      } else {
        console.error('No OpenAI API key found')
      }

      if (!extractedText || extractedText.length < MIN_EXTRACTED_TEXT_LENGTH) {
        return new Response(JSON.stringify({
          error: 'Não foi possível extrair texto deste PDF. Pode ser um PDF escaneado/imagem, protegido ou sem texto legível.'
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    console.log(`Final extracted ${extractedText.length} chars from PDF`)

    await supabaseAdmin
      .from('knowledge_base')
      .delete()
      .eq('file_path', filePath)

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
