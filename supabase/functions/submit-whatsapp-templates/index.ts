import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const CONTENT_API_URL = 'https://content.twilio.com/v1/Content'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: 'TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN não configurados. Adicione-os como secrets do Supabase.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const basicAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    // Auth check
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Role check
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: userRoles } = await adminSupabase.from('user_roles').select('role').eq('user_id', user.id)
    const isAdmin = userRoles?.some(r => ['ADMIN', 'MANAGER'].includes(r.role))
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { action, automation_type } = body

    // ACTION: submit - Submit template(s) for approval via Twilio Content API
    if (action === 'submit') {
      const query = adminSupabase.from('whatsapp_templates').select('*')
      if (automation_type && automation_type !== 'ALL') {
        query.eq('automation_type', automation_type)
      }
      const { data: templates, error: fetchError } = await query
      if (fetchError) throw fetchError

      const results = []
      for (const template of templates || []) {
        if (template.content_sid && template.status === 'approved') {
          results.push({ automation_type: template.automation_type, status: 'already_approved', content_sid: template.content_sid })
          continue
        }

        const contentBody = {
          friendly_name: template.template_name,
          language: 'pt_BR',
          types: {
            'twilio/text': {
              body: template.body_text,
            },
          },
          content_type: 'twilio/text',
        }

        console.log(`Submitting template: ${template.template_name}`)

        const response = await fetch(CONTENT_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contentBody),
        })

        const responseData = await response.json()
        console.log(`Template ${template.template_name} response:`, response.status, JSON.stringify(responseData))

        if (response.ok && responseData.sid) {
          await adminSupabase.from('whatsapp_templates').update({
            content_sid: responseData.sid,
            status: 'pending',
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          results.push({ automation_type: template.automation_type, status: 'submitted', content_sid: responseData.sid })
        } else {
          await adminSupabase.from('whatsapp_templates').update({
            status: 'error',
            rejection_reason: responseData.message || JSON.stringify(responseData),
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          results.push({ automation_type: template.automation_type, status: 'error', error: responseData.message || 'Unknown error' })
        }
      }

      return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: check_status - Check approval status via Twilio Content API
    if (action === 'check_status') {
      const { data: templates } = await adminSupabase
        .from('whatsapp_templates')
        .select('*')
        .not('content_sid', 'is', null)
        .eq('status', 'pending')

      const results = []
      for (const template of templates || []) {
        const response = await fetch(`${CONTENT_API_URL}/${template.content_sid}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
          },
        })

        const data = await response.json()
        console.log(`Status check for ${template.template_name}:`, JSON.stringify(data))

        let newStatus = template.status
        let rejectionReason = null

        if (data.approval_requests) {
          const approval = data.approval_requests
          if (approval.status === 'approved') {
            newStatus = 'approved'
          } else if (approval.status === 'rejected') {
            newStatus = 'rejected'
            rejectionReason = approval.rejection_reason || 'Rejected by Meta'
          }
        }

        if (newStatus !== template.status) {
          await adminSupabase.from('whatsapp_templates').update({
            status: newStatus,
            rejection_reason: rejectionReason,
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)
        }

        results.push({ automation_type: template.automation_type, status: newStatus, content_sid: template.content_sid })
      }

      return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "submit" or "check_status"' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
