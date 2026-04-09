import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio'
const TWILIO_FROM_NUMBER = 'whatsapp:+34654378464'

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

    // Twilio gateway credentials
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured')
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY')
    if (!TWILIO_API_KEY) {
      console.error('TWILIO_API_KEY is not configured')
      return new Response(
        JSON.stringify({ error: 'TWILIO_API_KEY não configurada. Conecte o Twilio nas configurações.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    const allowedRoles = ['ADMIN', 'MANAGER', 'ATENCAO_CLIENTE', 'ATENDENTE_WHATSAPP', 'SUPERVISOR', 'JURIDICO', 'FINANCEIRO', 'TECNICO', 'EXPEDIENTE', 'DIRETORIA']
    const hasPermission = userRoles?.some(r => allowedRoles.includes(r.role))
    if (!hasPermission) {
      console.error('Insufficient permissions, user roles:', userRoles)
      return new Response(
        JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { mensagem, numero, sector, contact_id, mediaUrl, contentSid } = await req.json()

    // If it's a template send (contentSid), only require numero
    if (contentSid) {
      if (!numero) {
        return new Response(
          JSON.stringify({ error: 'Parâmetro numero é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (!mensagem || !numero) {
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

    // Send via Twilio WhatsApp Gateway
    console.log('Sending via Twilio WhatsApp Gateway:', { phone: phoneStr, hasContentSid: !!contentSid })

    const twilioParams: Record<string, string> = {
      To: `whatsapp:+${phoneStr}`,
      From: TWILIO_FROM_NUMBER,
    }

    if (contentSid) {
      // Template send - use ContentSid instead of Body
      twilioParams.ContentSid = contentSid
      twilioParams.ContentVariables = JSON.stringify({ "1": "Cliente" })
      console.log('Sending template with ContentSid:', contentSid)
    } else {
      twilioParams.Body = rawMessage
      // Add media URL if provided
      if (mediaUrl) {
        twilioParams.MediaUrl = mediaUrl
        console.log('Sending with media:', mediaUrl)
      }
    }

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(twilioParams),
    })

    const responseData = await response.text()
    console.log('Twilio Gateway response:', response.status, responseData)

    if (!response.ok) {
      // Check for 63016 error (outside 24h window) - try template fallback
      if (responseData.includes('63016')) {
        console.log('Error 63016 detected, attempting template fallback...')
        
        // Look for a generic approved template
        const { data: fallbackTemplate } = await adminSupabase
          .from('whatsapp_templates')
          .select('content_sid')
          .eq('status', 'approved')
          .eq('is_active', true)
          .eq('automation_type', 'welcome')
          .single()

        if (fallbackTemplate?.content_sid) {
          console.log('Using fallback template:', fallbackTemplate.content_sid)
          const fallbackResponse = await fetch(`${GATEWAY_URL}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': TWILIO_API_KEY,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: `whatsapp:+${phoneStr}`,
              From: TWILIO_FROM_NUMBER,
              ContentSid: fallbackTemplate.content_sid,
              ContentVariables: JSON.stringify({ "1": "Cliente" }),
            }),
          })

          const fallbackData = await fallbackResponse.text()
          if (fallbackResponse.ok) {
            console.log('Template fallback sent successfully')
            // Continue to context update below
          } else {
            console.error('Template fallback also failed:', fallbackData)
            throw new Error(`Fora da janela de 24h e template de fallback falhou: ${fallbackData}`)
          }
        } else {
          throw new Error('Fora da janela de 24h do WhatsApp. Nenhum template aprovado disponível para fallback. Configure templates em Configurações > WhatsApp.')
        }
      } else {
        console.error('Twilio Gateway error:', responseData)
        throw new Error(`Twilio API retornou status ${response.status}: ${responseData}`)
      }
    }

    // ========== UPDATE CUSTOMER CHAT CONTEXT ==========
    let effectiveSector = sector || null

    if (!effectiveSector) {
      const { data: userSectorData } = await adminSupabase
        .from('user_sectors')
        .select('sector_id, service_sectors(name)')
        .eq('user_id', user.id)
        .limit(1)

      if (userSectorData?.length) {
        const sectorRow = userSectorData[0] as { sector_id: string; service_sectors: { name: string } | null }
        effectiveSector = sectorRow.service_sectors?.name || null
      }

      if (!effectiveSector && userRoles?.length) {
        const roleToSector: Record<string, string> = {
          JURIDICO: 'Jurídico',
          FINANCEIRO: 'Financeiro',
          TECNICO: 'Técnico',
          ATENCAO_CLIENTE: 'Atenção ao Cliente',
          ATENDENTE_WHATSAPP: 'Atenção ao Cliente',
        }
        for (const r of userRoles) {
          if (roleToSector[r.role]) {
            effectiveSector = roleToSector[r.role]
            break
          }
        }
      }
    }

    let resolvedContactId = contact_id || null
    if (!resolvedContactId) {
      const { data: contactData } = await adminSupabase
        .from('contacts')
        .select('id')
        .eq('phone', phoneStr)
        .limit(1)
      if (contactData?.length) {
        resolvedContactId = contactData[0].id
      }
    }

    if (resolvedContactId && effectiveSector) {
      console.log('Updating chat context:', { contactId: resolvedContactId, sector: effectiveSector })

      const now = new Date().toISOString()

      const { data: existingCtx } = await adminSupabase
        .from('customer_chat_context')
        .select('*')
        .eq('contact_id', resolvedContactId)
        .single()

      if (existingCtx) {
        const setoresAtivos = (existingCtx.setores_ativos as Array<{ setor: string; user_id: string; last_sent_at: string }>) || []
        const existingIdx = setoresAtivos.findIndex(s => s.setor === effectiveSector)

        if (existingIdx >= 0) {
          setoresAtivos[existingIdx].last_sent_at = now
          setoresAtivos[existingIdx].user_id = user.id
        } else {
          setoresAtivos.push({ setor: effectiveSector, user_id: user.id, last_sent_at: now })
        }

        const lockExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()

        await adminSupabase
          .from('customer_chat_context')
          .update({
            ultimo_setor: effectiveSector,
            setores_ativos: setoresAtivos,
            ultima_interacao: now,
            updated_at: now,
            setor_travado: effectiveSector,
            lock_expira_em: lockExpiry,
          })
          .eq('contact_id', resolvedContactId)
      } else {
        const newLockExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()
        await adminSupabase
          .from('customer_chat_context')
          .insert({
            contact_id: resolvedContactId,
            ultimo_setor: effectiveSector,
            setores_ativos: [{ setor: effectiveSector, user_id: user.id, last_sent_at: now }],
            ultima_interacao: now,
            setor_travado: effectiveSector,
            lock_expira_em: newLockExpiry,
          })
      }

      console.log('Chat context updated successfully')
    } else {
      console.log('Skipping chat context update:', { hasContactId: !!resolvedContactId, hasSector: !!effectiveSector })
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
