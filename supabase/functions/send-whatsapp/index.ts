import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WEBHOOK_URL = 'https://webhook.robertobarros.ai/webhook/enviamsgccse';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message || 'No user found')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has required role (ADMIN or ATENCAO_CLIENTE)
    const { data: hasRole, error: roleError } = await supabase
      .rpc('has_any_role', {
        _user_id: user.id,
        _roles: ['ADMIN', 'ATENCAO_CLIENTE']
      })

    if (roleError || !hasRole) {
      console.error('Role check failed:', roleError?.message || 'User lacks required role')
      return new Response(
        JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { mensagem, numero } = await req.json()

    console.log('Authenticated request from user:', user.id)
    console.log('Received request:', { mensagem, numero: numero ? '***' : null })

    // Input validation
    if (!mensagem || !numero) {
      console.error('Missing parameters:', { hasMensagem: !!mensagem, hasNumero: !!numero })
      return new Response(
        JSON.stringify({ error: 'Parâmetros mensagem e numero são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate phone number format (basic validation for numeric string)
    const phoneStr = String(numero).replace(/\D/g, '')
    if (phoneStr.length < 8 || phoneStr.length > 15) {
      console.error('Invalid phone number format')
      return new Response(
        JSON.stringify({ error: 'Número de telefone inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawMessage = String(mensagem ?? '')

    // Normalize line breaks and remove them for webhook compatibility
    // (Some WhatsApp/N8N providers fail to deliver messages containing actual newlines)
    const normalizedMessage = rawMessage.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const messageForWebhook = normalizedMessage.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()

    console.log('Message formatting:', {
      hadNewlines: normalizedMessage.includes('\n'),
      originalLength: rawMessage.length,
      webhookLength: messageForWebhook.length,
    })

    // Validate message length
    if (messageForWebhook.length > 4096) {
      console.error('Message too long')
      return new Response(
        JSON.stringify({ error: 'Mensagem muito longa (máximo 4096 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call the N8N webhook
    console.log('Calling webhook for authenticated user:', user.id)
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: messageForWebhook, numero: phoneStr })
    })

    console.log('Webhook response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Webhook error:', errorText)
      throw new Error(`Webhook retornou status ${response.status}`)
    }

    const responseData = await response.text()
    console.log('Webhook response received successfully')

    return new Response(
      JSON.stringify({ success: true, webhookResponse: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-whatsapp function:', errorMessage)
    return new Response(
      JSON.stringify({ error: 'Erro ao enviar mensagem' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
