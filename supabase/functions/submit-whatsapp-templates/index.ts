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
      return new Response(JSON.stringify({ error: 'TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN não configurados.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

    // Helper to submit approval request to Meta
    async function submitApprovalRequest(template: any, contentSid: string): Promise<{ success: boolean; error?: string; statusCode?: number; responseData?: any }> {
      const metaCategory = template.meta_category || 'UTILITY'
      const approvalBody = {
        name: template.template_name,
        category: metaCategory,
      }

      console.log(`Submitting approval request for ${template.template_name} (SID: ${contentSid}, category: ${metaCategory})`)

      const approvalResponse = await fetch(`${CONTENT_API_URL}/${contentSid}/ApprovalRequests/whatsapp`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(approvalBody),
      })

      const approvalData = await approvalResponse.json()
      console.log(`Approval response for ${template.template_name}:`, approvalResponse.status, JSON.stringify(approvalData))

      await insertLog({
        template_id: template.id,
        template_name: template.template_name,
        action: 'approval_request',
        status: approvalResponse.ok ? 'success' : 'error',
        request_payload: { url: `${CONTENT_API_URL}/${contentSid}/ApprovalRequests/whatsapp`, body: approvalBody },
        response_payload: approvalData,
        error_message: approvalResponse.ok ? null : (approvalData.message || JSON.stringify(approvalData)),
        twilio_status_code: approvalResponse.status,
        content_sid: contentSid,
      })

      if (approvalResponse.ok) {
        return { success: true, statusCode: approvalResponse.status, responseData: approvalData }
      } else {
        return { success: false, error: approvalData.message || JSON.stringify(approvalData), statusCode: approvalResponse.status, responseData: approvalData }
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
        // Skip already approved templates
        if (template.content_sid && template.status === 'approved') {
          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'submit',
            status: 'skipped',
            error_message: 'Template já aprovado',
            content_sid: template.content_sid,
          })
          results.push({ automation_type: template.automation_type, status: 'already_approved', content_sid: template.content_sid })
          continue
        }

        let contentSid = template.content_sid

        // Step 1: Create Content Template (only if no SID yet)
        if (!contentSid) {
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

          console.log(`Step 1: Creating content template: ${template.template_name}`)

          const response = await fetch(CONTENT_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(contentBody),
          })

          const responseData = await response.json()
          console.log(`Content creation response for ${template.template_name}:`, response.status, JSON.stringify(responseData))

          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'create_content',
            status: response.ok ? 'success' : 'error',
            request_payload: contentBody,
            response_payload: responseData,
            error_message: response.ok ? null : (responseData.message || JSON.stringify(responseData)),
            twilio_status_code: response.status,
            content_sid: responseData.sid || null,
          })

          if (!response.ok || !responseData.sid) {
            // Content creation failed
            await adminSupabase.from('whatsapp_templates').update({
              status: 'error',
              rejection_reason: responseData.message || JSON.stringify(responseData),
              updated_at: new Date().toISOString(),
            }).eq('id', template.id)

            results.push({ automation_type: template.automation_type, status: 'error', error: responseData.message || 'Content creation failed' })
            continue
          }

          contentSid = responseData.sid

          // Save the content_sid immediately
          await adminSupabase.from('whatsapp_templates').update({
            content_sid: contentSid,
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)
        } else {
          console.log(`Step 1 skipped: ${template.template_name} already has SID ${contentSid}, proceeding to approval`)
        }

        // Step 2: Submit for Meta approval
        const approvalResult = await submitApprovalRequest(template, contentSid)

        if (approvalResult.success) {
          await adminSupabase.from('whatsapp_templates').update({
            status: 'pending',
            rejection_reason: null,
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          results.push({ automation_type: template.automation_type, status: 'submitted', content_sid: contentSid })
        } else {
          // Approval request failed — mark as draft so it can be resubmitted
          await adminSupabase.from('whatsapp_templates').update({
            status: 'draft',
            rejection_reason: `Aprovação falhou: ${approvalResult.error}`,
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          results.push({ automation_type: template.automation_type, status: 'error', error: approvalResult.error })
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
        // Correct endpoint: GET /v1/Content/{SID}/ApprovalRequests
        const response = await fetch(`${CONTENT_API_URL}/${template.content_sid}/ApprovalRequests`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
          },
        })

        const data = await response.json()
        console.log(`Approval status for ${template.template_name}:`, JSON.stringify(data))

        let newStatus = template.status
        let rejectionReason = null

        // Response format: { data: [{ status: "approved"|"rejected"|"pending", rejection_reason: "..." }] }
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const approval = data.data[0]
          if (approval.status === 'approved') {
            newStatus = 'approved'
          } else if (approval.status === 'rejected') {
            newStatus = 'rejected'
            rejectionReason = approval.rejection_reason || 'Rejected by Meta'
          } else if (approval.status === 'pending') {
            newStatus = 'pending'
          }
        }

        await insertLog({
          template_id: template.id,
          template_name: template.template_name,
          action: 'check_status',
          status: newStatus !== template.status ? 'success' : 'skipped',
          request_payload: { url: `${CONTENT_API_URL}/${template.content_sid}/ApprovalRequests`, method: 'GET' },
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
