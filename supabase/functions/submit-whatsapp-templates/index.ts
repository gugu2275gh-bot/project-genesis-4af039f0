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
    const { action, automation_type, force } = body

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
          // Detect placeholders and generate sample values
          const placeholderRegex = /\{\{(\d+)\}\}/g
          const sampleDefaults: Record<string, string> = { '1': 'Jorge', '2': '9,99', '3': '31/12/2050' }
          const variables: Record<string, string> = {}
          let match
          while ((match = placeholderRegex.exec(template.body_text)) !== null) {
            const idx = match[1]
            variables[idx] = sampleDefaults[idx] || `exemplo_${idx}`
          }

          const contentBody: any = {
            friendly_name: template.template_name,
            language: template.language || 'pt_BR',
            types: {
              'twilio/text': {
                body: template.body_text,
              },
            },
            content_type: 'twilio/text',
          }

          if (Object.keys(variables).length > 0) {
            contentBody.variables = variables
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
            await adminSupabase.from('whatsapp_templates').update({
              status: 'error',
              rejection_reason: responseData.message || JSON.stringify(responseData),
              updated_at: new Date().toISOString(),
            }).eq('id', template.id)

            results.push({ automation_type: template.automation_type, status: 'error', error: responseData.message || 'Content creation failed' })
            continue
          }

          contentSid = responseData.sid

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

    // ACTION: check_status — checks ALL templates with content_sid (not just pending)
    if (action === 'check_status') {
      let query = adminSupabase
        .from('whatsapp_templates')
        .select('*')
        .not('content_sid', 'is', null)

      // By default, skip already approved unless force=true
      if (!force) {
        query = query.neq('status', 'approved')
      }

      const { data: templates } = await query

      const results = []
      for (const template of templates || []) {
        try {
          // GET /v1/Content/{SID}/ApprovalRequests
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

          // Response format: { data: [{ status: "approved"|"rejected"|"pending"|"paused"|"disabled"|"received"|"unsubmitted", rejection_reason: "..." }] }
          if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const approval = data.data[0]
            const mappedStatus = approval.status || 'unknown'
            if (['approved', 'rejected', 'pending', 'paused', 'disabled', 'received', 'unsubmitted'].includes(mappedStatus)) {
              newStatus = mappedStatus
            }
            if (mappedStatus === 'rejected') {
              rejectionReason = approval.rejection_reason || 'Rejected by Meta'
            }
          } else if (response.ok && (!data.data || data.data.length === 0)) {
            // No approval request found — template was never submitted for approval
            newStatus = 'unsubmitted'
          }

          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'check_status',
            status: newStatus !== template.status ? 'updated' : 'no_change',
            request_payload: { url: `${CONTENT_API_URL}/${template.content_sid}/ApprovalRequests`, method: 'GET' },
            response_payload: data,
            error_message: rejectionReason,
            twilio_status_code: response.status,
            content_sid: template.content_sid,
          })

          if (newStatus !== template.status) {
            const updateData: any = {
              status: newStatus,
              rejection_reason: rejectionReason,
              updated_at: new Date().toISOString(),
            }
            // Auto-activate approved templates
            if (newStatus === 'approved') {
              updateData.is_active = true
            }
            await adminSupabase.from('whatsapp_templates').update(updateData).eq('id', template.id)
          }

          results.push({
            template_name: template.template_name,
            automation_type: template.automation_type,
            previous_status: template.status,
            current_status: newStatus,
            content_sid: template.content_sid,
            changed: newStatus !== template.status,
          })
        } catch (err) {
          console.error(`Error checking status for ${template.template_name}:`, err)
          results.push({
            template_name: template.template_name,
            automation_type: template.automation_type,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: sync_from_twilio — List all Content Templates from Twilio and sync with DB
    if (action === 'sync_from_twilio') {
      console.log('Starting sync_from_twilio...')

      // Step 1: List all content templates from Twilio
      const listResponse = await fetch(`${CONTENT_API_URL}?PageSize=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
        },
      })

      const listData = await listResponse.json()
      console.log(`Twilio returned ${listData.contents?.length || 0} content templates`)

      if (!listResponse.ok) {
        return new Response(JSON.stringify({ error: 'Failed to list Twilio content templates', details: listData }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const twilioTemplates = listData.contents || []

      // Step 2: Get all templates from DB
      const { data: dbTemplates } = await adminSupabase.from('whatsapp_templates').select('*')

      const results = []
      let matched = 0
      let updated = 0
      let unmatched = 0

      for (const twilioTpl of twilioTemplates) {
        const friendlyName = twilioTpl.friendly_name
        const sid = twilioTpl.sid

        // Find matching DB template by template_name = friendly_name
        const dbMatch = dbTemplates?.find(db => db.template_name === friendlyName)

        if (!dbMatch) {
          unmatched++
          results.push({ friendly_name: friendlyName, sid, status: 'no_db_match' })
          continue
        }

        matched++

        // Check approval status for this SID
        let approvalStatus = 'unknown'
        let rejectionReason = null
        try {
          const approvalResponse = await fetch(`${CONTENT_API_URL}/${sid}/ApprovalRequests`, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${basicAuth}` },
          })
          const approvalData = await approvalResponse.json()

          if (approvalData.data && Array.isArray(approvalData.data) && approvalData.data.length > 0) {
            approvalStatus = approvalData.data[0].status || 'unknown'
            rejectionReason = approvalData.data[0].rejection_reason || null
          } else {
            approvalStatus = 'not_submitted'
          }
        } catch (e) {
          console.error(`Error checking approval for ${friendlyName}:`, e)
          approvalStatus = 'error'
        }

        // Update DB if needed
        const needsUpdate = dbMatch.content_sid !== sid || dbMatch.status !== approvalStatus
        if (needsUpdate && approvalStatus !== 'unknown' && approvalStatus !== 'error') {
          const updateData: any = {
            content_sid: sid,
            status: approvalStatus,
            rejection_reason: rejectionReason,
            updated_at: new Date().toISOString(),
          }
          if (approvalStatus === 'approved') {
            updateData.is_active = true
          }
          await adminSupabase.from('whatsapp_templates').update(updateData).eq('id', dbMatch.id)
          updated++
        }

        results.push({
          template_name: friendlyName,
          sid,
          db_status: dbMatch.status,
          twilio_status: approvalStatus,
          updated: needsUpdate && approvalStatus !== 'unknown' && approvalStatus !== 'error',
        })

        await insertLog({
          template_id: dbMatch.id,
          template_name: friendlyName,
          action: 'sync_from_twilio',
          status: needsUpdate ? 'updated' : 'no_change',
          request_payload: { friendly_name: friendlyName, sid },
          response_payload: { approval_status: approvalStatus },
          content_sid: sid,
        })
      }

      return new Response(JSON.stringify({
        success: true,
        summary: { total_twilio: twilioTemplates.length, matched, updated, unmatched },
        results,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ACTION: force_resubmit — Delete old content, recreate with samples, resubmit all
    if (action === 'force_resubmit') {
      console.log('Starting force_resubmit...')
      const { data: templates, error: fetchError } = await adminSupabase.from('whatsapp_templates').select('*')
      if (fetchError) throw fetchError

      const results = []
      for (const template of templates || []) {
        try {
          // Step 1: Delete old content from Twilio if exists
          if (template.content_sid) {
            console.log(`Deleting old content ${template.content_sid} for ${template.template_name}`)
            const deleteResponse = await fetch(`${CONTENT_API_URL}/${template.content_sid}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Basic ${basicAuth}` },
            })
            console.log(`Delete response for ${template.template_name}: ${deleteResponse.status}`)

            await insertLog({
              template_id: template.id,
              template_name: template.template_name,
              action: 'force_delete',
              status: deleteResponse.ok || deleteResponse.status === 404 ? 'success' : 'error',
              request_payload: { url: `${CONTENT_API_URL}/${template.content_sid}`, method: 'DELETE' },
              twilio_status_code: deleteResponse.status,
              content_sid: template.content_sid,
            })

            // Clear content_sid in DB
            await adminSupabase.from('whatsapp_templates').update({
              content_sid: null,
              updated_at: new Date().toISOString(),
            }).eq('id', template.id)
          }

          // Step 2: Create new Content Template with sample values
          const placeholderRegex = /\{\{(\d+)\}\}/g
          const sampleDefaults: Record<string, string> = { '1': 'Jorge', '2': '9,99', '3': '31/12/2050' }
          const variables: Record<string, string> = {}
          let match
          while ((match = placeholderRegex.exec(template.body_text)) !== null) {
            const idx = match[1]
            variables[idx] = sampleDefaults[idx] || `exemplo_${idx}`
          }

          const contentBody: any = {
            friendly_name: template.template_name,
            language: template.language || 'pt_BR',
            types: {
              'twilio/text': {
                body: template.body_text,
              },
            },
            content_type: 'twilio/text',
          }

          if (Object.keys(variables).length > 0) {
            contentBody.variables = variables
          }

          console.log(`Creating new content for ${template.template_name}`)
          const createResponse = await fetch(CONTENT_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${basicAuth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(contentBody),
          })

          const createData = await createResponse.json()
          console.log(`Create response for ${template.template_name}: ${createResponse.status}`, JSON.stringify(createData))

          await insertLog({
            template_id: template.id,
            template_name: template.template_name,
            action: 'force_create',
            status: createResponse.ok ? 'success' : 'error',
            request_payload: contentBody,
            response_payload: createData,
            error_message: createResponse.ok ? null : (createData.message || JSON.stringify(createData)),
            twilio_status_code: createResponse.status,
            content_sid: createData.sid || null,
          })

          if (!createResponse.ok || !createData.sid) {
            await adminSupabase.from('whatsapp_templates').update({
              status: 'error',
              rejection_reason: createData.message || JSON.stringify(createData),
              updated_at: new Date().toISOString(),
            }).eq('id', template.id)
            results.push({ template_name: template.template_name, status: 'error', error: createData.message || 'Creation failed' })
            continue
          }

          const newSid = createData.sid

          // Step 3: Submit for Meta approval
          const approvalResult = await submitApprovalRequest(template, newSid)

          const finalStatus = approvalResult.success ? 'pending' : 'error'
          await adminSupabase.from('whatsapp_templates').update({
            content_sid: newSid,
            status: finalStatus,
            rejection_reason: approvalResult.success ? null : `Aprovação falhou: ${approvalResult.error}`,
            is_active: false,
            updated_at: new Date().toISOString(),
          }).eq('id', template.id)

          results.push({
            template_name: template.template_name,
            status: approvalResult.success ? 'submitted' : 'error',
            content_sid: newSid,
            error: approvalResult.success ? undefined : approvalResult.error,
          })
        } catch (err) {
          console.error(`Error force_resubmit for ${template.template_name}:`, err)
          results.push({
            template_name: template.template_name,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      const submitted = results.filter(r => r.status === 'submitted').length
      const errors = results.filter(r => r.status === 'error').length
      return new Response(JSON.stringify({ success: true, summary: { total: results.length, submitted, errors }, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "submit", "check_status", "sync_from_twilio", or "force_resubmit"' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
