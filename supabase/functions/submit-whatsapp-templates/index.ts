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

    // Helper to insert log
    async function insertLog(logData: {
      template_id?: string | null,
      template_name: string,
      action: string,
      status: string,
      request_payload?: any,
      response_payload?: any,
      error_message?: string | null,
      twilio_status_code?: number | null,
      content_sid?: string | null,
    }) {
      try {
        await adminSupabase.from('whatsapp_template_logs').insert({
          ...logData,
          user_id: user.id,
          request_payload: logData.request_payload ? JSON.parse(JSON.stringify(logData.request_payload)) : null,
          response_payload: logData.response_payload ? JSON.parse(JSON.stringify(logData.response_payload)) : null,
        })
      } catch (e) {
        console.error('Failed to insert log:', e)
      }
    }

    // ACTION: submit
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
          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'submit',
            status: 'skipped',
            request_payload: null,
            response_payload: null,
            error_message: 'Template já aprovado',
            twilio_status_code: null,
            content_sid: template.content_sid,
          })
          results.push({ automation_type: template.automation_type, status: 'already_approved', content_sid: template.content_sid })
          continue
        }

        const contentBody = {
          friendly_name: template.template_name,
          language: template.language || 'pt_BR',
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

          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'submit',
            status: 'success',
            request_payload: contentBody,
            response_payload: responseData,
            twilio_status_code: response.status,
            content_sid: responseData.sid,
          })

          results.push({ automation_type: template.automation_type, status: 'submitted', content_sid: responseData.sid })
        } else {
          await adminSupabase.from('whatsapp_templates').update({
            status: 'error',
            rejection_reason: responseData.message || JSON.stringify(responseData),
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'submit',
            status: 'error',
            request_payload: contentBody,
            response_payload: responseData,
            error_message: responseData.message || JSON.stringify(responseData),
            twilio_status_code: response.status,
          })

          results.push({ automation_type: template.automation_type, status: 'error', error: responseData.message || 'Unknown error' })
        }
      }

      return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: check_status
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

        await insertLog({
          template_id: template.id,
          template_name: template.template_name,
          action: 'check_status',
          status: newStatus !== template.status ? 'success' : 'skipped',
          request_payload: { url: `${CONTENT_API_URL}/${template.content_sid}`, method: 'GET' },
          response_payload: data,
          error_message: rejectionReason,
          twilio_status_code: response.status,
          content_sid: template.content_sid,
        })

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
