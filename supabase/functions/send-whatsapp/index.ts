import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  console.log('send-whatsapp invoked, method:', req.method)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('Auth error:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Authenticated user:', user.email)

    // Check role using service role client to avoid RLS issues
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: userRoles, error: roleError } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)

    if (roleError) {
      console.error('Role check error:', roleError.message)
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar permissões' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const allowedRoles = ['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'ATENDENTE_WHATSAPP', 'SUPERVISOR']
    const hasPermission = userRoles?.some(r => allowedRoles.includes(r.role))
    if (!hasPermission) {
      console.error('Insufficient permissions, user roles:', userRoles)
      return new Response(
        JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { mensagem, numero } = await req.json()

    if (!mensagem || !numero) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros mensagem e numero são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const phoneStr = String(numero).replace(/\D/g, '')
    if (phoneStr.length < 8 || phoneStr.length > 15) {
      return new Response(
        JSON.stringify({ error: 'Número de telefone inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawMessage = String(mensagem ?? '')

    if (rawMessage.length > 4096) {
      return new Response(
        JSON.stringify({ error: 'Mensagem muito longa (máximo 4096 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch WhatsApp API config from system_config using service role (reuse adminSupabase)

    const { data: configs } = await adminSupabase
      .from('system_config')
      .select('key, value')
      .in('key', ['uazapi_url', 'uazapi_token'])

    const configMap: Record<string, string> = {}
    configs?.forEach((c: { key: string; value: string }) => {
      configMap[c.key] = c.value
    })

    const uazapiUrl = configMap['uazapi_url']
    const uazapiToken = configMap['uazapi_token']

    if (!uazapiUrl || !uazapiToken) {
      console.error('WhatsApp API not configured in system_config')
      return new Response(
        JSON.stringify({ error: 'API WhatsApp não configurada. Acesse Configurações > Sistema para configurar.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call WhatsApp API directly to send text message
    const apiUrl = `${uazapiUrl.replace(/\/$/, '')}/send/text`
    console.log('Sending via WhatsApp API:', { phone: phoneStr, apiUrl })

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': uazapiToken,
      },
      body: JSON.stringify({
        number: phoneStr,
        text: rawMessage,
      }),
    })

    const responseData = await response.text()
    console.log('WhatsApp API response:', response.status, responseData)

    if (!response.ok) {
      console.error('WhatsApp API error:', responseData)
      throw new Error(`WhatsApp API retornou status ${response.status}: ${responseData}`)
    }

    return new Response(
      JSON.stringify({ success: true, response: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in send-whatsapp function:', errorMessage)
    return new Response(
      JSON.stringify({ error: 'Erro ao enviar mensagem: ' + errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
