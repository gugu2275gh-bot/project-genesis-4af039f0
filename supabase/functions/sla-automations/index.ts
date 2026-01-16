import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SLAConfig {
  key: string;
  value: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const results = {
      welcomeMessages: 0,
      reengagements: 0,
      archived: 0,
      contractReminders: 0,
      paymentReminders: 0,
    }

    // Fetch SLA configurations
    const { data: slaConfigs } = await supabase
      .from('system_config')
      .select('key, value')
      .like('key', 'sla_%')

    const slaMap: Record<string, number> = {
      sla_welcome_message_minutes: 15,
      sla_incomplete_data_reengagement_days: 1,
      sla_no_response_archive_days: 3,
      sla_contract_signature_reminder_1_days: 2,
      sla_contract_signature_reminder_2_days: 5,
      sla_payment_reminder_1_days: 1,
      sla_payment_reminder_2_days: 3,
    }

    slaConfigs?.forEach((config: SLAConfig) => {
      if (config.value) {
        slaMap[config.key] = parseInt(config.value)
      }
    })

    // Fetch message templates
    const { data: templates } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'template_welcome_message',
        'template_reengagement_message',
        'template_contract_reminder',
        'template_payment_reminder'
      ])

    const templateMap: Record<string, string> = {
      template_welcome_message: 'Olá {name}! Obrigado por entrar em contato com CB Asesoría. Em breve um de nossos especialistas irá atendê-lo. Como podemos ajudá-lo hoje?',
      template_reengagement_message: 'Olá {name}! Notamos que seu cadastro está incompleto. Podemos ajudá-lo a completar suas informações para dar continuidade ao atendimento?',
      template_contract_reminder: 'Olá {name}! Seu contrato está aguardando assinatura. Acesse o portal para finalizar o processo.',
      template_payment_reminder: 'Olá {name}! Você tem um pagamento pendente de {amount} {currency}. Acesse o portal para realizar o pagamento.',
    }

    templates?.forEach((t: { key: string; value: string | null }) => {
      if (t.value) templateMap[t.key] = t.value
    })

    // 1. WELCOME MESSAGES - New leads without welcome message
    const welcomeDeadline = new Date(now.getTime() - slaMap.sla_welcome_message_minutes * 60 * 1000)
    const { data: newLeads } = await supabase
      .from('leads')
      .select(`
        id,
        created_at,
        contacts!inner (
          id,
          full_name,
          phone
        )
      `)
      .eq('status', 'NOVO')
      .lt('created_at', welcomeDeadline.toISOString())

    for (const lead of newLeads || []) {
      const contactData = lead.contacts as unknown as { id: string; full_name: string; phone: number | null }
      
      // Check if welcome message already sent
      const { data: existingInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'OUTBOUND')
        .limit(1)
        .single()

      if (!existingInteraction && contactData.phone) {
        const message = templateMap.template_welcome_message.replace('{name}', contactData.full_name)

        // Create interaction record
        await supabase.from('interactions').insert({
          lead_id: lead.id,
          contact_id: contactData.id,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          content: message,
          origin_bot: true,
        })

        // Call send-whatsapp function (if configured)
        try {
          await supabase.functions.invoke('send-whatsapp', {
            body: { mensagem: message, numero: String(contactData.phone) }
          })
        } catch (e) {
          console.log('WhatsApp send skipped or failed:', e)
        }

        results.welcomeMessages++
      }
    }

    // 2. REENGAGEMENT - Leads with incomplete data
    const reengagementDeadline = new Date(
      now.getTime() - slaMap.sla_incomplete_data_reengagement_days * 24 * 60 * 60 * 1000
    )
    const { data: incompleteLeads } = await supabase
      .from('leads')
      .select(`
        id,
        updated_at,
        contacts!inner (
          id,
          full_name,
          phone
        )
      `)
      .eq('status', 'DADOS_INCOMPLETOS')
      .lt('updated_at', reengagementDeadline.toISOString())

    for (const lead of incompleteLeads || []) {
      const contactData = lead.contacts as unknown as { id: string; full_name: string; phone: number | null }

      // Check if reengagement already sent in last 24h
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const { data: recentInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('origin_bot', true)
        .gt('created_at', last24h.toISOString())
        .limit(1)
        .single()

      if (!recentInteraction && contactData.phone) {
        const message = templateMap.template_reengagement_message.replace('{name}', contactData.full_name)

        await supabase.from('interactions').insert({
          lead_id: lead.id,
          contact_id: contactData.id,
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          content: message,
          origin_bot: true,
        })

        try {
          await supabase.functions.invoke('send-whatsapp', {
            body: { mensagem: message, numero: String(contactData.phone) }
          })
        } catch (e) {
          console.log('WhatsApp send skipped or failed:', e)
        }

        results.reengagements++
      }
    }

    // 3. AUTO-ARCHIVE - Leads without response
    const archiveDeadline = new Date(
      now.getTime() - slaMap.sla_no_response_archive_days * 24 * 60 * 60 * 1000
    )
    const { data: staleLeads } = await supabase
      .from('leads')
      .select('id, updated_at')
      .in('status', ['NOVO', 'DADOS_INCOMPLETOS', 'INTERESSE_PENDENTE'])
      .lt('updated_at', archiveDeadline.toISOString())

    for (const lead of staleLeads || []) {
      // Check for any inbound interactions
      const { data: inboundInteraction } = await supabase
        .from('interactions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('direction', 'INBOUND')
        .gt('created_at', archiveDeadline.toISOString())
        .limit(1)
        .single()

      if (!inboundInteraction) {
        await supabase
          .from('leads')
          .update({ status: 'ARQUIVADO_SEM_RETORNO' })
          .eq('id', lead.id)

        results.archived++
      }
    }

    // 4. CONTRACT REMINDERS
    const contractReminder1 = new Date(
      now.getTime() - slaMap.sla_contract_signature_reminder_1_days * 24 * 60 * 60 * 1000
    )
    const { data: pendingContracts } = await supabase
      .from('contracts')
      .select(`
        id,
        created_at,
        opportunities!inner (
          id,
          leads!inner (
            id,
            contacts!inner (
              full_name,
              phone
            )
          )
        )
      `)
      .eq('status', 'ENVIADO')
      .lt('created_at', contractReminder1.toISOString())

    for (const contract of pendingContracts || []) {
      const opportunityData = contract.opportunities as unknown as {
        id: string;
        leads: { id: string; contacts: { full_name: string; phone: number | null } }
      }
      const contactData = opportunityData.leads?.contacts

      if (contactData?.phone) {
        // Create notification
        const { data: clientCase } = await supabase
          .from('service_cases')
          .select('client_user_id')
          .eq('opportunity_id', opportunityData.id)
          .single()

        if (clientCase?.client_user_id) {
          await supabase.from('notifications').insert({
            user_id: clientCase.client_user_id,
            title: 'Lembrete: Contrato pendente de assinatura',
            message: 'Por favor, acesse o portal para assinar seu contrato.',
            type: 'contract_reminder',
          })
        }

        results.contractReminders++
      }
    }

    // 5. PAYMENT REMINDERS
    const paymentReminder1 = new Date(
      now.getTime() - slaMap.sla_payment_reminder_1_days * 24 * 60 * 60 * 1000
    )
    const { data: pendingPayments } = await supabase
      .from('payments')
      .select(`
        id,
        created_at,
        amount,
        currency,
        opportunities!inner (
          id,
          leads!inner (
            id,
            contacts!inner (
              full_name,
              phone
            )
          )
        )
      `)
      .eq('status', 'PENDENTE')
      .lt('created_at', paymentReminder1.toISOString())

    for (const payment of pendingPayments || []) {
      const opportunityData = payment.opportunities as unknown as {
        id: string;
        leads: { id: string; contacts: { full_name: string; phone: number | null } }
      }
      const contactData = opportunityData.leads?.contacts

      if (contactData?.phone) {
        // Create notification
        const { data: clientCase } = await supabase
          .from('service_cases')
          .select('client_user_id')
          .eq('opportunity_id', opportunityData.id)
          .single()

        if (clientCase?.client_user_id) {
          await supabase.from('notifications').insert({
            user_id: clientCase.client_user_id,
            title: 'Lembrete: Pagamento pendente',
            message: `Você tem um pagamento de ${payment.amount} ${payment.currency || 'EUR'} pendente.`,
            type: 'payment_reminder',
          })
        }

        results.paymentReminders++
      }
    }

    console.log('SLA Automations completed:', results)

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        processedAt: now.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('SLA Automations error:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
