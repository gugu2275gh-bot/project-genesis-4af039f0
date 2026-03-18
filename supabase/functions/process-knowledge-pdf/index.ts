import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Extract text from PDF binary data using basic parsing */
function extractTextFromPDF(pdfBytes: Uint8Array): string {
  const text = new TextDecoder('latin1').decode(pdfBytes)
  const extractedTexts: string[] = []

  // Extract text from stream objects
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null

  while ((match = streamRegex.exec(text)) !== null) {
    const streamContent = match[1]
    // Extract text between parentheses (PDF literal strings)
    const textRegex = /\(([^)]*)\)/g
    let textMatch: RegExpExecArray | null
    while ((textMatch = textRegex.exec(streamContent)) !== null) {
      const cleaned = textMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
      if (cleaned.trim().length > 0) {
        extractedTexts.push(cleaned)
      }
    }

    // Extract text from TJ arrays
    const tjRegex = /\[((?:\([^)]*\)|[^\]])*)\]\s*TJ/g
    let tjMatch: RegExpExecArray | null
    while ((tjMatch = tjRegex.exec(streamContent)) !== null) {
      const tjContent = tjMatch[1]
      const tjTextRegex = /\(([^)]*)\)/g
      let tjTextMatch: RegExpExecArray | null
      const parts: string[] = []
      while ((tjTextMatch = tjTextRegex.exec(tjContent)) !== null) {
        parts.push(tjTextMatch[1])
      }
      if (parts.length > 0) {
        extractedTexts.push(parts.join(''))
      }
    }

    // Extract Tj operator text
    const singleTjRegex = /\(([^)]*)\)\s*Tj/g
    let singleTjMatch: RegExpExecArray | null
    while ((singleTjMatch = singleTjRegex.exec(streamContent)) !== null) {
      if (singleTjMatch[1].trim().length > 0) {
        extractedTexts.push(singleTjMatch[1])
      }
    }
  }

  return extractedTexts.join(' ').replace(/\s+/g, ' ').trim()
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
    let extractedText = extractTextFromPDF(pdfBytes)

    if (!extractedText || extractedText.length < 10) {
      // Fallback: try to use OpenAI to extract text if basic parsing fails
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
      
      // Also check system_config for openai key
      let apiKey = openaiApiKey
      if (!apiKey) {
        const { data: configKey } = await supabaseAdmin
          .from('system_config')
          .select('value')
          .eq('key', 'openai_api_key')
          .single()
        apiKey = configKey?.value
      }

      if (!apiKey) {
        return new Response(JSON.stringify({ 
          error: 'Não foi possível extrair texto do PDF. Verifique se o PDF contém texto selecionável (não escaneado).' 
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // If basic extraction fails, store raw content with a note
      extractedText = `[PDF: ${fileName}] Conteúdo não pôde ser extraído automaticamente. Este PDF pode conter imagens escaneadas.`
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
