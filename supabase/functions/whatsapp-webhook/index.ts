import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WhatsAppMessage {
  from: string;
  body: string;
  timestamp?: string;
  messageId?: string;
  type?: string;
  name?: string;
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          text?: { body: string };
          timestamp?: string;
          id?: string;
          type?: string;
        }>;
        contacts?: Array<{
          profile?: { name: string };
          wa_id: string;
        }>;
      };
    }>;
  }>;
  // Alternative simpler format for N8N/custom webhooks
  phone?: string;
  message?: string;
  name?: string;
  source?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // WhatsApp webhook verification (GET request)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'cb-asesoria-webhook'

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully')
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }
    
    return new Response('Verification failed', { status: 403, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const payload: WebhookPayload = await req.json()
    console.log('Received webhook:', JSON.stringify(payload))

    // Log the webhook
    await supabase.from('webhook_logs').insert({
      source: 'IA_WHATSAPP',
      raw_payload: payload,
      processed: false,
    })

    // Parse message from different formats
    let message: WhatsAppMessage | null = null

    // Format 1: WhatsApp Cloud API format
    if (payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = payload.entry[0].changes[0].value.messages[0]
      const contacts = payload.entry[0].changes[0].value.contacts
      message = {
        from: msg.from,
        body: msg.text?.body || '',
        timestamp: msg.timestamp,
        messageId: msg.id,
        type: msg.type,
        name: contacts?.[0]?.profile?.name,
      }
    }
    // Format 2: Simple format (N8N/custom integrations)
    else if (payload.phone && payload.message) {
      message = {
        from: payload.phone.replace(/\D/g, ''),
        body: payload.message,
        name: payload.name,
      }
    }

    if (!message || !message.from || !message.body) {
      console.log('No valid message found in payload')
      return new Response(
        JSON.stringify({ success: true, message: 'No message to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const phoneNumber = message.from.replace(/\D/g, '')
    console.log('Processing message from:', phoneNumber)

    // Find existing contact by phone
    let contact: { id: string; full_name: string } | null = null
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, full_name')
      .eq('phone', parseInt(phoneNumber))
      .single()

    contact = existingContact

    // If no contact, create one
    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone: parseInt(phoneNumber),
          full_name: message.name || `WhatsApp ${phoneNumber.slice(-4)}`,
          origin_channel: 'WHATSAPP',
        })
        .select('id, full_name')
        .single()

      if (contactError || !newContact) {
        console.error('Error creating contact:', contactError)
        throw contactError || new Error('Failed to create contact')
      }
      contact = newContact
    }

    // Find or create lead for this contact
    let lead: { id: string; status: string | null } | null = null
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, status')
      .eq('contact_id', contact.id)
      .not('status', 'eq', 'ARQUIVADO_SEM_RETORNO')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    lead = existingLead

    if (!lead) {
      // Create new lead
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          contact_id: contact.id,
          status: 'NOVO',
          notes: 'Lead criado automaticamente via WhatsApp',
        })
        .select('id, status')
        .single()

      if (leadError || !newLead) {
        console.error('Error creating lead:', leadError)
        throw leadError || new Error('Failed to create lead')
      }
      lead = newLead

      // Create a task for the new lead
      await supabase.from('tasks').insert({
        title: `Novo lead via WhatsApp: ${contact.full_name}`,
        description: `Mensagem inicial: ${message.body.substring(0, 200)}`,
        status: 'PENDENTE',
        related_lead_id: lead.id,
      })
    }

    // Create interaction record
    await supabase.from('interactions').insert({
      lead_id: lead.id,
      contact_id: contact.id,
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      content: message.body,
      origin_bot: false,
    })

    // Also store in mensagens_cliente for AI processing
    await supabase.from('mensagens_cliente').insert({
      id_lead: lead.id,
      phone_id: parseInt(phoneNumber),
      mensagem_cliente: message.body,
      origem: 'WHATSAPP',
    })

    // Update webhook log as processed
    await supabase
      .from('webhook_logs')
      .update({ processed: true })
      .eq('raw_payload', payload)

    // Notify assigned user or create notification for attention team
    const { data: assignedUser } = await supabase
      .from('leads')
      .select('assigned_to_user_id')
      .eq('id', lead.id)
      .single()

    if (assignedUser?.assigned_to_user_id) {
      await supabase.from('notifications').insert({
        user_id: assignedUser.assigned_to_user_id,
        title: 'Nova mensagem WhatsApp',
        message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
        type: 'whatsapp_message',
      })
    } else {
      // Notify all ATENCAO_CLIENTE users
      const { data: attentionUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'ATENCAO_CLIENTE')

      for (const user of attentionUsers || []) {
        await supabase.from('notifications').insert({
          user_id: user.user_id,
          title: 'Nova mensagem WhatsApp (não atribuído)',
          message: `${contact.full_name}: ${message.body.substring(0, 100)}...`,
          type: 'whatsapp_message',
        })
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contactId: contact.id,
        leadId: lead.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('WhatsApp webhook error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
