import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Decompress FlateDecode (zlib/deflate) stream data */
async function decompressFlate(data: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream('deflate')
    const writer = ds.writable.getWriter()
    const reader = ds.readable.getReader()
    
    const chunks: Uint8Array[] = []
    const readAll = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
    })()
    
    await writer.write(data)
    await writer.close()
    await readAll
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  } catch {
    // Try raw deflate (without zlib header)
    try {
      const ds = new DecompressionStream('raw')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()
      
      const chunks: Uint8Array[] = []
      const readAll = (async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      })()
      
      await writer.write(data)
      await writer.close()
      await readAll
      
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      return result
    } catch {
      return data // Return as-is if decompression fails
    }
  }
}

/** Extract text operators from a decompressed PDF content stream */
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

/** Extract text from PDF binary data with stream decompression */
async function extractTextFromPDF(pdfBytes: Uint8Array): Promise<string> {
  const rawText = new TextDecoder('latin1').decode(pdfBytes)
  const extractedTexts: string[] = []

  // Find all stream objects
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null
  const streamPositions: Array<{ start: number; end: number }> = []

  while ((match = streamRegex.exec(rawText)) !== null) {
    streamPositions.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  for (const pos of streamPositions) {
    // Check if this stream uses FlateDecode by looking at the object header before it
    const headerStart = Math.max(0, pos.start - 500)
    const header = rawText.substring(headerStart, pos.start)
    const isFlate = header.includes('FlateDecode')
    
    // Get raw stream bytes
    const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(rawText.substring(pos.start))
    if (!streamMatch) continue
    
    const streamContentStr = streamMatch[1]
    
    if (isFlate) {
      // Convert latin1 string back to bytes for decompression
      const streamBytes = new Uint8Array(streamContentStr.length)
      for (let i = 0; i < streamContentStr.length; i++) {
        streamBytes[i] = streamContentStr.charCodeAt(i)
      }
      
      try {
        const decompressed = await decompressFlate(streamBytes)
        const decompressedText = new TextDecoder('latin1').decode(decompressed)
        const text = extractTextFromStream(decompressedText)
        if (text.trim()) extractedTexts.push(text)
      } catch {
        // Skip failed decompressions
      }
    } else {
      // Try direct text extraction from uncompressed stream
      const text = extractTextFromStream(streamContentStr)
      if (text.trim()) extractedTexts.push(text)
    }
  }

  let result = extractedTexts.join(' ')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\x00/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return result
}

/** Split text into chunks of roughly maxChars characters at sentence boundaries */
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

    // Verify user is admin
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

    // Download the PDF from storage
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

    // Extract text from PDF
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer())
    let extractedText = await extractTextFromPDF(pdfBytes)

    console.log(`Basic extraction result: ${extractedText.length} chars`)

    if (!extractedText || extractedText.length < 50) {
      console.log('Basic extraction failed or too short, trying AI fallback...')
      
      // Fallback: use OpenAI to extract text via base64
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
          // Convert PDF to base64
          const base64Pdf = btoa(String.fromCharCode(...pdfBytes))
          
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
                  content: 'Extract ALL text content from this PDF document. Return ONLY the extracted text, preserving the original structure and paragraphs. Do not add any commentary or formatting beyond what exists in the document.',
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
              console.log(`AI extraction succeeded: ${extractedText.length} chars`)
            }
          } else {
            const errText = await aiResponse.text()
            console.error('AI extraction failed:', aiResponse.status, errText)
          }
        } catch (aiErr) {
          console.error('AI extraction error:', aiErr instanceof Error ? aiErr.message : aiErr)
        }
      }

      if (!extractedText || extractedText.length < 50) {
        return new Response(JSON.stringify({ 
          error: 'Não foi possível extrair texto do PDF. Verifique se o PDF contém texto selecionável (não escaneado).' 
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    console.log(`Extracted ${extractedText.length} chars from PDF`)

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
